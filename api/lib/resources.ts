import { getAddress, type Address } from "viem";

import {
  type PrivateMediaResource,
  type TokenStandard,
} from "../../src/index.js";
import { requestBaseUrl, type ApiRequest } from "./http.js";

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
  return {
    chainId: Number(input.chainId),
    contract: getAddress(input.contract),
    tokenId: input.tokenId,
  };
}

export function metadataUrl(
  req: ApiRequest,
  resource: DemoRouteResource,
): string {
  return `${requestBaseUrl(req)}/api/metadata/${resource.chainId}/${resource.contract}/${resource.tokenId}`;
}

export function publicImageUrl(
  req: ApiRequest,
  resource: DemoRouteResource,
): string {
  return `${requestBaseUrl(req)}/api/public/${resource.chainId}/${resource.contract}/${resource.tokenId}/image.svg`;
}

export function privateMetadataUrl(
  req: ApiRequest,
  resource: DemoRouteResource,
): string {
  return `${requestBaseUrl(req)}/api/private/${resource.chainId}/${resource.contract}/${resource.tokenId}/metadata`;
}

export function privateImageUrl(
  req: ApiRequest,
  resource: DemoRouteResource,
): string {
  return `${requestBaseUrl(req)}/api/private/${resource.chainId}/${resource.contract}/${resource.tokenId}/image.svg`;
}

export function thirdPartyJsonUrl(
  req: ApiRequest,
  resource: DemoRouteResource,
): string {
  return `${requestBaseUrl(req)}/api/private/${resource.chainId}/${resource.contract}/${resource.tokenId}/third-party-view.json`;
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
  req: ApiRequest;
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
  return `${requestBaseUrl(input.req)}/api/auth/challenge?${params.toString()}`;
}
