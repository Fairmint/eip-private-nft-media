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
const rpcUrl = "https://sepolia.base.org";
const privateKey = process.env.DEMO_DEPLOYER_PRIVATE_KEY;
const chainId = 84532;
const baseUrl = resolveBaseUrl(chainId);

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
    name: "Base Sepolia",
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
  `Update demo/shared/demo-nft.ts if this should replace the checked-in demo contract.`,
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

function resolveBaseUrl(targetChainId) {
  const configured = process.argv[2];
  if (configured) return validateBaseUrl(configured, targetChainId);
  if (isLocalChain(targetChainId)) return "http://localhost:3000";

  throw new Error(
    "Pass the deployed demo URL, for example: npm run demo:deploy-contract -- https://your-vercel-project.vercel.app",
  );
}

function validateBaseUrl(value, targetChainId) {
  const parsed = new URL(value);
  if (!isLocalChain(targetChainId) && parsed.protocol !== "https:") {
    throw new Error("The deployed demo URL must be HTTPS for testnet.");
  }
  return value.replace(/\/$/u, "");
}

function isLocalChain(targetChainId) {
  return targetChainId === 31337 || targetChainId === 1337;
}
