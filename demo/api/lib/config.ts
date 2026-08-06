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
  tokenId: string;
  standard: TokenStandard;
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
 */
export function demoGatingToken(): DemoGatingToken | null {
  const contract = process.env.DEMO_GATING_CONTRACT;
  const tokenId = process.env.DEMO_GATING_TOKEN_ID;
  if (!contract || !tokenId) return null;

  return {
    chainId: Number(process.env.DEMO_GATING_CHAIN_ID ?? demoChain.id),
    contract: getAddress(contract),
    tokenId,
    standard:
      process.env.DEMO_GATING_STANDARD === "erc1155" ? "erc1155" : "erc721",
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

function allowsInsecureLocalSecrets(): boolean {
  return process.env.VERCEL !== "1" && process.env.NODE_ENV !== "production";
}
