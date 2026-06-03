import { getAddress, isAddressEqual, type Address } from "viem";

import { AuthorizationError } from "./types.js";
import type { PrivateMediaResource, TokenStandard } from "./types.js";

const BINDING_PATTERN =
  /^eip155:(\d+)\/(erc721|erc1155):([^/]+)\/([^?]+)\?(.*)$/u;

export function createPrivateMediaResourceBinding(
  resource: PrivateMediaResource,
): string {
  assertHttpsPrivateMediaUri(resource.privateMediaUri);
  assertTokenId(resource.tokenId);

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

  try {
    assertHttpsPrivateMediaUri(privateMediaUri);

    return {
      chainId: Number(chainIdText),
      standard: standard as TokenStandard,
      contract: getAddress(contract),
      tokenId: assertTokenId(decodeURIComponent(tokenId)),
      account: getAddress(account),
      privateMediaUri,
    };
  } catch {
    return null;
  }
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

export function assertHttpsPrivateMediaUri(privateMediaUri: string): void {
  try {
    const parsed = new URL(privateMediaUri);
    if (
      !parsed.hash &&
      !parsed.username &&
      !parsed.password &&
      (parsed.protocol === "https:" || isLoopbackHttp(parsed))
    ) {
      return;
    }
  } catch {
    // Fall through to the typed error below.
  }

  throw new AuthorizationError(
    "invalid_private_media_uri",
    "private media URI must be an absolute HTTPS URI without a fragment or embedded userinfo",
  );
}

function assertTokenId(tokenId: string): string {
  if (/^(0|[1-9]\d*)$/u.test(tokenId)) return tokenId;

  throw new AuthorizationError(
    "resource_binding_mismatch",
    "token id must be an unsigned base-10 integer",
  );
}

function isLoopbackHttp(url: URL): boolean {
  return (
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
  );
}
