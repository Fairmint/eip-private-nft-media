import {
  createPublicClient,
  getAddress,
  http,
  isAddressEqual,
  type Address,
} from "viem";

import { demoNftAbi } from "../../demo/shared/demo-nft.js";
import type { NftAuthorizationReader } from "../../src/index.js";
import { demoConfig } from "./config.js";

const erc1155Abi = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" },
    ],
    outputs: [{ name: "balance", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isApprovedForAll",
    inputs: [
      { name: "account", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ name: "approved", type: "bool" }],
    stateMutability: "view",
  },
] as const;

export function createDemoChainReader(): NftAuthorizationReader {
  const config = demoConfig();
  const client = createPublicClient({
    chain: {
      id: config.chainId,
      name: config.chainName,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [config.rpcUrl] } },
    },
    transport: http(config.rpcUrl),
  });

  return {
    async ownerOf(input) {
      return getAddress(
        await client.readContract({
          address: input.contract,
          abi: demoNftAbi,
          functionName: "ownerOf",
          args: [BigInt(input.tokenId)],
        }),
      );
    },
    async getApproved(input) {
      const approved = getAddress(
        await client.readContract({
          address: input.contract,
          abi: demoNftAbi,
          functionName: "getApproved",
          args: [BigInt(input.tokenId)],
        }),
      );
      return isZeroAddress(approved) ? null : approved;
    },
    async balanceOf(input) {
      return client.readContract({
        address: input.contract,
        abi: erc1155Abi,
        functionName: "balanceOf",
        args: [input.account, BigInt(input.tokenId)],
      });
    },
    async isApprovedForAll(input) {
      const abi = (await isErc721Contract(
        input.contract,
        config.contractAddress,
      ))
        ? demoNftAbi
        : erc1155Abi;
      return client.readContract({
        address: input.contract,
        abi,
        functionName: "isApprovedForAll",
        args: [input.account, input.operator],
      });
    },
  };
}

function isZeroAddress(address: Address): boolean {
  return isAddressEqual(address, "0x0000000000000000000000000000000000000000");
}

async function isErc721Contract(
  contract: Address,
  demoContract: Address,
): Promise<boolean> {
  return isAddressEqual(contract, demoContract);
}
