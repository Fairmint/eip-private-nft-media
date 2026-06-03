import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  getAddress,
  http,
  isAddressEqual,
  type Address,
} from "viem";

import { demoChain, demoNftAbi } from "../../shared/demo-nft.js";
import { encodeAuthorizationProof } from "../../../src/authorization-header.js";
import type { AuthorizationProof } from "../../../src/types.js";
import "./styles.css";

type DemoConfig = {
  chainId: number;
  chainName: string;
  contractAddress: Address | null;
  rpcUrl: string;
};

type PublicMetadata = {
  image: string;
  name: string;
  private_media_uri: string;
};

type PrivateMetadata = {
  image: string;
  name: string;
  private_resources?: {
    media_type: string;
    name: string;
    resource_uri: string;
  }[];
};

type Challenge = {
  message: string;
  expires_at: string;
};

type EthereumProvider = {
  on?(event: "accountsChanged", handler: (accounts: string[]) => void): void;
  request<T = unknown>(args: {
    method: string;
    params?: unknown[];
  }): Promise<T>;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

const configuredApiBase = normalizeApiBase(
  import.meta.env.VITE_DEMO_API_BASE_URL,
);
const inferredApiBase = inferApiBase();
const zeroAddress = "0x0000000000000000000000000000000000000000" as Address;

const state: {
  account: Address | undefined;
  apiBase: string;
  config: DemoConfig | undefined;
  delegationOutput: string | undefined;
  delegationToken: string | undefined;
  ownerAccount: Address | undefined;
  privateAuth: string | undefined;
  privateImageObjectUrl: string | undefined;
  privateMetadata: PrivateMetadata | undefined;
  publicMetadata: PublicMetadata | undefined;
  status: string | undefined;
  tokenId: string | undefined;
} = {
  account: undefined,
  apiBase: configuredApiBase ?? inferredApiBase,
  config: undefined,
  delegationOutput: undefined,
  delegationToken: undefined,
  ownerAccount: undefined,
  privateAuth: undefined,
  privateImageObjectUrl: undefined,
  privateMetadata: undefined,
  publicMetadata: undefined,
  status: undefined,
  tokenId: undefined,
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app");
const appElement = app;
let walletEventsBound = false;

render();
void loadConfig();

async function loadConfig(): Promise<void> {
  try {
    state.config = await getJson<DemoConfig>("/api/demo/config");
    render();
  } catch (error) {
    report(error);
  }
}

function render(): void {
  const contractAddress = demoContractAddress();
  appElement.innerHTML = `
    <section class="toolbar">
      <div>
        <h1>SIWE-Gated NFT Media</h1>
        <p>Mint a test NFT, then unlock its private image with a token-scoped SIWE proof.</p>
      </div>
      <button id="connect">${state.account ? shortAddress(state.account) : "Connect wallet"}</button>
    </section>
    ${state.status ? `<p class="status">${escapeHtml(state.status)}</p>` : ""}

    <section class="grid">
      <div class="panel">
        <h2>1. Mint or Load</h2>
        <div class="meta">
          <span>Chain: ${state.config?.chainName ?? "loading"}</span>
          <span>Contract: ${contractAddress ? shortAddress(contractAddress) : "not configured"}</span>
        </div>
        <div class="actions">
          <button id="switch-chain">Use Base Sepolia</button>
          <button id="mint" ${!contractAddress ? "disabled" : ""}>Mint NFT</button>
        </div>
        <label>
          Token ID
          <input id="token-id" value="${state.tokenId ?? ""}" inputmode="numeric" />
        </label>
        <button id="load-token" ${!state.tokenId || !contractAddress ? "disabled" : ""}>Load metadata</button>
      </div>

      <div class="media-panel">
        <h2>Public Preview</h2>
        ${imageMarkup(state.publicMetadata?.image, state.publicMetadata?.name ?? "Public preview")}
      </div>

      <div class="panel">
        <h2>2. Unlock Image</h2>
        <button id="unlock" ${!state.publicMetadata || !state.account ? "disabled" : ""}>Sign SIWE and unlock</button>
        <pre>${escapeHtml(state.privateMetadata ? JSON.stringify(state.privateMetadata, null, 2) : "Private metadata appears here.")}</pre>
      </div>

      <div class="media-panel">
        <h2>Private Image</h2>
        ${imageMarkup(state.privateImageObjectUrl, state.privateMetadata?.name ?? "Unlocked private image")}
      </div>

      <div class="panel wide">
        <h2>3. Delegate One JSON</h2>
        <p class="compact">Create a signed token for only <code>third-party-view.json</code>. The delegate can read that document, but not the private image.</p>
        <div class="meta">
          <span>Active wallet: ${state.account ? shortAddress(state.account) : "not connected"}</span>
          <span>Delegation owner: ${state.ownerAccount ? shortAddress(state.ownerAccount) : "not set"}</span>
        </div>
        <label>
          Delegate address
          <input id="delegate" placeholder="0x..." spellcheck="false" />
        </label>
        <div class="actions">
          <button id="delegate-create" ${!state.privateMetadata || !state.account ? "disabled" : ""}>Create delegation</button>
          <button id="delegate-test" ${!state.delegationToken || !state.account ? "disabled" : ""}>Read JSON as delegate</button>
          <button id="delegate-image-test" ${!state.delegationToken || !state.account ? "disabled" : ""}>Try image as delegate</button>
        </div>
        <pre id="delegation-output">${escapeHtml(state.delegationOutput ?? (state.delegationToken ? `Delegation token saved for ${state.ownerAccount}` : "Delegation output appears here."))}</pre>
      </div>
    </section>
  `;

  bindEvents();
}

function bindEvents(): void {
  element("connect").addEventListener("click", () => run(connectWallet));
  element("switch-chain").addEventListener("click", () =>
    run(switchToDemoChain),
  );
  element("mint").addEventListener("click", () => run(mint));
  element("load-token").addEventListener("click", () => run(loadToken));
  element("unlock").addEventListener("click", () => run(unlockPrivateMedia));
  element("delegate-create").addEventListener("click", () =>
    run(createDelegation),
  );
  element("delegate-test").addEventListener("click", () =>
    run(readDelegatedJson),
  );
  element("delegate-image-test").addEventListener("click", () =>
    run(tryDelegatedImage),
  );
  element("token-id").addEventListener("input", (event) => {
    state.tokenId = (event.target as HTMLInputElement).value || undefined;
    (element("load-token") as HTMLButtonElement).disabled =
      !state.tokenId || !demoContractAddress();
  });
}

async function connectWallet(): Promise<void> {
  const provider = requireWallet();
  bindWalletEvents(provider);
  const accounts = await provider.request<string[]>({
    method: "eth_requestAccounts",
  });
  state.account = getAddress(accounts[0] ?? "");
  state.status = `Connected ${shortAddress(state.account)}`;
  render();
}

async function switchToDemoChain(): Promise<void> {
  const provider = requireWallet();
  const hexChainId = `0x${demoChain.id.toString(16)}`;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexChainId }],
    });
  } catch {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: hexChainId,
          chainName: demoChain.name,
          nativeCurrency: demoChain.nativeCurrency,
          rpcUrls: demoChain.rpcUrls.default.http,
          blockExplorerUrls: [demoChain.blockExplorers.default.url],
        },
      ],
    });
  }
}

