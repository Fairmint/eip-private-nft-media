import { getAddress, isAddressEqual, type Address } from "viem";

import { AuthorizationError } from "./types.js";
import type {
  ParsedPolicyPrivateMediaResource,
  ParsedPrivateMediaResource,
  PolicyPrivateMediaResource,
  PrivateMediaResource,
  TokenPrivateMediaResource,
  TokenStandard,
} from "./types.js";

const NFT_BINDING_PATTERN =
  /^eip155:(\d+)\/(erc721|erc1155):([^/]+)\/([^?]+)\?(.*)$/u;
const ERC20_BINDING_PATTERN = /^eip155:(\d+)\/erc20:([^/?]+)\?(.*)$/u;
const POLICY_BINDING_PATTERN = /^policy:([^?]+)\?(.*)$/u;
/** URI unreserved characters or percent-encoded octets (RFC 3986). */
const POLICY_ID_PATTERN = /^(?:[A-Za-z0-9\-._~]|%[0-9A-Fa-f]{2})+$/u;
const UNSIGNED_BASE10 = /^(0|[1-9]\d*)$/u;

/**
 * Builds the expected token-form binding for a private media URI + account.
 * `gating` identifies the gating token and MAY differ from the advertised token
 * whose metadata exposed `privateMediaUri`. `minAmount` is required for
 * `erc1155` and `erc20` gating tokens and forbidden for `erc721`.
 */
export function expectedTokenBinding(input: {
  privateMediaUri: string;
  account: Address;
  gating: {
    chainId: number;
    standard: TokenStandard;
    contract: Address;
    tokenId?: string;
    minAmount?: string;
  };
}): TokenPrivateMediaResource {
  const resource = normalizeTokenResource({
    form: "token",
    chainId: input.gating.chainId,
    standard: input.gating.standard,
    contract: getAddress(input.gating.contract),
    ...(input.gating.tokenId !== undefined
      ? { tokenId: input.gating.tokenId }
      : {}),
    ...(input.gating.minAmount !== undefined
      ? { minAmount: input.gating.minAmount }
      : {}),
    account: getAddress(input.account),
    privateMediaUri: input.privateMediaUri,
  });
  assertHttpsPrivateMediaUri(resource.privateMediaUri);
  return resource;
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

  if (resource.form === "policy") {
    assertPolicyId(resource.policyId);
    return `policy:${resource.policyId}?${bindingQuery({
      account: resource.account,
      privateMediaUri: resource.privateMediaUri,
    })}`;
  }

  const normalized = normalizeTokenResource(resource);
  const path =
    normalized.standard === "erc20"
      ? [
          `eip155:${normalized.chainId}`,
          `erc20:${getAddress(normalized.contract)}`,
        ].join("/")
      : [
          `eip155:${normalized.chainId}`,
          `${normalized.standard}:${getAddress(normalized.contract)}`,
          encodeURIComponent(normalized.tokenId),
        ].join("/");

  return `${path}?${bindingQuery({
    account: normalized.account,
    privateMediaUri: normalized.privateMediaUri,
    ...(normalized.minAmount !== undefined
      ? { minAmount: normalized.minAmount }
      : {}),
  })}`;
}

export function parsePrivateMediaResourceBinding(
  binding: string,
): ParsedPrivateMediaResource | null {
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
      actual.minAmount === expected.minAmount &&
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
  const nft = NFT_BINDING_PATTERN.exec(binding);
  if (nft) {
    const [, chainIdText, standard, contract, tokenId, query] = nft;
    if (
      !chainIdText ||
      !standard ||
      !contract ||
      !tokenId ||
      query === undefined
    ) {
      return null;
    }
    return parseTokenBindingParts({
      chainIdText,
      standard: standard as "erc721" | "erc1155",
      contract,
      tokenId,
      query,
    });
  }

  const erc20 = ERC20_BINDING_PATTERN.exec(binding);
  if (erc20) {
    const [, chainIdText, contract, query] = erc20;
    if (!chainIdText || !contract || query === undefined) return null;
    return parseTokenBindingParts({
      chainIdText,
      standard: "erc20",
      contract,
      query,
    });
  }

  // Reject erc20-with-tokenId and 721/1155-without-tokenId shapes that nearly
  // match a form but violate the path segment rules.
  if (/^eip155:\d+\/erc20:[^/?]+\/[^?]+\?/u.test(binding)) return null;
  if (/^eip155:\d+\/(erc721|erc1155):[^/?]+\?/u.test(binding)) return null;

  return null;
}

