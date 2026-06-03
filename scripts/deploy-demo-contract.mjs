import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import solc from "solc";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbiItem,
  publicActions,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const root = process.cwd();
const rpcUrl = process.env.DEMO_RPC_URL ?? "https://sepolia.base.org";
const privateKey = process.env.DEMO_DEPLOYER_PRIVATE_KEY;
const chainId = Number(process.env.DEMO_CHAIN_ID ?? "84532");
const baseUrl =
  process.env.DEMO_PUBLIC_BASE_URL ??
  process.env.DEMO_API_BASE_URL ??
  "http://localhost:3000";

if (!privateKey) {
  throw new Error("Set DEMO_DEPLOYER_PRIVATE_KEY to deploy the demo contract.");
}

const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
const initialBaseTokenUri = `${normalizedBaseUrl}api/metadata/`;
const account = privateKeyToAccount(
  privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`,
);

const sourcePath = path.join(root, "demo/contracts/DemoPrivateMediaNFT.sol");
const source = readFileSync(sourcePath, "utf8");
const input = {
  language: "Solidity",
  sources: {
    "demo/contracts/DemoPrivateMediaNFT.sol": { content: source },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object"],
      },
    },
  },
};

const output = JSON.parse(
  solc.compile(JSON.stringify(input), { import: resolveImport }),
);
const errors = output.errors?.filter((error) => error.severity === "error");
if (errors?.length) {
  throw new Error(errors.map((error) => error.formattedMessage).join("\n"));
}

const artifact =
  output.contracts["demo/contracts/DemoPrivateMediaNFT.sol"]
    .DemoPrivateMediaNFT;
const bytecode = `0x${artifact.evm.bytecode.object}`;
const client = createWalletClient({
  account,
  chain: {
    id: chainId,
    name: process.env.DEMO_CHAIN_NAME ?? "Base Sepolia",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  },
  transport: http(rpcUrl),
}).extend(publicActions);

console.log(`Deploying from ${account.address} to chain ${chainId}`);
console.log(`Initial metadata base: ${initialBaseTokenUri}`);

const hash = await client.deployContract({
  abi: artifact.abi,
  bytecode,
  args: [initialBaseTokenUri],
});
console.log(`Deployment transaction: ${hash}`);

const receipt = await client.waitForTransactionReceipt({ hash });
const transferEvent = parseAbiItem(
  "event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)",
);
mkdirSync("demo/contract-artifacts", { recursive: true });
writeFileSync(
  "demo/contract-artifacts/DemoPrivateMediaNFT.json",
  JSON.stringify(
    {
      abi: artifact.abi,
      bytecode,
      chainId,
      contractAddress: receipt.contractAddress,
      deployer: account.address,
      initialBaseTokenUri,
      transferEvent,
    },
    null,
    2,
  ),
);

console.log(`Contract address: ${receipt.contractAddress}`);
console.log(
  `Set DEMO_CONTRACT_ADDRESS=${receipt.contractAddress} in Vercel and VITE_DEMO_CONTRACT_ADDRESS=${receipt.contractAddress} for local frontend builds.`,
);

function resolveImport(importPath) {
  const candidates = [
    path.join(root, importPath),
    path.join(root, "node_modules", importPath),
  ];
  for (const candidate of candidates) {
    try {
      return { contents: readFileSync(candidate, "utf8") };
    } catch {
      // Try the next import location.
    }
  }
  return { error: `Import not found: ${importPath}` };
}
