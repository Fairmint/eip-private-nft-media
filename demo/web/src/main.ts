import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  getAddress,
  http,
  isAddressEqual,
  type Address,
  type Hex,
} from "viem";
import {
  generatePrivateKey,
  privateKeyToAccount,
  type PrivateKeyAccount,
} from "viem/accounts";

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

type DemoSigner = {
  address: Address;
  signMessage(message: string): Promise<Hex>;
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
  busy: boolean;
  delegationDelegate: Address | undefined;
  config: DemoConfig | undefined;
  delegationOutput: string | undefined;
  delegationToken: string | undefined;
  demoDelegate: PrivateKeyAccount | undefined;
  ownerAccount: Address | undefined;
  privateImageUrl: string | undefined;
  privateMetadata: PrivateMetadata | undefined;
  publicMetadata: PublicMetadata | undefined;
  status: string | undefined;
  tokenId: string | undefined;
} = {
  account: undefined,
  apiBase: configuredApiBase ?? inferredApiBase,
  busy: false,
  delegationDelegate: undefined,
  config: undefined,
  delegationOutput: undefined,
  delegationToken: undefined,
  demoDelegate: undefined,
  ownerAccount: undefined,
  privateImageUrl: undefined,
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
        <h1>Private NFT Media Demo</h1>
        <p>Mint on Base Sepolia, unlock the private image, then delegate one JSON file.</p>
      </div>
      <button id="connect" ${disabledWhen(state.busy)}>${state.account ? shortAddress(state.account) : "Connect wallet"}</button>
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
          <button id="switch-chain" ${disabledWhen(state.busy)}>Switch to Base Sepolia</button>
          <button id="mint" ${disabledWhen(state.busy || !contractAddress)}>Mint NFT</button>
        </div>
        <label>
          Token ID
          <input id="token-id" value="${escapeHtml(state.tokenId ?? "")}" inputmode="numeric" />
        </label>
        <button id="load-token" ${disabledWhen(state.busy || !state.tokenId || !contractAddress)}>Load metadata</button>
      </div>

      <div class="media-panel">
        <h2>Public Preview</h2>
        ${imageMarkup(state.publicMetadata?.image, state.publicMetadata?.name ?? "Public preview")}
      </div>

      <div class="panel">
        <h2>2. Unlock Image</h2>
        <button id="unlock" ${disabledWhen(state.busy || !state.publicMetadata || !state.account)}>Sign SIWE and unlock</button>
        <pre>${escapeHtml(state.privateMetadata ? JSON.stringify(state.privateMetadata, null, 2) : "Private metadata appears here.")}</pre>
      </div>

      <div class="media-panel">
        <h2>Private Image</h2>
        ${imageMarkup(state.privateImageUrl, state.privateMetadata?.name ?? "Unlocked private image")}
      </div>

      <div class="panel wide">
        <h2>3. Delegate One JSON</h2>
        <p class="compact">A browser-only demo delegate signs for exactly <code>third-party-view.json</code>.</p>
        <div class="meta">
          <span>Active wallet: ${state.account ? shortAddress(state.account) : "not connected"}</span>
          <span>Delegation owner: ${state.ownerAccount ? shortAddress(state.ownerAccount) : "not set"}</span>
          <span>Delegate: ${state.delegationDelegate ? shortAddress(state.delegationDelegate) : "not set"}</span>
        </div>
        <div class="actions">
          <button id="delegate-create" ${disabledWhen(state.busy || !state.privateMetadata || !state.account)}>Create delegation</button>
          <button id="delegate-test" ${disabledWhen(state.busy || !state.delegationToken)}>Read JSON as delegate</button>
          <button id="delegate-image-test" ${disabledWhen(state.busy || !state.delegationToken)}>Try image as delegate</button>
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
    state.tokenId =
      (event.target as HTMLInputElement).value.trim() || undefined;
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
  if (!accounts[0]) throw new Error("No wallet account was selected.");
  state.account = getAddress(accounts[0]);
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
  } catch (error) {
    if (walletErrorCode(error) !== 4902) throw error;
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
  state.status = "Base Sepolia selected.";
  render();
}

