import type { Context } from "hono";
import { getAddress, isAddressEqual, type Address } from "viem";

import {
  AuthorizationError,
  expectedPolicyBinding,
  expectedTokenBinding,
  type NftAuthorizationReader,
  type PrivateMediaResource,
  type TokenStandard,
} from "../../../src/index.js";
import { createDemoChainReader } from "./chain-reader.js";
import {
  demoConfig,
  demoGatingToken,
  demoPolicyConfig,
  type DemoGatingToken,
} from "./config.js";

export type DemoRouteResource = {
  chainId: number;
  contract: Address;
  tokenId: string;
};

export function routeResource(input: {
  chainId: string;
  contract: string;
  tokenId: string;
}): DemoRouteResource {
  const route = {
    chainId: Number(input.chainId),
    contract: getAddress(input.contract),
    tokenId: input.tokenId,
  };
  assertDemoRoute(route);
  return route;
}

export function assertDemoRoute(route: DemoRouteResource): void {
  const config = demoConfig();
  if (
    route.chainId !== config.chainId ||
    !isAddressEqual(route.contract, config.contractAddress)
  ) {
    throw new AuthorizationError(
      "resource_binding_mismatch",
      "route must match the configured demo contract",
    );
  }
}

export function metadataUrl(c: Context, resource: DemoRouteResource): string {
  return `${requestBaseUrl(c)}/api/metadata/${resource.chainId}/${resource.contract}/${resource.tokenId}`;
}

export function publicImageUrl(
  c: Context,
  resource: DemoRouteResource,
): string {
  return `${requestBaseUrl(c)}/api/public/${resource.chainId}/${resource.contract}/${resource.tokenId}/image.svg`;
}

export function privateMetadataUrl(
  c: Context,
  resource: DemoRouteResource,
): string {
  return `${requestBaseUrl(c)}/api/private/${resource.chainId}/${resource.contract}/${resource.tokenId}/metadata`;
}

export function privateImageUrl(
  c: Context,
  resource: DemoRouteResource,
): string {
  return `${requestBaseUrl(c)}/api/private/${resource.chainId}/${resource.contract}/${resource.tokenId}/image.svg`;
}

export function thirdPartyJsonUrl(
  c: Context,
  resource: DemoRouteResource,
): string {
  return `${requestBaseUrl(c)}/api/private/${resource.chainId}/${resource.contract}/${resource.tokenId}/third-party-view.json`;
}

/**
 * Expected binding for challenge/verify.
 *
 * ERC-8291 owner floor: an advertised-token owner/holder MUST be authorizable.
 * Resolution order for this demo:
 * 1. Advertised (route) token binding when the account owns/holds it
 * 2. Optional alternate gating token when the account holds it (`DEMO_GATING_*`)
 * 3. Optional policy-form when the account is on the allowlist (`DEMO_POLICY_*`)
 * 4. Otherwise advertised-token binding (verify fails if unauthorized)
 */
export async function privateMediaResource(input: {
  route: DemoRouteResource;
  account: Address;
  privateMediaUri: string;
  standard?: TokenStandard;
  chainReader?: NftAuthorizationReader;
}): Promise<PrivateMediaResource> {
  const standard = input.standard ?? "erc721";
  // The owner-floor binding uses threshold 1 so any positive holder qualifies.
  const advertised: DemoGatingToken = {
    chainId: input.route.chainId,
    standard,
    contract: input.route.contract,
    tokenId: input.route.tokenId,
    ...(standard === "erc1155" ? { minAmount: "1" } : {}),
  };
  const reader = input.chainReader ?? createDemoChainReader();

  if (await accountHoldsToken(reader, advertised, input.account)) {
    return expectedTokenBinding({
      privateMediaUri: input.privateMediaUri,
      account: input.account,
      gating: advertised,
    });
  }

  const gating = demoGatingToken();
  if (
    gating &&
    !sameToken(gating, advertised) &&
    (await accountHoldsToken(reader, gating, input.account))
  ) {
    return expectedTokenBinding({
      privateMediaUri: input.privateMediaUri,
      account: input.account,
      gating,
    });
  }

  const policy = demoPolicyConfig();
  if (policy?.accounts.has(input.account.toLowerCase())) {
    return expectedPolicyBinding({
      privateMediaUri: input.privateMediaUri,
      account: input.account,
      policyId: policy.policyId,
      chainId: policy.chainId,
    });
  }

  // Fall back to the advertised-token binding; verification will deny if unpaid.
  return expectedTokenBinding({
    privateMediaUri: input.privateMediaUri,
    account: input.account,
    gating: advertised,
  });
}

export function challengeUri(input: {
  account?: Address;
  c: Context;
  route: DemoRouteResource;
  resourceUri: string;
}): string {
  const params = new URLSearchParams({
    chainId: String(input.route.chainId),
    contract: input.route.contract,
    resource: input.resourceUri,
    standard: "erc721",
    tokenId: input.route.tokenId,
  });
  if (input.account) params.set("account", input.account);
  return `${requestBaseUrl(input.c)}/api/auth/challenge?${params.toString()}`;
}

export function requestBaseUrl(c: Context): string {
  const url = new URL(c.req.url);
  const host = c.req.header("x-forwarded-host") ?? url.host;
  const protocol =
    c.req.header("x-forwarded-proto") ?? url.protocol.replace(/:$/u, "");
  return `${protocol}://${host}`.replace(/\/$/u, "");
}

async function accountHoldsToken(
  reader: NftAuthorizationReader,
  token: DemoGatingToken,
  account: Address,
): Promise<boolean> {
  try {
    if (token.standard === "erc20") {
      if (token.minAmount === undefined) return false;
      const balance = await reader.balanceOf({
        chainId: token.chainId,
        contract: token.contract,
        account,
      });
      return balance >= BigInt(token.minAmount);
    }

    if (token.standard === "erc1155") {
      if (token.tokenId === undefined || token.minAmount === undefined) {
        return false;
      }
      const balance = await reader.balanceOf({
        chainId: token.chainId,
        contract: token.contract,
        tokenId: token.tokenId,
        account,
      });
      return balance >= BigInt(token.minAmount);
    }

    if (token.tokenId === undefined) return false;
    const owner = await reader.ownerOf({
      chainId: token.chainId,
      contract: token.contract,
      tokenId: token.tokenId,
    });
    return isAddressEqual(owner, account);
  } catch {
    return false;
  }
}

function sameToken(a: DemoGatingToken, b: DemoGatingToken): boolean {
  return (
    a.chainId === b.chainId &&
    a.standard === b.standard &&
    isAddressEqual(a.contract, b.contract) &&
    a.tokenId === b.tokenId &&
    a.minAmount === b.minAmount
  );
}
