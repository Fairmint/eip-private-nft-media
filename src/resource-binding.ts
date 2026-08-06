import { getAddress, isAddressEqual, type Address } from "viem";

import { AuthorizationError } from "./types.js";
import type {
  PolicyPrivateMediaResource,
  PrivateMediaResource,
  TokenPrivateMediaResource,
  TokenStandard,
} from "./types.js";

const TOKEN_BINDING_PATTERN =
  /^eip155:(\d+)\/(erc721|erc1155):([^/]+)\/([^?]+)\?(.*)$/u;
const POLICY_BINDING_PATTERN = /^policy:([^?]+)\?(.*)$/u;
/** URI unreserved characters or percent-encoded octets (RFC 3986). */
const POLICY_ID_PATTERN = /^(?:[A-Za-z0-9\-._~]|%[0-9A-Fa-f]{2})+$/u;

/**
 * Builds the expected token-form binding for a private media URI + account.
 * `gating` identifies the gating token and MAY differ from the advertised token
 * whose metadata exposed `privateMediaUri`.
 */
export function expectedTokenBinding(input: {
  privateMediaUri: string;
  account: Address;
  gating: {
    chainId: number;
    standard: TokenStandard;
    contract: Address;
    tokenId: string;
  };
}): TokenPrivateMediaResource {
  return {
    form: "token",
    chainId: input.gating.chainId,
    standard: input.gating.standard,
    contract: getAddress(input.gating.contract),
    tokenId: assertTokenId(input.gating.tokenId),
    account: getAddress(input.account),
    privateMediaUri: input.privateMediaUri,
  };
}

/**
 * Builds the expected policy-form binding for a private media URI + account.
 * `chainId` is the SIWE chain-id the server selected for this challenge.
 */
export function expectedPolicyBinding(input: {
  privateMediaUri: string;
  account: Address;
  policyId: string;
  chainId: number;
}): PolicyPrivateMediaResource {
  return {
    form: "policy",
    policyId: assertPolicyId(input.policyId),
    account: getAddress(input.account),
    privateMediaUri: input.privateMediaUri,
    chainId: input.chainId,
  };
}

export function createPrivateMediaResourceBinding(
  resource: PrivateMediaResource,
): string {
  assertHttpsPrivateMediaUri(resource.privateMediaUri);
  const query = bindingQuery(resource.account, resource.privateMediaUri);

  if (resource.form === "policy") {
    assertPolicyId(resource.policyId);
    return `policy:${resource.policyId}?${query}`;
  }

  assertTokenId(resource.tokenId);
  return (
    [
      `eip155:${resource.chainId}`,
      `${resource.standard}:${getAddress(resource.contract)}`,
      encodeURIComponent(resource.tokenId),
    ].join("/") + `?${query}`
  );
}

export function parsePrivateMediaResourceBinding(
  binding: string,
): PrivateMediaResource | null {
  const token = parseTokenBinding(binding);
  if (token) return token;

  return parsePolicyBinding(binding);
}

export function resourceBindingMatches(
  binding: string,
  expected: PrivateMediaResource,
): boolean {
  const actual = parsePrivateMediaResourceBinding(binding);
  if (!actual || actual.form !== expected.form) return false;

  if (actual.form === "policy" && expected.form === "policy") {
    return (
      actual.policyId === expected.policyId &&
      isAddressEqual(actual.account, expected.account) &&
      actual.privateMediaUri === expected.privateMediaUri
    );
  }

  if (actual.form === "token" && expected.form === "token") {
    return (
      actual.chainId === expected.chainId &&
      actual.standard === expected.standard &&
      isAddressEqual(actual.contract, expected.contract) &&
      actual.tokenId === expected.tokenId &&
      isAddressEqual(actual.account, expected.account) &&
      actual.privateMediaUri === expected.privateMediaUri
    );
  }

  return false;
}

/**
 * ERC-8291 requires exactly one SIWE `resources` entry matching the expected binding.
 */
export function resourcesMatchExpectedBinding(
  resources: readonly string[] | undefined,
  expected: PrivateMediaResource,
): boolean {
  if (!resources || resources.length !== 1) return false;
  return resourceBindingMatches(resources[0]!, expected);
}