async function mint(): Promise<void> {
  await connectIfNeeded();
  const config = requireConfig();
  const contractAddress = requireDemoContract();
  setStatus("Confirm the mint transaction in your wallet.");
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
  setStatus(`Mint submitted: ${shortHash(hash)}. Waiting for Base Sepolia.`);
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
  setStatus(`Minted token ${state.tokenId}. Loading metadata.`);
  await loadToken();
  state.status = `Minted token ${state.tokenId}. Metadata loaded.`;
  render();
}

async function loadToken(): Promise<void> {
  const config = requireConfig();
  const contractAddress = requireDemoContract();
  const tokenId = requireTokenId();
  setStatus(`Loading metadata for token ${tokenId}.`);
  const tokenUri = await readTokenUriWithRetry(
    config,
    contractAddress,
    tokenId,
  );
  state.publicMetadata = await fetchJson<PublicMetadata>(tokenUri);
  state.privateMetadata = undefined;
  state.privateImageUrl = undefined;
  state.delegationDelegate = undefined;
  state.delegationOutput = undefined;
  state.delegationToken = undefined;
  state.demoDelegate = undefined;
  state.ownerAccount = undefined;
  state.status = "Metadata loaded.";
  render();
}

async function unlockPrivateMedia(): Promise<void> {
  await connectIfNeeded();
  const metadata = requirePublicMetadata();
  setStatus("Sign the SIWE message to unlock the private image.");
  const authorization = await signForResource(
    metadata.private_media_uri,
    state.account!,
    walletSigner(),
  );
  const privateMetadata = await fetchJson<PrivateMetadata>(
    metadata.private_media_uri,
    {
      headers: demoAuthHeaders(authorization, state.account!),
    },
  );
  state.privateMetadata = privateMetadata;
  state.privateImageUrl = privateMetadata.image;
  state.status = "Private image unlocked.";
  render();
}

async function createDelegation(): Promise<void> {
  await connectIfNeeded();
  const resource = thirdPartyResource();
  const delegate = ensureDemoDelegate().address;
  setStatus(
    `Sign as ${shortAddress(state.account!)} to delegate one JSON file.`,
  );
  const authorization = await signForResource(
    resource.resource_uri,
    state.account!,
    walletSigner(),
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
      tokenId: requireTokenId(),
    },
    headers: demoAuthHeaders(authorization, state.account!),
  });
  state.delegationToken = result.delegation_token;
  state.delegationDelegate = delegate;
  state.ownerAccount = state.account;
  output(
    [
      `Delegated ${result.resource_uri}`,
      `owner: ${state.ownerAccount}`,
      `delegate: ${delegate}`,
      `expires: ${result.expires_at}`,
    ].join("\n"),
  );
  render();
}

async function readDelegatedJson(): Promise<void> {
  const resource = thirdPartyResource();
  const owner = requireOwnerAccount();
  const signer = await delegationSigner();
  setStatus(`Signing as delegate ${shortAddress(signer.address)}.`);
  const authorization = await signForResource(
    resource.resource_uri,
    owner,
    signer,
  );
  const doc = await fetchJson(resource.resource_uri, {
    headers: demoAuthHeaders(authorization, owner, state.delegationToken),
  });
  output(JSON.stringify(doc, null, 2));
  state.status = "Delegated JSON read succeeded.";
  render();
}

function run(action: () => Promise<void>): void {
  if (state.busy) return;
  state.busy = true;
  render();
  void action()
    .catch(report)
    .finally(() => {
      state.busy = false;
      render();
    });
}

async function tryDelegatedImage(): Promise<void> {
  const owner = requireOwnerAccount();
  const signer = await delegationSigner();
  const privateImage = protectedImageResource();
  if (!privateImage)
    throw new Error("Unlock the image before testing delegation.");
  setStatus(
    `Signing image request as delegate ${shortAddress(signer.address)}.`,
  );
  const authorization = await signForResource(privateImage, owner, signer);
  const response = await fetch(privateImage, {
    headers: demoAuthHeaders(authorization, owner, state.delegationToken),
  });
  output(
    response.ok
      ? "Unexpectedly unlocked the image."
      : `Image access correctly failed with HTTP ${response.status}.`,
  );
  state.status = response.ok
    ? "Image delegation check failed."
    : "Image delegation check passed.";
  render();
}

