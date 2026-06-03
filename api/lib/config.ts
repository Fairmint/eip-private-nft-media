import { getAddress, type Address } from "viem";

export type DemoConfig = {
  chainId: number;
  chainName: string;
  contractAddress: Address | null;
  rpcUrl: string;
};

export function demoConfig(): DemoConfig {
  return {
    chainId: Number(process.env.DEMO_CHAIN_ID ?? "84532"),
    chainName: process.env.DEMO_CHAIN_NAME ?? "Base Sepolia",
    contractAddress: process.env.DEMO_CONTRACT_ADDRESS
      ? getAddress(process.env.DEMO_CONTRACT_ADDRESS)
      : null,
    rpcUrl: process.env.DEMO_RPC_URL ?? "https://sepolia.base.org",
  };
}

export function requireDemoContract(): Address {
  const address = demoConfig().contractAddress;
  if (!address) {
    throw new Error("Set DEMO_CONTRACT_ADDRESS before using the demo API.");
  }
  return address;
}
