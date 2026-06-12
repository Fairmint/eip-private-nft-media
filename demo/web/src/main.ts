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

import { encodeAuthorizationProof } from "../../../src/authorization-header.js";
import type { AuthorizationProof } from "../../../src/types.js";
import {
  demoChain,
  demoContractAddress,
  demoNftAbi,
} from "../../shared/demo-nft.js";
import "./styles.css";

type PublicMetadata = {
  image: string;
  name: string;
  private_media_uri: string;
};

type PrivateDocument = {
  media_type: string;
  name: string;
  uri: string;
};

type PrivateMetadata = {
  documents?: PrivateDocument[];
  image: string;
  name: string;
};

type Challenge = {
  expires_at: string;
  message: string;
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

type DemoState = {
  account: Address | undefined;
  apiBase: string;
  busy: boolean;
  delegateAddress: Address | undefined;
  delegationExpiresAt: string | undefined;
  delegationOutput: string | undefined;
  delegationOwner: Address | undefined;
  delegationResourceUri: string | undefined;
  delegationToken: string | undefined;
  privateImageUrl: string | undefined;
  privateMetadata: PrivateMetadata | undefined;
  publicMetadata: PublicMetadata | undefined;
  status: string | undefined;
  tokenId: string | undefined;
};

const state: DemoState = {
  account: undefined,
  apiBase: inferApiBase(),
  busy: false,
  delegateAddress: undefined,
  delegationExpiresAt: undefined,
  delegationOutput: undefined,
  delegationOwner: undefined,
  delegationResourceUri: undefined,
  delegationToken: undefined,
  privateImageUrl: undefined,
  privateMetadata: undefined,
  publicMetadata: undefined,
  status: undefined,
  tokenId: undefined,
};

const refs = {
  connect: element<HTMLButtonElement>("connect"),
  contract: element<HTMLElement>("contract"),
  delegateAddress: element<HTMLInputElement>("delegate-address"),
  delegationDelegate: element<HTMLElement>("delegation-delegate"),
  delegationOutput: element<HTMLPreElement>("delegation-output"),
  delegationOwner: element<HTMLElement>("delegation-owner"),
  grantJson: element<HTMLButtonElement>("grant-json"),
  loadToken: element<HTMLButtonElement>("load-token"),
  mint: element<HTMLButtonElement>("mint"),
  privateImage: element<HTMLDivElement>("private-image"),
  privateMetadata: element<HTMLPreElement>("private-metadata"),
  publicImage: element<HTMLDivElement>("public-image"),
  readDelegatedJson: element<HTMLButtonElement>("read-delegated-json"),
  status: element<HTMLParagraphElement>("status"),
  tokenId: element<HTMLInputElement>("token-id"),
  unlock: element<HTMLButtonElement>("unlock"),
};

let walletEventsBound = false;

bindEvents();
syncUi();

function bindEvents(): void {
  refs.connect.addEventListener("click", () => run(connectWallet));
  refs.mint.addEventListener("click", () => run(mint));
  refs.loadToken.addEventListener("click", () => run(loadToken));
  refs.unlock.addEventListener("click", () => run(unlockPrivateMedia));
  refs.grantJson.addEventListener("click", () => run(grantJsonAccess));
  refs.readDelegatedJson.addEventListener("click", () =>
    run(readDelegatedJson),
  );
  refs.delegateAddress.addEventListener("input", () => {
    const nextDelegate = parseOptionalAddress(refs.delegateAddress.value);
    if (state.delegateAddress !== nextDelegate) clearDelegationGrant();
    state.delegateAddress = nextDelegate;
    syncUi();
  });
  refs.tokenId.addEventListener("input", () => {
    state.tokenId = refs.tokenId.value.trim() || undefined;
    syncUi();
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
  setStatus(`Connected ${shortAddress(state.account)}.`);
}

async function mint(): Promise<void> {
  await connectIfNeeded();

  setStatus("Switching to Base Sepolia if needed.");
  await ensureDemoChain();

  setStatus("Confirm the mint transaction in your wallet.");
  const walletClient = createWalletClient({
    account: state.account,
    chain: demoChain,
    transport: custom(requireWallet()),
  });
  const publicClient = publicRpcClient();
  const hash = await walletClient.writeContract({
    account: state.account!,
    address: demoContractAddress,
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
  refs.tokenId.value = state.tokenId;
  setStatus(`Minted token ${state.tokenId}. Loading metadata.`);
  await loadToken();
  setStatus(`Minted token ${state.tokenId}. Metadata loaded.`);
}

async function loadToken(): Promise<void> {
  const tokenId = requireTokenId();

  setStatus(`Loading metadata for token ${tokenId}.`);
  const tokenUri = await readTokenUriWithRetry(tokenId);
  state.publicMetadata = await fetchJson<PublicMetadata>(
    demoMetadataUri(tokenUri),
  );
  state.privateMetadata = undefined;
  state.privateImageUrl = undefined;
  clearDelegationGrant();
  setStatus("Metadata loaded.");
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
  setStatus("Private image unlocked.");
}

async function grantJsonAccess(): Promise<void> {
  await connectIfNeeded();
  const document = thirdPartyDocument();
  const owner = state.account!;
  const delegate = requireDelegateAddress();
  if (isAddressEqual(owner, delegate)) {
    throw new Error(
      "Enter a different address to demonstrate third-party access.",
    );
  }

  setStatus("Owner signs a JSON-only grant for the third-party address.");
  const ownerAuthorization = await signForResource(
    document.uri,
    owner,
    walletSigner(),
  );
  const delegation = await postJson<{
    delegation_token: string;
    expires_at: string;
    resource_uri: string;
  }>("/api/delegations", {
    body: {
      account: owner,
      chainId: String(demoChain.id),
      contract: demoContractAddress,
      delegate,
      resourceUri: document.uri,
      tokenId: requireTokenId(),
    },
    headers: demoAuthHeaders(ownerAuthorization, owner),
  });

  state.delegationOwner = owner;
  state.delegationExpiresAt = delegation.expires_at;
  state.delegationResourceUri = delegation.resource_uri;
  state.delegationToken = delegation.delegation_token;
  state.delegationOutput = [
    "Grant created.",
    `Token owner: ${owner}`,
    `Third-party viewer: ${delegate}`,
    `Delegated document: ${delegation.resource_uri}`,
    `Grant expires: ${delegation.expires_at}`,
    "",
    `Switch your wallet to ${shortAddress(delegate)} and click "Read as delegated wallet".`,
  ].join("\n");
  setStatus(`Grant created for ${shortAddress(delegate)}.`);
}

async function readDelegatedJson(): Promise<void> {
  await connectIfNeeded();
  const document = thirdPartyDocument();
  const owner = requireDelegationOwner();
  const delegate = requireDelegateAddress();
  const delegationToken = requireDelegationToken();
  const activeWallet = state.account!;

  if (!isAddressEqual(activeWallet, delegate)) {
    throw new Error(
      `Switch your wallet to ${shortAddress(delegate)} to read as the delegated viewer.`,
    );
  }

  setStatus("Third-party viewer signs once for the JSON document.");
  const delegateAuthorization = await signForResource(
    document.uri,
    owner,
    walletSigner(),
  );

  setStatus(
    "Checking that the JSON-bound proof cannot unlock the private image.",
  );
  const imageUri = protectedImageResource();
  const imageResponse = await fetch(imageUri, {
    headers: demoAuthHeaders(delegateAuthorization, owner, delegationToken),
  });

  const sharedJson = await fetchJson<unknown>(document.uri, {
    headers: demoAuthHeaders(delegateAuthorization, owner, delegationToken),
  });

  state.delegationOwner = owner;
  state.delegationOutput = [
    "Flow:",
    `1. Owner granted access to: ${state.delegationResourceUri}`,
    `2. Demo API issued a delegation token scoped to that exact URI.`,
    `3. Third-party viewer signed SIWE once as: ${activeWallet}`,
    `4. The same JSON-bound proof ${
      imageResponse.ok
        ? "unexpectedly unlocked the private image"
        : `was denied for the private image with HTTP ${imageResponse.status}`
    }.`,
    "5. The JSON document read succeeded with that proof and grant.",
    "",
    `Token owner: ${owner}`,
    `Third-party viewer: ${delegate}`,
    `Grant expires: ${state.delegationExpiresAt}`,
    "",
    "JSON response:",
    JSON.stringify(sharedJson, null, 2),
  ].join("\n");
  setStatus(
    imageResponse.ok
      ? "Delegation was too broad."
      : "One signature read the JSON; private image stayed locked.",
  );
}

function run(action: () => Promise<void>): void {
  if (state.busy) return;
  state.busy = true;
  syncUi();
  void action()
    .catch(report)
    .finally(() => {
      state.busy = false;
      syncUi();
    });
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
  syncUi();
}

function bindWalletEvents(provider: EthereumProvider): void {
  if (walletEventsBound || !provider.on) return;
  provider.on("accountsChanged", (accounts) => {
    state.account = accounts[0] ? getAddress(accounts[0]) : undefined;
    state.status = state.account
      ? `Active wallet changed to ${shortAddress(state.account)}.`
      : "Wallet disconnected.";
    syncUi();
  });
  walletEventsBound = true;
}

async function ensureDemoChain(): Promise<void> {
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
          blockExplorerUrls: [demoChain.blockExplorers.default.url],
          chainId: hexChainId,
          chainName: demoChain.name,
          nativeCurrency: demoChain.nativeCurrency,
          rpcUrls: demoChain.rpcUrls.default.http,
        },
      ],
    });
  }
}

