# End-to-End Demo

This demo keeps the standard simple while making the flow testable:

- GitHub Pages hosts the wallet UI in `demo/web`.
- Vercel Functions host the protected resources in `api`.
- Base Sepolia hosts `DemoPrivateMediaNFT`, an ERC-721 with public `mint()`.

The wallet flow is:

1. Mint a demo NFT.
2. Read public metadata from `tokenURI`.
3. Render the public `image`.
4. Request `private_media_uri`.
5. Sign the SIWE challenge.
6. Retry with `Authorization: SIWE ...`.
7. Render the unlocked private `image` from the returned private metadata.

The advanced flow creates a demo-specific signed delegation token for exactly
`third-party-view.json`. The delegate can read that JSON document, but the same token cannot unlock
the private image. The token format is not part of the draft standard; exact-resource binding is.

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

The local API uses the same handlers as Vercel, but runs from a small Node adapter so it does not
require `vercel link`. The local web app automatically uses `http://127.0.0.1:3000` for the API.
Minting is disabled until the API has a deployed Base Sepolia contract address.

For the full flow, deploy the contract and restart the API with the deployed address:

```bash
DEMO_CONTRACT_ADDRESS=0x... npm run demo:api
```

## Deploy the API to Vercel

Create or link a Vercel project first so you know the final API URL. The contract embeds this URL in
`tokenURI`, so testnet deployments require an HTTPS `DEMO_PUBLIC_BASE_URL`.

Required Vercel environment variables:

```text
DEMO_CONTRACT_ADDRESS=0x...  # set after contract deployment
DEMO_DELEGATION_SECRET=<random secret for demo delegation and image URLs>
DEMO_NONCE_SECRET=<random secret>
DEMO_PUBLIC_BASE_URL=https://your-vercel-project.vercel.app
DEMO_RPC_URL=https://sepolia.base.org
DEMO_WEB_ORIGIN=https://fairmint.github.io
```

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

Deploy or redeploy the API:

```bash
npx --yes vercel
```

The hosted demo uses signed stateless nonces with best-effort in-memory replay detection,
demo-specific signed delegation tokens, and short-lived signed image URLs. This keeps the demo easy
to deploy and self-contained, but it is not production-grade authorization storage. Production
deployments should use durable nonce storage with atomic consume semantics.

## Deploy the UI to GitHub Pages

The workflow in `.github/workflows/pages.yml` builds `demo/web` and deploys `demo/web/dist`.

Before enabling Pages, set the repository variable:

```text
VITE_DEMO_API_BASE_URL=https://your-vercel-project.vercel.app
```

Then enable GitHub Pages with GitHub Actions as the source and run the `Deploy Demo Site` workflow.
The demo can infer the API URL when the UI and API share one origin. GitHub Pages is a separate
origin from Vercel, so the workflow intentionally fails if `VITE_DEMO_API_BASE_URL` is not set.

## Validation

Run the full local validation:

```bash
npm run check
npm run format:check
git diff --check
```

`npm run check` includes a local API smoke test for `/api/demo/config`, public metadata,
`WWW-Authenticate: SIWE`, and the challenge endpoint.