function parseTokenBindingParts(input: {
  chainIdText: string;
  standard: TokenStandard;
  contract: string;
  tokenId?: string;
  query: string;
}): TokenPrivateMediaResource | null {
  if (!UNSIGNED_BASE10.test(input.chainIdText)) return null;

  try {
    const params = parseStrictBindingQuery(input.query);
    const account = params.get("account");
    const privateMediaUriRaw = params.get("resource");
    const minAmountRaw = params.get("minAmount");
    if (!account || privateMediaUriRaw === undefined) return null;

    const privateMediaUri = decodeBindingComponent(privateMediaUriRaw);
    assertHttpsPrivateMediaUri(privateMediaUri);

    assertParameterShape(input.standard, [...params.keys()]);

    return normalizeTokenResource({
      form: "token",
      chainId: Number(input.chainIdText),
      standard: input.standard,
      contract: getAddress(input.contract),
      ...(input.tokenId !== undefined
        ? { tokenId: assertTokenId(decodeBindingComponent(input.tokenId)) }
        : {}),
      ...(minAmountRaw !== undefined
        ? { minAmount: assertMinAmount(decodeBindingComponent(minAmountRaw)) }
        : {}),
      account: getAddress(decodeBindingComponent(account)),
      privateMediaUri,
    });
  } catch {
    return null;
  }
}

function parsePolicyBinding(
  binding: string,
): ParsedPolicyPrivateMediaResource | null {
  const match = POLICY_BINDING_PATTERN.exec(binding);
  if (!match) return null;

  const [, policyId, query] = match;
  if (!policyId || query === undefined) return null;
  if (!POLICY_ID_PATTERN.test(policyId)) return null;

  try {
    const params = parseStrictBindingQuery(query);
    const account = params.get("account");
    const privateMediaUriRaw = params.get("resource");
    if (!account || privateMediaUriRaw === undefined) return null;

    const keys = [...params.keys()];
    if (keys.length !== 2 || keys[0] !== "account" || keys[1] !== "resource") {
      return null;
    }

    const privateMediaUri = decodeBindingComponent(privateMediaUriRaw);
    assertHttpsPrivateMediaUri(privateMediaUri);

    return {
      form: "policy",
      // Exact string match without percent-decoding the policy id.
      policyId,
      account: getAddress(decodeBindingComponent(account)),
      privateMediaUri,
    };
  } catch {
    return null;
  }
}

function assertParameterShape(
  standard: TokenStandard,
  keys: readonly string[],
): void {
  if (standard === "erc721") {
    if (keys.length !== 2 || keys[0] !== "account" || keys[1] !== "resource") {
      throw new AuthorizationError(
        "resource_binding_mismatch",
        "erc721 bindings must carry exactly account then resource",
      );
    }
    return;
  }

  // erc1155 and erc20 both require an explicit minAmount.
  if (
    keys.length !== 3 ||
    keys[0] !== "account" ||
    keys[1] !== "minAmount" ||
    keys[2] !== "resource"
  ) {
    throw new AuthorizationError(
      "resource_binding_mismatch",
      `${standard} bindings must carry exactly account, minAmount, then resource`,
    );
  }
}

