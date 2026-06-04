# End-to-End Demo

This demo keeps the standard simple while making the flow testable:

- Vercel hosts the wallet UI in `demo/web` and the protected resources in `api`.
- Base Sepolia hosts `DemoPrivateMediaNFT`, an ERC-721 with public `mint()`.

The wallet flow is:

1. Mint a demo NFT.
2. Read public metadata from `tokenURI`.
3. Render the public `image`.
4. Request `private_media_uri`.
5. Sign the SIWE challenge.
6. Retry with `Authorization: SIWE ...`.
7. Render the unlocked private `image` from the returned private metadata.

Secondary demo: create a token scoped only to `third-party-view.json`, then confirm it cannot unlock
the private image. The token format is demo-only; the standard behavior is exact-resource
enforcement.

## Local Demo

Install dependencies:

```bash
npm install
```

Run the Vercel API locally:

```bash
npm run demo:api
```

Run the web app locally:

```bash
npm run demo:web
```

The local API uses the same handlers as Vercel. To run the full flow locally, deploy the Base
Sepolia contract first, then restart the API with:

```bash
DEMO_CONTRACT_ADDRESS=0x... npm run demo:api
```

## Browser Checklist

With the API and web app running:

1. Connect a wallet on Base Sepolia.
2. Click **Mint NFT** and confirm the transaction.
3. Confirm the public preview image appears.
4. Click **Sign SIWE and unlock** and sign the message.
5. Confirm the private image replaces the locked state.
6. Click **Verify delegated JSON only**.
7. Confirm the generated delegate can read `third-party-view.json` but cannot read the private
   image.

## Deploy the Hosted Demo

The hosted demo is a single Vercel app. Vercel serves the static wallet UI and the `/api` functions
from the same origin, so the browser app can infer the API URL automatically.

Create or link a Vercel project first so you know the final production URL. The contract embeds this
URL in `tokenURI`, so testnet deployments require an HTTPS `DEMO_PUBLIC_BASE_URL`.

Required Vercel environment variables:

```text
DEMO_CONTRACT_ADDRESS=0x...  # set after contract deployment
DEMO_DELEGATION_SECRET=<random secret for demo delegation and image URLs>
DEMO_NONCE_SECRET=<random secret>
DEMO_PUBLIC_BASE_URL=https://your-vercel-project.vercel.app
DEMO_RPC_URL=https://sepolia.base.org
```

Required GitHub Actions secrets:

```text
VERCEL_TOKEN=<Vercel token allowed to deploy the project>
VERCEL_ORG_ID=<Vercel team or user id>
VERCEL_PROJECT_ID=<Vercel project id>
```

The `Deploy Demo` workflow runs on pushes to `main` and can also be started manually. It runs the
full checks, builds the Vercel output, deploys to production, and smoke-tests the deployed API.

## Deploy the Contract

The contract is `demo/contracts/DemoPrivateMediaNFT.sol`. It uses a public `mint()` and token URIs
that point at the Vercel metadata API.

Set a funded Base Sepolia deployer key and the Vercel API URL:

```bash
export DEMO_DEPLOYER_PRIVATE_KEY=0x...
export DEMO_RPC_URL=https://sepolia.base.org
export DEMO_PUBLIC_BASE_URL=https://your-vercel-project.vercel.app
npm run demo:deploy-contract
```

After deployment, set the printed contract address in Vercel:

```bash
npx --yes vercel env add DEMO_CONTRACT_ADDRESS
```

Deploy or redeploy the hosted demo:

```bash
gh workflow run "Deploy Demo"
```

The hosted demo uses signed stateless nonces with best-effort in-memory replay detection,
demo-specific signed delegation tokens, and short-lived signed image URLs. This keeps the demo easy
to deploy and self-contained, but it is not production-grade authorization storage. Production
deployments should use durable nonce storage with atomic consume semantics.

## Validation

Run the full local validation:

```bash
npm run check
npm run format:check
git diff --check
```

`npm run check` includes a local API smoke test for `/api/demo/config`, public metadata,
`WWW-Authenticate: SIWE`, and the challenge endpoint.
