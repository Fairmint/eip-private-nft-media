import { getAddress, isAddressEqual, verifyMessage, type Address } from "viem";
import { parseSiweMessage } from "viem/siwe";

import {
  assertHttpsPrivateMediaUri,
  resourcesIncludeBinding,
} from "./resource-binding.js";
import {
  AuthorizationError,
  type AuthorizationResult,
  type PrivateMediaResource,
  type VerificationRequest,
} from "./types.js";

export async function verifyPrivateMediaAuthorization(
  request: VerificationRequest,
): Promise<AuthorizationResult> {
  const now = request.now ?? new Date();
  assertHttpsPrivateMediaUri(request.resource.privateMediaUri);
  const expectedUri = request.resource.privateMediaUri;
  const expectedHost = new URL(expectedUri).host;

  const parsed = parseSiwe(request.proof.message);
  const subject = getAddress(parsed.address);

  await verifySignature({
    subject,
    message: request.proof.message,
    signature: request.proof.signature,
    chainId: request.resource.chainId,
    request,
  });

  assertEqual(
    parsed.domain,
    expectedHost,
    "domain_mismatch",
    "SIWE domain mismatch",
  );
  assertEqual(
    parsed.uri,
    expectedUri,
    "uri_mismatch",
    "SIWE uri must match the requested URI",
  );
  assertEqual(
    parsed.chainId,
    request.resource.chainId,
    "chain_mismatch",
    "SIWE chain-id mismatch",
  );

  if (!parsed.expirationTime) {
    throw new AuthorizationError(
      "missing_expiration",
      "SIWE expiration-time is required",
    );
  }

  if (parsed.expirationTime.getTime() <= now.getTime()) {
    throw new AuthorizationError("expired_message", "SIWE message has expired");
  }

  if (parsed.notBefore && parsed.notBefore.getTime() > now.getTime()) {
    throw new AuthorizationError("not_before", "SIWE message is not valid yet");
  }

  if (!resourcesIncludeBinding(parsed.resources, request.resource)) {
    throw new AuthorizationError(
      "resource_binding_mismatch",
      "SIWE resources do not bind to the requested private media resource",
    );
  }

  await assertAuthorizedSubject(subject, request.resource, request, now);

  // Consume only after all checks pass so failed attempts do not burn a challenge.
  await request.nonceStore.consumeNonce({
    domain: parsed.domain,
    nonce: parsed.nonce,
    now,
  });

  return {
    subject,
    resource: request.resource,
  };
}

async function verifySignature(input: {
  subject: Address;
  message: string;
  signature: `0x${string}`;
  chainId: number;
  request: VerificationRequest;
}): Promise<void> {
  // EOAs verify directly; contract accounts fall back to the caller's EIP-1271 hook.
  const isEoaSignature = await safeVerifyMessage(input);

  if (isEoaSignature) return;

  const isContractSignature = await safeVerifyEip1271Signature(input);

  if (!isContractSignature) {
    throw new AuthorizationError(
      "invalid_signature",
      "SIWE signature is not valid for the claimed address",
    );
  }
}

async function safeVerifyEip1271Signature(input: {
  subject: Address;
  message: string;
  signature: `0x${string}`;
  chainId: number;
  request: VerificationRequest;
}): Promise<boolean> {
  try {
    return (
      (await input.request.chainReader.isValidEip1271Signature?.({
        chainId: input.chainId,
        address: input.subject,
        message: input.message,
        signature: input.signature,
      })) ?? false
    );
  } catch {
    return false;
  }
}

async function safeVerifyMessage(input: {
  subject: Address;
  message: string;
  signature: `0x${string}`;
}): Promise<boolean> {
  try {
    return await verifyMessage({
      address: input.subject,
      message: input.message,
      signature: input.signature,
    });
  } catch {
    return false;
  }
}

async function assertAuthorizedSubject(
  subject: Address,
  resource: PrivateMediaResource,
  request: VerificationRequest,
  now: Date,
): Promise<void> {
  if (resource.standard === "erc721") {
    await assertErc721AuthorizedSubject(subject, resource, request, now);
    return;
  }

  await assertErc1155AuthorizedSubject(subject, resource, request, now);
}