export function challengeNonceScope(resource: PrivateMediaResource): string {
  return `${getAddress(resource.account).toLowerCase()}:${createPrivateMediaResourceBinding(resource)}`;
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

export function isTokenPrivateMediaResource(
  resource: PrivateMediaResource,
): resource is TokenPrivateMediaResource {
  return resource.form === "token";
}

export function isPolicyPrivateMediaResource(
  resource: PrivateMediaResource,
): resource is PolicyPrivateMediaResource {
  return resource.form === "policy";
}

function parseTokenBinding(binding: string): TokenPrivateMediaResource | null {
  const match = TOKEN_BINDING_PATTERN.exec(binding);
  if (!match) return null;

  const [, chainIdText, standard, contract, tokenId, query] = match;
  if (!chainIdText || !standard || !contract || !tokenId || query === undefined)
    return null;

  const params = parseBindingQuery(query);
  const account = params.get("account");
  const privateMediaUriRaw = params.get("resource");
  if (!account || privateMediaUriRaw === undefined) return null;

  try {
    const privateMediaUri = decodeBindingComponent(privateMediaUriRaw);
    assertHttpsPrivateMediaUri(privateMediaUri);

    return {
      form: "token",
      chainId: Number(chainIdText),
      standard: standard as TokenStandard,
      contract: getAddress(contract),
      tokenId: assertTokenId(decodeBindingComponent(tokenId)),
      account: getAddress(decodeBindingComponent(account)),
      privateMediaUri,
    };
  } catch {
    return null;
  }
}

function parsePolicyBinding(
  binding: string,
): PolicyPrivateMediaResource | null {
  const match = POLICY_BINDING_PATTERN.exec(binding);
  if (!match) return null;

  const [, policyId, query] = match;
  if (!policyId || query === undefined) return null;
  if (!POLICY_ID_PATTERN.test(policyId)) return null;

  const params = parseBindingQuery(query);
  const account = params.get("account");
  const privateMediaUriRaw = params.get("resource");
  if (!account || privateMediaUriRaw === undefined) return null;

  try {
    const privateMediaUri = decodeBindingComponent(privateMediaUriRaw);
    assertHttpsPrivateMediaUri(privateMediaUri);

    return {
      form: "policy",
      // Exact string match without percent-decoding the policy id.
      policyId,
      account: getAddress(decodeBindingComponent(account)),
      privateMediaUri,
      // Placeholder; SIWE chain-id is checked against the expected resource.
      chainId: 0,
    };
  } catch {
    return null;
  }
}

function bindingQuery(account: Address, privateMediaUri: string): string {
  return [
    `account=${encodeRfc3986Component(getAddress(account))}`,
    `resource=${encodeRfc3986Component(privateMediaUri)}`,
  ].join("&");
}

/**
 * Percent-encode so all RFC 3986 reserved characters are encoded.
 * `encodeURIComponent` alone leaves `!'()*` unescaped.
 */
export function encodeRfc3986Component(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/gu,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function parseBindingQuery(query: string): Map<string, string> {
  const params = new Map<string, string>();
  if (!query) return params;

  for (const part of query.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq === -1) {
      params.set(part, "");
      continue;
    }
    params.set(part.slice(0, eq), part.slice(eq + 1));
  }
  return params;
}

function decodeBindingComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new AuthorizationError(
      "resource_binding_mismatch",
      "invalid percent-encoding in resource binding",
    );
  }
}

function assertTokenId(tokenId: string): string {
  if (/^(0|[1-9]\d*)$/u.test(tokenId)) return tokenId;

  throw new AuthorizationError(
    "resource_binding_mismatch",
    "token id must be an unsigned base-10 integer",
  );
}

function assertPolicyId(policyId: string): string {
  if (policyId && POLICY_ID_PATTERN.test(policyId)) return policyId;

  throw new AuthorizationError(
    "resource_binding_mismatch",
    "policy id must be a nonempty URI-unreserved or percent-encoded identifier",
  );
}

function isLoopbackHttp(url: URL): boolean {
  return (
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
  );
}