async function mint(): Promise<void> {
  await connectIfNeeded();
  const config = requireConfig();
  const contractAddress = requireDemoContract();
  const walletClient = createWalletClient({
    account: state.account,
    chain: demoChain,
    transport: custom(requireWallet()),
  });
  const publicClient = publicClientFor(config);
  const hash = await walletClient.writeContract({
    account: state.account!,
    address: contractAddress,
    abi: demoNftAbi,
    functionName: "mint",
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const transfer = receipt.logs
    .map((log: (typeof receipt.logs)[number]) => {
      try {
        return decodeEventLog({ abi: demoNftAbi, ...log });
      } catch {
        return null;
      }
    })
    .find((event) => event?.eventName === "Transfer");
  const tokenId =
    transfer?.eventName === "Transfer" ? transfer.args.tokenId : undefined;
  if (tokenId === undefined)
    throw new Error("Mint succeeded but token id was not found.");
  state.tokenId = String(tokenId);
  await loadToken();
}

async function loadToken(): Promise<void> {
  const config = requireConfig();
  const contractAddress = requireDemoContract();
  if (!state.tokenId) return;
  const tokenUri = await publicClientFor(config).readContract({
    address: contractAddress,
    abi: demoNftAbi,
    functionName: "tokenURI",
    args: [BigInt(state.tokenId)],
  });
  state.publicMetadata = await fetchJson<PublicMetadata>(tokenUri);
  state.privateMetadata = undefined;
  state.privateImageObjectUrl = undefined;
  state.privateAuth = undefined;
  render();
}

async function unlockPrivateMedia(): Promise<void> {
  await connectIfNeeded();
  const metadata = requirePublicMetadata();
  const authorization = await signForResource(
    metadata.private_media_uri,
    state.account!,
  );
  const privateMetadata = await fetchJson<PrivateMetadata>(
    metadata.private_media_uri,
    {
      headers: demoAuthHeaders(authorization, state.account!),
    },
  );
  state.privateAuth = authorization;
  state.privateMetadata = privateMetadata;
  state.privateImageObjectUrl = privateMetadata.image;
  state.status = "Private image unlocked.";
  render();
}

async function createDelegation(): Promise<void> {
  await connectIfNeeded();
  const resource = thirdPartyResource();
  const delegate = getAddress(
    (document.querySelector<HTMLInputElement>("#delegate")?.value ?? "").trim(),
  );
  const authorization = await signForResource(
    resource.resource_uri,
    state.account!,
  );
  const result = await postJson<{
    delegation_token: string;
    expires_at: string;
    resource_uri: string;
  }>("/api/delegations", {
    body: {
      account: state.account,
      chainId: String(requireConfig().chainId),
      contract: requireDemoContract(),
      delegate,
      resourceUri: resource.resource_uri,
      tokenId: state.tokenId,
    },
    headers: demoAuthHeaders(authorization, state.account!),
  });
  state.delegationToken = result.delegation_token;
  state.ownerAccount = state.account;
  output(
    `Delegated ${result.resource_uri} to ${delegate} until ${result.expires_at}`,
  );
  render();
}

async function readDelegatedJson(): Promise<void> {
  await connectIfNeeded();
  await refreshAccount();
  const resource = thirdPartyResource();
  const owner = requireOwnerAccount();
  if (state.account && isAddressEqual(state.account, owner)) {
    throw new Error(
      "Switch to the delegate wallet before reading the delegated JSON.",
    );
  }
  const authorization = await signForResource(resource.resource_uri, owner);
  const doc = await fetchJson(resource.resource_uri, {
    headers: demoAuthHeaders(authorization, owner, state.delegationToken),
  });
  output(JSON.stringify(doc, null, 2));
}

function run(action: () => Promise<void>): void {
  void action().catch(report);
}

async function tryDelegatedImage(): Promise<void> {
  await connectIfNeeded();
  await refreshAccount();
  const owner = requireOwnerAccount();
  if (state.account && isAddressEqual(state.account, owner)) {
    throw new Error(
      "Switch to the delegate wallet before testing image access.",
    );
  }
  const privateImage = protectedImageResource();
  if (!privateImage)
    throw new Error("Unlock the image before testing delegation.");
  const authorization = await signForResource(privateImage, owner);
  const response = await fetch(privateImage, {
    headers: demoAuthHeaders(authorization, owner, state.delegationToken),
  });
  output(
    response.ok
      ? "Unexpectedly unlocked the image."
      : `Image access correctly failed with HTTP ${response.status}.`,
  );
}

async function signForResource(
  resourceUri: string,
  account: Address,
): Promise<string> {
  const challengeUri = await discoverChallengeUri(resourceUri);
  const url = new URL(challengeUri);
  url.searchParams.set("address", state.account!);
  url.searchParams.set("account", account);
  const challenge = await fetchJson<Challenge>(url.toString());
  const signature = await signMessage(challenge.message);
  const proof: AuthorizationProof = { message: challenge.message, signature };
  return encodeAuthorizationProof(proof);
}

async function discoverChallengeUri(resourceUri: string): Promise<string> {
  const response = await fetch(resourceUri);
  const header = response.headers.get("WWW-Authenticate");
  const match = /challenge_uri="([^"]+)"/u.exec(header ?? "");
  if (!match?.[1]) throw new Error("Resource did not return a SIWE challenge.");
  return match[1];
}