async function assertErc721AuthorizedSubject(
  subject: Address,
  resource: PrivateMediaResource,
  request: VerificationRequest,
  now: Date,
): Promise<void> {
  const owner = await request.chainReader.ownerOf({
    chainId: resource.chainId,
    contract: resource.contract,
    tokenId: resource.tokenId,
  });

  if (!isAddressEqual(owner, resource.account)) {
    throw new AuthorizationError(
      "erc721_account_mismatch",
      "ERC-721 bound account must be the current owner",
    );
  }

  if (isAddressEqual(subject, owner)) return;

  if (request.chainReader.getApproved) {
    const approved = await request.chainReader.getApproved({
      chainId: resource.chainId,
      contract: resource.contract,
      tokenId: resource.tokenId,
    });
    if (approved && isAddressEqual(subject, approved)) return;
  }

  if (request.chainReader.isApprovedForAll) {
    const isOperator = await request.chainReader.isApprovedForAll({
      chainId: resource.chainId,
      contract: resource.contract,
      account: owner,
      operator: subject,
    });
    if (isOperator) return;
  }

  if (
    request.delegationVerifier &&
    (await isDelegated(subject, owner, resource, request, now))
  ) {
    return;
  }

  throw new AuthorizationError(
    "unauthorized",
    "signer is not authorized for this ERC-721 token",
  );
}

async function assertErc1155AuthorizedSubject(
  subject: Address,
  resource: PrivateMediaResource,
  request: VerificationRequest,
  now: Date,
): Promise<void> {
  const balance = await request.chainReader.balanceOf({
    chainId: resource.chainId,
    contract: resource.contract,
    tokenId: resource.tokenId,
    account: resource.account,
  });

  if (balance <= 0n) {
    throw new AuthorizationError(
      "erc1155_zero_balance",
      "ERC-1155 bound account must have positive balance",
    );
  }

  if (isAddressEqual(subject, resource.account)) return;

  if (request.chainReader.isApprovedForAll) {
    const isOperator = await request.chainReader.isApprovedForAll({
      chainId: resource.chainId,
      contract: resource.contract,
      account: resource.account,
      operator: subject,
    });
    if (isOperator) return;
  }

  if (
    request.delegationVerifier &&
    (await isDelegated(subject, resource.account, resource, request, now))
  ) {
    return;
  }

  throw new AuthorizationError(
    "unauthorized",
    "signer is not authorized for this ERC-1155 token",
  );
}

async function isDelegated(
  delegate: Address,
  delegator: Address,
  resource: PrivateMediaResource,
  request: VerificationRequest,
  now: Date,
): Promise<boolean> {
  return (
    (await request.delegationVerifier?.verifyDelegation({
      delegate,
      delegator,
      resource,
      now,
    })) ?? false
  );
}

function parseSiwe(message: string): {
  address: Address;
  chainId: number;
  domain: string;
  expirationTime: Date | undefined;
  nonce: string;
  notBefore: Date | undefined;
  resources: string[] | undefined;
  uri: string;
} {
  let parsed: ReturnType<typeof parseSiweMessage>;

  try {
    parsed = parseSiweMessage(message);
  } catch (error) {
    throw new AuthorizationError(
      "invalid_siwe_message",
      error instanceof Error ? error.message : "invalid SIWE message",
    );
  }

  if (
    !parsed.address ||
    !parsed.domain ||
    !parsed.uri ||
    !parsed.chainId ||
    !parsed.nonce ||
    parsed.version !== "1"
  ) {
    throw new AuthorizationError(
      "invalid_siwe_message",
      "SIWE message is missing required fields",
    );
  }

  return {
    address: parsed.address,
    chainId: parsed.chainId,
    domain: parsed.domain,
    expirationTime: parsed.expirationTime,
    nonce: parsed.nonce,
    notBefore: parsed.notBefore,
    resources: parsed.resources,
    uri: parsed.uri,
  };
}

function assertEqual<T>(
  actual: T,
  expected: T,
  code: ConstructorParameters<typeof AuthorizationError>[0],
  message: string,
): void {
  if (actual !== expected) throw new AuthorizationError(code, message);
}
