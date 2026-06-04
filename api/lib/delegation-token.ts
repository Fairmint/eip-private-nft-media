import { createHmac, timingSafeEqual } from "node:crypto";

import { getAddress, isAddressEqual, type Address } from "viem";

import type {
  DelegationVerifier,
  PrivateMediaResource,
} from "../../src/index.js";
import { demoSecret } from "./config.js";

export type DemoDelegationGrant = {
  account: Address;
  chainId: number;
  contract: Address;
  delegate: Address;
  expiresAt: string;
  resourceUri: string;
  tokenId: string;
  version: 1;
};

export function createDelegationToken(grant: DemoDelegationGrant): string {
  const payload = encode(JSON.stringify(grant));
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

export function createTokenDelegationVerifier(
  token: string | undefined,
): DelegationVerifier {
  return {
    async verifyDelegation(input) {
      if (!token) return false;
      const grant = parseDelegationToken(token);
      if (
        !grant ||
        new Date(grant.expiresAt).getTime() <= input.now.getTime()
      ) {
        return false;
      }

      return (
        isAddressEqual(grant.delegate, input.delegate) &&
        isAddressEqual(grant.account, input.delegator) &&
        grant.chainId === input.resource.chainId &&
        isAddressEqual(grant.contract, input.resource.contract) &&
        grant.tokenId === input.resource.tokenId &&
        grant.resourceUri === input.resource.privateMediaUri
      );
    },
  };
}

export function parseDelegationToken(
  token: string,
): DemoDelegationGrant | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !verify(payload, signature)) return null;

  let parsed: Partial<DemoDelegationGrant>;
  try {
    parsed = JSON.parse(decode(payload)) as Partial<DemoDelegationGrant>;
  } catch {
    return null;
  }
  if (
    parsed.version !== 1 ||
    !parsed.account ||
    typeof parsed.chainId !== "number" ||
    !parsed.contract ||
    !parsed.delegate ||
    typeof parsed.expiresAt !== "string" ||
    typeof parsed.resourceUri !== "string" ||
    typeof parsed.tokenId !== "string"
  ) {
    return null;
  }

  return {
    account: getAddress(parsed.account),
    chainId: parsed.chainId,
    contract: getAddress(parsed.contract),
    delegate: getAddress(parsed.delegate),
    expiresAt: parsed.expiresAt,
    resourceUri: parsed.resourceUri,
    tokenId: parsed.tokenId,
    version: 1,
  };
}

export function delegationGrantFromResource(input: {
  delegate: Address;
  expiresAt: Date;
  resource: PrivateMediaResource;
}): DemoDelegationGrant {
  return {
    account: input.resource.account,
    chainId: input.resource.chainId,
    contract: input.resource.contract,
    delegate: input.delegate,
    expiresAt: input.expiresAt.toISOString(),
    resourceUri: input.resource.privateMediaUri,
    tokenId: input.resource.tokenId,
    version: 1,
  };
}

function sign(payload: string): string {
  return createHmac("sha256", delegationSecret())
    .update(payload)
    .digest("base64url");
}

function verify(payload: string, signature: string): boolean {
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function delegationSecret(): string {
  return demoSecret("DEMO_DELEGATION_SECRET");
}
