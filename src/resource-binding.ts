import { getAddress, isAddressEqual, type Address } from "viem";

import type { PrivateMediaResource, TokenStandard } from "./types.js";

const BINDING_PATTERN =
  /^eip155:(\d+)\/(erc721|erc1155):([^/]+)\/([^?]+)\?(.*)$/u;

export function createPrivateMediaResourceBinding(
  resource: PrivateMediaResource,
): string {
  const params = new URLSearchParams({
    account: getAddress(resource.account),
    resource: resource.privateMediaUri,
  });

  return (
    [
      `eip155:${resource.chainId}`,
      `${resource.standard}:${getAddress(resource.contract)}`,
      encodeURIComponent(resource.tokenId),
    ].join("/") + `?${params.toString()}`
  );
}

export function parsePrivateMediaResourceBinding(
  binding: string,
): PrivateMediaResource | null {
  const match = BINDING_PATTERN.exec(binding);
  if (!match) return null;

  const [, chainIdText, standard, contract, tokenId, query] = match;
  if (!chainIdText || !standard || !contract || !tokenId || !query) return null;

  const params = new URLSearchParams(query);
  const account = params.get("account");
  const privateMediaUri = params.get("resource");
  if (!account || !privateMediaUri) return null;

  return {
    chainId: Number(chainIdText),
    standard: standard as TokenStandard,
    contract: getAddress(contract),
    tokenId: decodeURIComponent(tokenId),
    account: getAddress(account),
    privateMediaUri,
  };
}

export function resourceBindingMatches(
  binding: string,
  expected: PrivateMediaResource,
): boolean {
  const actual = parsePrivateMediaResourceBinding(binding);
  if (!actual) return false;

  return (
    actual.chainId === expected.chainId &&
    actual.standard === expected.standard &&
    isAddressEqual(actual.contract, expected.contract) &&
    actual.tokenId === expected.tokenId &&
    isAddressEqual(actual.account, expected.account) &&
    actual.privateMediaUri === expected.privateMediaUri
  );
}

export function resourcesIncludeBinding(
  resources: readonly string[] | undefined,
  expected: PrivateMediaResource,
): boolean {
  return (
    resources?.some((resource) => resourceBindingMatches(resource, expected)) ??
    false
  );
}

export function normalizeAddress(address: Address): Address {
  return getAddress(address);
}