async function signMessage(message: string): Promise<`0x${string}`> {
  const provider = requireWallet();
  const signature = await provider.request<string>({
    method: "personal_sign",
    params: [message, state.account],
  });
  return signature as `0x${string}`;
}

function demoAuthHeaders(
  authorization: string,
  account: Address,
  delegationToken?: string,
): HeadersInit {
  return {
    Authorization: authorization,
    "X-Demo-Account": account,
    ...(delegationToken ? { "X-Demo-Delegation": delegationToken } : {}),
  };
}

async function getJson<T>(path: string): Promise<T> {
  return fetchJson<T>(`${requireApiBase()}${path}`);
}

async function postJson<T>(
  path: string,
  input: { body: unknown; headers?: HeadersInit },
): Promise<T> {
  return fetchJson<T>(`${requireApiBase()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(input.headers ?? {}),
    },
    body: JSON.stringify(input.body),
  });
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${url} failed with HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

async function connectIfNeeded(): Promise<void> {
  await refreshAccount();
  if (!state.account) await connectWallet();
}

async function refreshAccount(): Promise<void> {
  const provider = window.ethereum;
  if (!provider) return;
  bindWalletEvents(provider);
  const accounts = await provider.request<string[]>({ method: "eth_accounts" });
  state.account = accounts[0] ? getAddress(accounts[0]) : undefined;
}

function bindWalletEvents(provider: EthereumProvider): void {
  if (walletEventsBound || !provider.on) return;
  provider.on("accountsChanged", (accounts) => {
    state.account = accounts[0] ? getAddress(accounts[0]) : undefined;
    state.status = state.account
      ? `Active wallet changed to ${shortAddress(state.account)}.`
      : "Wallet disconnected.";
    render();
  });
  walletEventsBound = true;
}

function publicClientFor(config: DemoConfig) {
  return createPublicClient({
    chain: {
      ...demoChain,
      id: config.chainId,
      name: config.chainName,
      rpcUrls: { default: { http: [config.rpcUrl] } },
    },
    transport: http(config.rpcUrl),
  });
}

function requireWallet(): EthereumProvider {
  if (!window.ethereum)
    throw new Error("Install a wallet that injects window.ethereum.");
  return window.ethereum;
}

function requireConfig(): DemoConfig {
  if (!state.config) throw new Error("Demo config is still loading.");
  return state.config;
}

function requireApiBase(): string {
  if (!state.apiBase) {
    throw new Error(
      "Demo API URL is not configured. Set VITE_DEMO_API_BASE_URL for GitHub Pages, or host the UI with the API.",
    );
  }
  return state.apiBase;
}

function requireDemoContract(): Address {
  const address = demoContractAddress();
  if (!address) {
    throw new Error(
      "Demo contract is not configured. Deploy DemoPrivateMediaNFT and set DEMO_CONTRACT_ADDRESS before minting.",
    );
  }
  return address;
}

function requirePublicMetadata(): PublicMetadata {
  if (!state.publicMetadata) throw new Error("Load a token first.");
  return state.publicMetadata;
}

function requireOwnerAccount(): Address {
  if (!state.ownerAccount) throw new Error("Create a delegation first.");
  return state.ownerAccount;
}

function thirdPartyResource(): {
  media_type: string;
  name: string;
  resource_uri: string;
} {
  const resource = state.privateMetadata?.private_resources?.find((entry) =>
    entry.resource_uri.endsWith("third-party-view.json"),
  );
  if (!resource)
    throw new Error("Unlock private metadata before creating a delegation.");
  return resource;
}

function protectedImageResource(): string | undefined {
  const image = state.privateMetadata?.image;
  if (!image) return undefined;
  const url = new URL(image);
  url.searchParams.delete("access_token");
  return url.toString();
}

function output(value: string): void {
  state.delegationOutput = value;
  const target = document.querySelector<HTMLPreElement>("#delegation-output");
  if (target) target.textContent = value;
}

function report(error: unknown): void {
  state.status = error instanceof Error ? error.message : String(error);
  render();
}

function imageMarkup(src: string | undefined, alt: string): string {
  return src
    ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" />`
    : `<div class="placeholder">No image loaded</div>`;
}

function shortAddress(address: Address): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function demoContractAddress(): Address | undefined {
  const address = state.config?.contractAddress;
  return address && !isAddressEqual(address, zeroAddress) ? address : undefined;
}

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeApiBase(
  value: string | undefined | null,
): string | undefined {
  const trimmed = value?.trim().replace(/\/$/u, "");
  return trimmed || undefined;
}

function inferApiBase(): string {
  if (["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)) {
    return "http://127.0.0.1:3000";
  }
  return window.location.origin;
}