async function signForResource(
  resourceUri: string,
  account: Address,
  signer: DemoSigner,
): Promise<string> {
  const challengeUri = await discoverChallengeUri(resourceUri);
  const url = new URL(challengeUri);
  url.searchParams.set("address", signer.address);
  url.searchParams.set("account", account);
  const challenge = await fetchJson<Challenge>(url.toString());
  const signature = await signer.signMessage(challenge.message);
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
  const text = await response.text();
  if (!response.ok) {
    throw new Error(fetchErrorMessage(url, response, text));
  }

  return JSON.parse(text) as T;
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

async function readTokenUriWithRetry(
  config: DemoConfig,
  contractAddress: Address,
  tokenId: string,
): Promise<string> {
  const client = publicClientFor(config);
  let lastError: unknown;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await client.readContract({
        address: contractAddress,
        abi: demoNftAbi,
        functionName: "tokenURI",
        args: [BigInt(tokenId)],
      });
    } catch (error) {
      lastError = error;
      if (attempt < 4) await delay((attempt + 1) * 750);
    }
  }

  throw new Error(
    `Token ${tokenId} could not be read. If it was just minted, wait a few seconds and click Load metadata again.`,
    { cause: lastError },
  );
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
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

function requireTokenId(): string {
  const tokenId = state.tokenId?.trim();
  if (!tokenId) throw new Error("Enter a token ID.");
  if (!/^(0|[1-9]\d*)$/u.test(tokenId)) {
    throw new Error("Token ID must be an unsigned decimal number.");
  }
  return tokenId;
}

function requireOwnerAccount(): Address {
  if (!state.ownerAccount) throw new Error("Create a delegation first.");
  return state.ownerAccount;
}

function requireDelegationDelegate(): Address {
  if (!state.delegationDelegate) throw new Error("Create a delegation first.");
  return state.delegationDelegate;
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

async function delegationSigner(): Promise<DemoSigner> {
  const delegate = requireDelegationDelegate();

  if (
    state.demoDelegate &&
    isAddressEqual(delegate, state.demoDelegate.address)
  ) {
    return privateKeySigner(state.demoDelegate);
  }

  throw new Error("Create a new generated demo delegation first.");
}

function ensureDemoDelegate(): PrivateKeyAccount {
  state.demoDelegate ??= privateKeyToAccount(generatePrivateKey());
  return state.demoDelegate;
}

function walletSigner(): DemoSigner {
  const address = state.account;
  if (!address) throw new Error("Connect a wallet first.");

  return {
    address,
    async signMessage(message) {
      const signature = await requireWallet().request<string>({
        method: "personal_sign",
        params: [message, address],
      });
      return signature as Hex;
    },
  };
}

function privateKeySigner(account: PrivateKeyAccount): DemoSigner {
  return {
    address: account.address,
    async signMessage(message) {
      return account.signMessage({ message });
    },
  };
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

function setStatus(value: string): void {
  state.status = value;
  render();
}

function imageMarkup(src: string | undefined, alt: string): string {
  return src
    ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" />`
    : `<div class="placeholder">No image loaded</div>`;
}

function disabledWhen(disabled: boolean): string {
  return disabled ? "disabled" : "";
}

function shortAddress(address: Address): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function shortHash(hash: Hex): string {
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
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

function fetchErrorMessage(
  url: string,
  response: Response,
  bodyText: string,
): string {
  const detail = responseDetail(bodyText);
  return `${url} failed with HTTP ${response.status}${detail ? `: ${detail}` : ""}`;
}

function responseDetail(bodyText: string): string | undefined {
  if (!bodyText) return undefined;
  try {
    const parsed = JSON.parse(bodyText) as { error?: unknown };
    if (typeof parsed.error === "string") return parsed.error;
  } catch {
    // Fall back to plain text below.
  }
  return bodyText.slice(0, 240);
}

function walletErrorCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("code" in error))
    return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "number" ? code : undefined;
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
