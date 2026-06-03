import { spawn } from "node:child_process";

const port = 3100 + Math.floor(Math.random() * 1000);
const apiBase = `http://127.0.0.1:${port}`;
const contract = "0x0000000000000000000000000000000000000000";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(npmCommand, ["run", "demo:api"], {
  env: {
    ...process.env,
    DEMO_CONTRACT_ADDRESS: contract,
    DEMO_PUBLIC_BASE_URL: apiBase,
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
  await smoke();
  console.log("Demo API smoke test passed.");
} finally {
  child.kill();
}

async function smoke() {
  const config = await getJson(`${apiBase}/api/demo/config`);
  assert(config.contractAddress === contract, "config contract mismatch");

  const metadataUrl = `${apiBase}/api/metadata/84532/${contract}/1`;
  const metadata = await getJson(metadataUrl);
  assert(
    metadata.private_media_uri?.includes("/api/private/84532/"),
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
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} failed with ${response.status}`);
  return response.json();
}

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`demo API exited early:\n${logs}`);
    }
    try {
      await getJson(`${apiBase}/api/demo/config`);
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
