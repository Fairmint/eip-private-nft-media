import { getAddress, type Address } from "viem";

import type { TokenStandard } from "../../../src/index.js";
import { demoChain, demoContractAddress } from "../../shared/demo-nft.js";

export type DemoConfig = {
  chainId: number;
  chainName: string;
  contractAddress: Address;
  rpcUrl: string;
};

export type DemoGatingToken = {
  chainId: number;
  contract: Address;
  standard: TokenStandard;
  tokenId?: string;
  minAmount?: string;
};

export type DemoPolicyConfig = {
  policyId: string;
  chainId: number;
  accounts: ReadonlySet<string>;
};

export function demoConfig(): DemoConfig {
  return {
    chainId: demoChain.id,
    chainName: demoChain.name,
    contractAddress: demoContractAddress,
    rpcUrl: demoChain.rpcUrls.default.http[0],
  };
}

export function requireDemoContract(): Address {
  return demoContractAddress;
}

/**
 * Optional gating token distinct from the advertised route token.
 * When unset, the demo binds the advertised (route) token.
 * Advertised-token owners still get an advertised binding first (owner floor).
 *
 * ERC-20: set `DEMO_GATING_STANDARD=erc20`, `DEMO_GATING_CONTRACT`, and
 * `DEMO_GATING_MIN_AMOUNT` (no token id). ERC-1155 bindings always carry an
 * explicit `minAmount`: `DEMO_GATING_MIN_AMOUNT`, defaulting to `1` when unset.
 */
export function demoGatingToken(): DemoGatingToken | null {
  const contract = process.env.DEMO_GATING_CONTRACT;
  if (!contract) return null;

  const standard = parseGatingStandard(process.env.DEMO_GATING_STANDARD);
  const tokenId = process.env.DEMO_GATING_TOKEN_ID;
  const minAmount = process.env.DEMO_GATING_MIN_AMOUNT;

  if (standard === "erc20") {
    if (!minAmount) return null;
    return {
      chainId: Number(process.env.DEMO_GATING_CHAIN_ID ?? demoChain.id),
      contract: getAddress(contract),
      standard: "erc20",
      minAmount,
    };
  }

  if (!tokenId) return null;

  return {
    chainId: Number(process.env.DEMO_GATING_CHAIN_ID ?? demoChain.id),
    contract: getAddress(contract),
    tokenId,
    standard,
    ...(standard === "erc1155" ? { minAmount: minAmount || "1" } : {}),
  };
}

/**
 * Optional policy-form demo path for accounts that do not hold the advertised
 * or alternate gating token. Allowlist is `DEMO_POLICY_ACCOUNTS`
 * (comma-separated). Advertised-token owners still take the token-form path.
 */
export function demoPolicyConfig(): DemoPolicyConfig | null {
  const policyId = process.env.DEMO_POLICY_ID?.trim();
  if (!policyId) return null;

  const accounts = new Set(
    (process.env.DEMO_POLICY_ACCOUNTS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => getAddress(value).toLowerCase()),
  );

  return {
    policyId,
    chainId: Number(process.env.DEMO_POLICY_CHAIN_ID ?? demoChain.id),
    accounts,
  };
}

export function demoSecret(
  name: "DEMO_DELEGATION_SECRET" | "DEMO_NONCE_SECRET",
): string {
  const value = process.env[name];
  if (value) return value;
  if (allowsInsecureLocalSecrets()) return "local-demo-secret-change-me";
  throw new Error(`Set ${name} before deploying the demo API.`);
}

function parseGatingStandard(value: string | undefined): TokenStandard {
  if (value === "erc1155") return "erc1155";
  if (value === "erc20") return "erc20";
  return "erc721";
}

function allowsInsecureLocalSecrets(): boolean {
  return process.env.VERCEL !== "1" && process.env.NODE_ENV !== "production";
}
