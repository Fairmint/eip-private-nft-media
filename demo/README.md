# End-to-End Demo

This demo keeps the standard simple while making the flow testable:

- Vercel hosts the wallet UI in `demo/web` and routes `/api/**` through one function in `api/index.ts`.
- The Hono API implementation lives in `demo/api`.
- Base Sepolia hosts `DemoPrivateMediaNFT`, an ERC-721 with public `mint()`.

The demo uses the checked-in Base Sepolia contract
`0xeeeE12600d717eB1e228963Ef58D1354de5236D9`. Its original `tokenURI` base points at
`127.0.0.1` from local testing; the web app normalizes that loopback metadata URL to the current
demo origin.

The wallet flow is:

1. Mint a demo NFT.
2. Read public metadata from `tokenURI`.
3. Render the public `image`.
4. Request `private_media_uri`.
5. Sign the SIWE challenge.
6. Retry with `Authorization: SIWE ...`.
7. Render the unlocked private `image` from the returned private metadata.

Secondary demo: after public metadata is loaded, enter a separate third-party wallet address, create
a delegation token scoped only to `third-party-view.json`, switch to that wallet, and confirm it can
read the JSON document but cannot unlock the private image. The private image does not need to be
unlocked first. The third-party wallet signs as itself while the token owner remains the bound
`account`, so the API must verify the delegation token before serving content. The token format is
demo-only; the standard behavior is exact-resource enforcement.

## Local Demo

Install dependencies:

```bash
npm install
```

Run the Hono API locally:

```bash
npm run demo:api
```

Run the web app locally:

```bash
npm run demo:web
```

The local API uses the same Hono app and checked-in Base Sepolia contract as Vercel.

## Browser Checklist

With the API and web app running:

1. Connect a wallet on Base Sepolia.
2. Click **Mint NFT** and confirm the transaction.
3. Confirm the public preview image appears.
4. Enter a different wallet address in **Third-party address**.
5. Click **Grant JSON access** and sign with the token owner wallet.
6. Switch your wallet to the third-party address.
7. Click **Read as delegated wallet**.
8. Confirm the third-party wallet can read `third-party-view.json` but cannot read the private
   image.
9. Switch back to the owner wallet.
10. Click **Sign SIWE and unlock** and sign the message.
11. Confirm the private image replaces the locked state.

## Deploy the Hosted Demo

The hosted demo is a single Vercel app. Vercel serves the static wallet UI and rewrites `/api/**`
to the single API function on the same origin, so the browser app can infer the API URL
automatically.

Required Vercel environment variables. These are secrets:

```text
DEMO_DELEGATION_SECRET=<random secret for demo delegation and image URLs>
DEMO_NONCE_SECRET=<random secret>
```

Vercel deploys automatically from the connected Git repository. The checked-in `vercel.json`
defines the install command, build command, output directory, API function settings, and the
`/api/**` rewrite.

## Replace the Demo Contract

This is optional. The checked-in contract above is already deployed and usable.

The contract is `demo/contracts/DemoPrivateMediaNFT.sol`. It uses a public `mint()` and token URIs.

Set a funded Base Sepolia deployer key and pass the hosted demo URL:

```bash
export DEMO_DEPLOYER_PRIVATE_KEY=0x...
npm run demo:deploy-contract -- https://your-vercel-project.vercel.app
```

After deployment, update `demoContractAddress` in `demo/shared/demo-nft.ts`.

Merge the contract address update to the branch Vercel deploys from, or trigger a redeploy in the
Vercel dashboard.

The hosted demo uses signed stateless nonces with best-effort in-memory replay detection,
demo-specific JWT delegation tokens, and short-lived JWT image URLs. This keeps the demo easy to
deploy and self-contained, but it is not production-grade authorization storage. Production
deployments should use durable nonce storage with atomic consume semantics.

## Validation

Run the full local validation:

```bash
npm run check
npm run format:check
git diff --check
```

`npm run check` includes a local API smoke test for public metadata, `WWW-Authenticate: SIWE`, and
the challenge endpoint.
