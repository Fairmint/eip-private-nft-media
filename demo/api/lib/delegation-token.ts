import { sign, verify } from "hono/jwt";
import { getAddress, isAddressEqual, type Address } from "viem";

import {
  isTokenPrivateMediaResource,
  type DelegationVerifier,
  type PrivateMediaResource,
  type TokenPrivateMediaResource,
} from "../../../src/index.js";
import { demoSecret } from "./config.js";

export type DemoDelegationGrant = {
  account: Address;
  chainId: number;
  contract: Address;
  delegate: Address;
  exp: number;
  resourceUri: string;
  /** Present for erc721/erc1155 grants; omitted for erc20. */
  tokenId?: string;
  /** Present for erc1155/erc20 grants; omitted for erc721. */
  minAmount?: string;
  version: 1;
};

export async function createDelegationToken(
  grant: DemoDelegationGrant,
): Promise<string> {
  return sign(grant, delegationSecret(), "HS256");
}

export function createTokenDelegationVerifier(
  token: string | undefined,
): DelegationVerifier {
  return {
    async verifyDelegation(input) {
      if (!token) return false;
      if (!isTokenPrivateMediaResource(input.resource)) return false;
      const grant = await parseDelegationToken(token);
      if (!grant || grant.exp * 1000 <= input.now.getTime()) return false;

      return (
        isAddressEqual(grant.delegate, input.delegate) &&
        isAddressEqual(grant.account, input.delegator) &&
        grant.chainId === input.resource.chainId &&
        isAddressEqual(grant.contract, input.resource.contract) &&
        grant.tokenId === input.resource.tokenId &&
        grant.minAmount === input.resource.minAmount &&
        grant.resourceUri === input.resource.privateMediaUri
      );
    },
  };
}

export function parseDelegationToken(
  token: string,
): Promise<DemoDelegationGrant | null> {
  return parseJwt(token);
}

async function parseJwt(token: string): Promise<DemoDelegationGrant | null> {
  let parsed: Record<string, unknown>;
  try {
    parsed = (await verify(token, delegationSecret(), "HS256")) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
  if (
    parsed.version !== 1 ||
    typeof parsed.account !== "string" ||
    typeof parsed.chainId !== "number" ||
    typeof parsed.contract !== "string" ||
    typeof parsed.delegate !== "string" ||
    typeof parsed.exp !== "number" ||
    typeof parsed.resourceUri !== "string" ||
    (parsed.tokenId !== undefined && typeof parsed.tokenId !== "string") ||
    (parsed.minAmount !== undefined && typeof parsed.minAmount !== "string")
  ) {
    return null;
  }

  return {
    account: getAddress(parsed.account),
    chainId: parsed.chainId,
    contract: getAddress(parsed.contract),
    delegate: getAddress(parsed.delegate),
    exp: parsed.exp,
    resourceUri: parsed.resourceUri,
    ...(typeof parsed.tokenId === "string" ? { tokenId: parsed.tokenId } : {}),
    ...(typeof parsed.minAmount === "string"
      ? { minAmount: parsed.minAmount }
      : {}),
    version: 1,
  };
}

export function delegationGrantFromResource(input: {
  delegate: Address;
  expiresAt: Date;
  resource: PrivateMediaResource;
}): DemoDelegationGrant {
  if (!isTokenPrivateMediaResource(input.resource)) {
    throw new Error("demo delegations require a token-form resource binding");
  }
  return delegationGrantFromTokenResource({
    delegate: input.delegate,
    expiresAt: input.expiresAt,
    resource: input.resource,
  });
}

function delegationGrantFromTokenResource(input: {
  delegate: Address;
  expiresAt: Date;
  resource: TokenPrivateMediaResource;
}): DemoDelegationGrant {
  return {
    account: input.resource.account,
    chainId: input.resource.chainId,
    contract: input.resource.contract,
    delegate: input.delegate,
    exp: Math.floor(input.expiresAt.getTime() / 1000),
    resourceUri: input.resource.privateMediaUri,
    ...(input.resource.tokenId !== undefined
      ? { tokenId: input.resource.tokenId }
      : {}),
    ...(input.resource.minAmount !== undefined
      ? { minAmount: input.resource.minAmount }
      : {}),
    version: 1,
  };
}

function delegationSecret(): string {
  return demoSecret("DEMO_DELEGATION_SECRET");
}
