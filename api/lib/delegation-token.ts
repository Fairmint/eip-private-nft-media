import { sign, verify } from "hono/jwt";
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
  exp: number;
  resourceUri: string;
  tokenId: string;
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
      const grant = await parseDelegationToken(token);
      if (!grant || grant.exp * 1000 <= input.now.getTime()) return false;

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
    typeof parsed.tokenId !== "string"
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
    exp: Math.floor(input.expiresAt.getTime() / 1000),
    resourceUri: input.resource.privateMediaUri,
    tokenId: input.resource.tokenId,
    version: 1,
  };
}

function delegationSecret(): string {
  return demoSecret("DEMO_DELEGATION_SECRET");
}