/** Token resource shape before form-specific validation. */
type TokenResourceInput = {
  form: "token";
  chainId: number;
  standard: TokenStandard;
  contract: Address;
  tokenId?: string;
  minAmount?: string;
  account: Address;
  privateMediaUri: string;
};

function normalizeTokenResource(
  resource: TokenResourceInput,
): TokenPrivateMediaResource {
  if (resource.standard === "erc20") {
    if (resource.tokenId !== undefined) {
      throw new AuthorizationError(
        "resource_binding_mismatch",
        "erc20 bindings must not carry a token id segment",
      );
    }
    if (resource.minAmount === undefined) {
      throw new AuthorizationError(
        "resource_binding_mismatch",
        "erc20 bindings require minAmount",
      );
    }
    return {
      form: "token",
      chainId: resource.chainId,
      standard: "erc20",
      contract: getAddress(resource.contract),
      minAmount: assertMinAmount(resource.minAmount),
      account: getAddress(resource.account),
      privateMediaUri: resource.privateMediaUri,
    };
  }

  if (resource.tokenId === undefined) {
    throw new AuthorizationError(
      "resource_binding_mismatch",
      `${resource.standard} bindings require a token id segment`,
    );
  }

  if (resource.standard === "erc721") {
    if (resource.minAmount !== undefined) {
      throw new AuthorizationError(
        "resource_binding_mismatch",
        "erc721 bindings must not carry minAmount",
      );
    }
    return {
      form: "token",
      chainId: resource.chainId,
      standard: "erc721",
      contract: getAddress(resource.contract),
      tokenId: assertTokenId(resource.tokenId),
      account: getAddress(resource.account),
      privateMediaUri: resource.privateMediaUri,
    };
  }

  // erc1155
  if (resource.minAmount === undefined) {
    throw new AuthorizationError(
      "resource_binding_mismatch",
      "erc1155 bindings require minAmount",
    );
  }
  return {
    form: "token",
    chainId: resource.chainId,
    standard: "erc1155",
    contract: getAddress(resource.contract),
    tokenId: assertTokenId(resource.tokenId),
    minAmount: assertMinAmount(resource.minAmount),
    account: getAddress(resource.account),
    privateMediaUri: resource.privateMediaUri,
  };
}

function bindingQuery(input: {
  account: Address;
  privateMediaUri: string;
  minAmount?: string;
}): string {
  const parts = [
    `account=${encodeRfc3986Component(getAddress(input.account))}`,
  ];
  if (input.minAmount !== undefined) {
    parts.push(`minAmount=${encodeRfc3986Component(input.minAmount)}`);
  }
  parts.push(`resource=${encodeRfc3986Component(input.privateMediaUri)}`);
  return parts.join("&");
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

/**
 * Parse query parameters while rejecting repeats (ERC: no parameter more than once).
 */
function parseStrictBindingQuery(query: string): Map<string, string> {
  const params = new Map<string, string>();
  if (!query) return params;

  for (const part of query.split("&")) {
    if (!part) {
      throw new AuthorizationError(
        "resource_binding_mismatch",
        "empty query parameter in resource binding",
      );
    }
    const eq = part.indexOf("=");
    const key = eq === -1 ? part : part.slice(0, eq);
    const value = eq === -1 ? "" : part.slice(eq + 1);
    if (params.has(key)) {
      throw new AuthorizationError(
        "resource_binding_mismatch",
        "resource binding parameters must not repeat",
      );
    }
    params.set(key, value);
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
  if (UNSIGNED_BASE10.test(tokenId)) return tokenId;

  throw new AuthorizationError(
    "resource_binding_mismatch",
    "token id must be an unsigned base-10 integer",
  );
}

function assertMinAmount(minAmount: string): string {
  if (!UNSIGNED_BASE10.test(minAmount) || minAmount === "0") {
    throw new AuthorizationError(
      "resource_binding_mismatch",
      "minAmount must be an unsigned base-10 integer >= 1 without leading zeros",
    );
  }
  return minAmount;
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
