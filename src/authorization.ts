import { getAddress, isAddressEqual, type Address } from "viem";
import { SiweMessage, type SiweResponse } from "siwe";

import {
  assertHttpsPrivateMediaUri,
  challengeNonceScope,
  resourcesMatchExpectedBinding,
} from "./resource-binding.js";
import {
  AuthorizationError,
  type AuthorizationResult,
  type PrivateMediaResource,
  type TokenPrivateMediaResource,
  type VerificationRequest,
} from "./types.js";

export async function verifyPrivateMediaAuthorization(
  request: VerificationRequest,
): Promise<AuthorizationResult> {
  const now = request.now ?? new Date();
  assertHttpsPrivateMediaUri(request.resource.privateMediaUri);
  const expectedUri = request.resource.privateMediaUri;
  const expectedHost = new URL(expectedUri).host.toLowerCase();

  if (request.resource.form === "policy" && !request.policyEvaluator) {
    throw new AuthorizationError(
      "unauthorized",
      "policyEvaluator is required for policy-form bindings",
    );
  }

  const parsed = parseSiwe(request.proof.message);
  const subject = getAddress(parsed.address);
  const expirationTime = siweDate(parsed.expirationTime);
  const notBefore = siweDate(parsed.notBefore);

  assertEqual(
    parsed.domain.toLowerCase(),
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

  if (!expirationTime) {
    throw new AuthorizationError(
      "missing_expiration",
      "SIWE expiration-time is required",
    );
  }

  if (expirationTime.getTime() <= now.getTime()) {
    throw new AuthorizationError("expired_message", "SIWE message has expired");
  }

  if (notBefore && notBefore.getTime() > now.getTime()) {
    throw new AuthorizationError("not_before", "SIWE message is not valid yet");
  }

  if (!resourcesMatchExpectedBinding(parsed.resources, request.resource)) {
    throw new AuthorizationError(
      "resource_binding_mismatch",
      "SIWE resources do not bind to the requested private media resource",
    );
  }

  await verifySignature({
    parsed,
    signature: request.proof.signature,
    chainId: request.resource.chainId,
    request,
    now,
  });

  await assertAuthorizedSubject(subject, request.resource, request, now);

  // Consume only after all checks pass so failed attempts do not burn a challenge.
  await request.nonceStore.consumeNonce({
    domain: parsed.domain.toLowerCase(),
    nonce: parsed.nonce,
    now,
    scope: challengeNonceScope(request.resource),
  });

  return {
    subject,
    resource: request.resource,
  };
}

async function verifySignature(input: {
  parsed: SiweMessage;
  signature: `0x${string}`;
  chainId: number;
  request: VerificationRequest;
  now: Date;
}): Promise<void> {
  const result = await input.parsed.verify(
    {
      domain: input.parsed.domain,
      signature: input.signature,
      time: input.now.toISOString(),
    },
    {
      suppressExceptions: true,
      verificationFallback: async () => fallbackEip1271Verification(input),
    },
  );

  if (!result.success) {
    throw new AuthorizationError(
      "invalid_signature",
      "SIWE signature is not valid for the claimed address",
    );
  }
}

async function fallbackEip1271Verification(input: {
  parsed: SiweMessage;
  signature: `0x${string}`;
  chainId: number;
  request: VerificationRequest;
}): Promise<SiweResponse> {
  try {
    const success =
      (await input.request.chainReader.isValidEip1271Signature?.({
        chainId: input.chainId,
        address: getAddress(input.parsed.address),
        message: input.parsed.prepareMessage(),
        signature: input.signature,
      })) ?? false;

    return { success, data: input.parsed };
  } catch {
    return { success: false, data: input.parsed };
  }
}

async function assertAuthorizedSubject(
  subject: Address,
  resource: PrivateMediaResource,
  request: VerificationRequest,
  now: Date,
): Promise<void> {
  if (resource.form === "policy") {
    await assertPolicyAuthorizedSubject(subject, resource, request, now);
    return;
  }

  if (resource.standard === "erc721") {
    await assertErc721AuthorizedSubject(subject, resource, request, now);
    return;
  }

  await assertErc1155AuthorizedSubject(subject, resource, request, now);
}

async function assertPolicyAuthorizedSubject(
  subject: Address,
  resource: Extract<PrivateMediaResource, { form: "policy" }>,
  request: VerificationRequest,
  now: Date,
): Promise<void> {
  const allowed = await request.policyEvaluator!.evaluatePolicy({
    policyId: resource.policyId,
    account: resource.account,
    privateMediaUri: resource.privateMediaUri,
    now,
  });

  if (!allowed) {
    throw new AuthorizationError(
      "policy_denied",
      "policy evaluation denied access for the bound account",
    );
  }

  if (isAddressEqual(subject, resource.account)) return;

  if (
    request.delegationVerifier &&
    (await isDelegated(subject, resource.account, resource, request, now))
  ) {
    return;
  }

  throw new AuthorizationError(
    "unauthorized",
    "signer is not authorized for this policy-form resource",
  );
}

async function assertErc721AuthorizedSubject(
  subject: Address,
  resource: TokenPrivateMediaResource,
  request: VerificationRequest,
  now: Date,
): Promise<void> {
  const owner = await request.chainReader.ownerOf({
    chainId: resource.chainId,
    contract: resource.contract,
    tokenId: resource.tokenId,
  });

  // Bound account must be the current owner before any getApproved check.
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
  resource: TokenPrivateMediaResource,
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

function parseSiwe(message: string): SiweMessage {
  let parsed: SiweMessage;

  try {
    parsed = new SiweMessage(message);
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

  return parsed;
}

function siweDate(value: string | undefined): Date | undefined {
  return value ? new Date(value) : undefined;
}

function assertEqual<T>(
  actual: T,
  expected: T,
  code: ConstructorParameters<typeof AuthorizationError>[0],
  message: string,
): void {
  if (actual !== expected) throw new AuthorizationError(code, message);
}
