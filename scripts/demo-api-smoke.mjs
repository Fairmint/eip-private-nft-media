import { spawn } from "node:child_process";

import { sign } from "hono/jwt";

const remoteApiBase = process.env.DEMO_SMOKE_BASE_URL?.replace(/\/$/u, "");
const demoChainId = 84532;
const demoContractAddress = "0xeeeE12600d717eB1e228963Ef58D1354de5236D9";
const demoDelegationSecret =
  process.env.DEMO_DELEGATION_SECRET ??
  (remoteApiBase ? undefined : "local-demo-secret-change-me");

if (remoteApiBase) {
  await smoke(remoteApiBase);
  console.log("Deployed demo smoke test passed.");
  process.exit(0);
}

const port = 3100 + Math.floor(Math.random() * 1000);
const apiBase = `http://127.0.0.1:${port}`;
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(npmCommand, ["run", "demo:api"], {
  detached: process.platform !== "win32",
  env: {
    ...process.env,
    PORT: String(port),
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let logs = "";
child.stdout.on("data", (chunk) => {
  logs += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  logs += chunk.toString();
});

try {
  await waitForServer();
  await smoke(apiBase, demoContractAddress);
  console.log("Demo API smoke test passed.");
} finally {
  await stopServer();
}

async function smoke(baseUrl, expectedContract) {
  const configuredContract = expectedContract ?? demoContractAddress;

  const metadataUrl = `${baseUrl}/api/metadata/${demoChainId}/${configuredContract}/1`;
  const metadata = await getJson(metadataUrl);
  assert(
    metadata.private_media_uri?.includes(`/api/private/${demoChainId}/`),
    "metadata missing private_media_uri",
  );

  const protectedResponse = await fetch(metadata.private_media_uri, {
    headers: {
      "X-Demo-Account": "0x1111111111111111111111111111111111111111",
    },
  });
  assert(protectedResponse.status === 401, "protected metadata should 401");
  const authenticate = protectedResponse.headers.get("WWW-Authenticate") ?? "";
  const challengeUri = /challenge_uri="([^"]+)"/u.exec(authenticate)?.[1];
  assert(challengeUri, "missing challenge_uri");

  const challengeUrl = new URL(challengeUri);
  challengeUrl.searchParams.set(
    "address",
    "0x1111111111111111111111111111111111111111",
  );
  challengeUrl.searchParams.set(
    "account",
    "0x2222222222222222222222222222222222222222",
  );
  const challenge = await getJson(challengeUrl.toString());
  assert(typeof challenge.message === "string", "missing SIWE message");
  assert(typeof challenge.expires_at === "string", "missing expiration");
  assert(
    challenge.message.includes(
      "account=0x2222222222222222222222222222222222222222",
    ),
    "challenge did not bind account",
  );

  if (demoDelegationSecret) {
    const imageUrl = `${baseUrl}/api/private/${demoChainId}/${configuredContract}/1/image.svg`;
    const signedImageUrl = new URL(await signedResourceUrl(imageUrl));
    signedImageUrl.searchParams.set("chainId", String(demoChainId));
    signedImageUrl.searchParams.set("contract", configuredContract);
    signedImageUrl.searchParams.set("tokenId", "1");

    const imageResponse = await fetch(signedImageUrl);
    assert(imageResponse.status === 200, "signed private image should load");
    assert(
      imageResponse.headers.get("content-type")?.startsWith("image/svg+xml"),
      "signed private image should return SVG",
    );
  }
}

async function signedResourceUrl(resourceUri) {
  const url = new URL(resourceUri);
  const grant = {
    exp: Math.floor((Date.now() + 5 * 60 * 1000) / 1000),
    resourceUri,
    version: 1,
  };
  url.searchParams.set(
    "access_token",
    await sign(grant, demoDelegationSecret, "HS256"),
  );
  return url.toString();
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} failed with ${response.status}`);
  return response.json();
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`demo API exited early:\n${logs}`);
    }
    try {
      await getJson(
        `${apiBase}/api/metadata/${demoChainId}/${demoContractAddress}/1`,
      );
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`demo API did not start:\n${logs}`);
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function stopServer() {
  if (child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));

  try {
    if (process.platform === "win32") child.kill();
    else if (child.pid) process.kill(-child.pid, "SIGTERM");
  } catch {
    // The process may already be gone.
  }

  await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
}
