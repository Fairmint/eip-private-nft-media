import type { Address } from "viem";

import { demoChain, demoContractAddress } from "../../shared/demo-nft.js";

export type DemoConfig = {
  chainId: number;
  chainName: string;
  contractAddress: Address;
  rpcUrl: string;
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
