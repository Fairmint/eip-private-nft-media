import type { Context } from "hono";
import { getAddress, isAddressEqual, type Address } from "viem";

import {
  AuthorizationError,
  type PrivateMediaResource,
  type TokenStandard,
} from "../../src/index.js";
import { demoConfig } from "./config.js";

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

export function privateMediaResource(input: {
  route: DemoRouteResource;
  account: Address;
  privateMediaUri: string;
  standard?: TokenStandard;
}): PrivateMediaResource {
  return {
    chainId: input.route.chainId,
    standard: input.standard ?? "erc721",
    contract: input.route.contract,
    tokenId: input.route.tokenId,
    account: input.account,
    privateMediaUri: input.privateMediaUri,
  };
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