function publicRpcClient() {
  return createPublicClient({
    chain: demoChain,
    transport: http(demoChain.rpcUrls.default.http[0]),
  });
}

async function readTokenUriWithRetry(tokenId: string): Promise<string> {
  const client = publicRpcClient();
  let lastError: unknown;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await client.readContract({
        address: demoContractAddress,
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

function requireApiBase(): string {
  if (!state.apiBase) {
    throw new Error(
      "Demo API URL is not configured. Host the UI with the API.",
    );
  }
  return state.apiBase;
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

function requireDelegateAddress(): Address {
  if (!state.delegateAddress) {
    throw new Error("Enter a valid third-party viewer address.");
  }
  return state.delegateAddress;
}

function requireDelegationOwner(): Address {
  if (!state.delegationOwner) {
    throw new Error(
      "Grant JSON access before reading as the delegated wallet.",
    );
  }
  return state.delegationOwner;
}

function requireDelegationToken(): string {
  if (!state.delegationToken) {
    throw new Error(
      "Grant JSON access before reading as the delegated wallet.",
    );
  }
  return state.delegationToken;
}

function thirdPartyDocument(): PrivateDocument {
  return {
    media_type: "application/json",
    name: "Third-Party View",
    uri: demoProtectedResourceUrl("third-party-view.json"),
  };
}

function protectedImageResource(): string {
  return demoProtectedResourceUrl("image.svg");
}

function demoProtectedResourceUrl(fileName: string): string {
  const metadata = requirePublicMetadata();
  const url = new URL(metadata.private_media_uri);
  if (!url.pathname.endsWith("/metadata")) {
    throw new Error("Demo private_media_uri must end with /metadata.");
  }
  url.pathname = `${url.pathname.slice(0, -"/metadata".length)}/${fileName}`;
  return url.toString();
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

function report(error: unknown): void {
  state.status = error instanceof Error ? error.message : String(error);
  syncUi();
}

function setStatus(value: string): void {
  state.status = value;
  syncUi();
}

function clearDelegationGrant(): void {
  state.delegationExpiresAt = undefined;
  state.delegationOutput = undefined;
  state.delegationOwner = undefined;
  state.delegationResourceUri = undefined;
  state.delegationToken = undefined;
}

function syncUi(): void {
  refs.connect.textContent = state.account
    ? shortAddress(state.account)
    : "Connect wallet";
  refs.contract.textContent = shortAddress(demoContractAddress);
  refs.status.hidden = !state.status;
  refs.status.textContent = state.status ?? "";
  refs.tokenId.value = state.tokenId ?? refs.tokenId.value;
  refs.delegateAddress.disabled = state.busy;
  refs.tokenId.disabled = state.busy;
  refs.mint.disabled = state.busy;
  refs.loadToken.disabled = state.busy || !state.tokenId;
  refs.unlock.disabled = state.busy || !state.publicMetadata;
  refs.grantJson.disabled =
    state.busy || !state.publicMetadata || !state.delegateAddress;
  refs.readDelegatedJson.disabled =
    state.busy || !state.publicMetadata || !state.delegationToken;
  refs.connect.disabled = state.busy;
  refs.privateMetadata.textContent = state.privateMetadata
    ? JSON.stringify(state.privateMetadata, null, 2)
    : "Private metadata appears here.";
  refs.delegationOwner.textContent = state.delegationOwner
    ? shortAddress(state.delegationOwner)
    : state.account
      ? shortAddress(state.account)
      : "not connected";
  refs.delegationDelegate.textContent = state.delegateAddress
    ? shortAddress(state.delegateAddress)
    : "not set";
  refs.delegationOutput.textContent =
    state.delegationOutput ?? "Delegation result appears here.";
  showImage(
    refs.publicImage,
    state.publicMetadata?.image,
    state.publicMetadata?.name ?? "Public NFT image",
  );
  showImage(
    refs.privateImage,
    state.privateImageUrl,
    state.privateMetadata?.name ?? "Private NFT image",
  );
}

function showImage(
  target: HTMLDivElement,
  src: string | undefined,
  alt: string,
) {
  target.replaceChildren();
  if (!src) {
    const placeholder = document.createElement("div");
    placeholder.className = "placeholder";
    placeholder.textContent = "No image loaded";
    target.append(placeholder);
    return;
  }

  const image = document.createElement("img");
  image.src = src;
  image.alt = alt;
  target.append(image);
}

function shortAddress(address: Address): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function shortHash(hash: Hex): string {
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function parseOptionalAddress(value: string): Address | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  try {
    return getAddress(trimmed);
  } catch {
    return undefined;
  }
}

function demoMetadataUri(tokenUri: string): string {
  const url = new URL(tokenUri);
  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    return `${requireApiBase()}${url.pathname}${url.search}`;
  }
  return tokenUri;
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found as T;
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

function inferApiBase(): string {
  if (["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)) {
    return "http://127.0.0.1:3000";
  }
  return window.location.origin;
}
