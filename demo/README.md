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
7. Render the unlocked private `image`.

The advanced flow creates a signed demo delegation token for exactly
`third-party-view.json`. The delegate can read that JSON document, but the same token cannot unlock
the private image.

## Local Demo

Install dependencies:

```bash
npm install
```

Run the Vercel API locally:

```bash
DEMO_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000000 npm run demo:api
```

Run the GitHub Pages app locally:

```bash
VITE_DEMO_API_BASE_URL=http://localhost:3000 npm run demo:web
```

The local API uses the same handlers as Vercel, but runs from a small Node adapter so it does not
require `vercel link`. To mint real NFTs, deploy the contract and set `DEMO_CONTRACT_ADDRESS` to the
deployed address.

## Deploy the Contract

The contract is `demo/contracts/DemoPrivateMediaNFT.sol`. It uses a public `mint()` and token URIs
that point at the Vercel metadata API.

Set a funded Base Sepolia deployer key:

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

Also set this GitHub repository variable for Pages builds:

```text
VITE_DEMO_API_BASE_URL=https://your-vercel-project.vercel.app
```

## Deploy the API to Vercel

Required Vercel environment variables:

```text
DEMO_CONTRACT_ADDRESS=0x...
DEMO_DELEGATION_SECRET=<random secret>
DEMO_NONCE_SECRET=<random secret>
DEMO_PUBLIC_BASE_URL=https://your-vercel-project.vercel.app
DEMO_RPC_URL=https://sepolia.base.org
DEMO_WEB_ORIGIN=https://fairmint.github.io
```

Deploy:

```bash
npx --yes vercel
```

The hosted demo uses signed stateless nonces with best-effort in-memory replay detection and
stateless signed delegation tokens. This keeps the demo easy to deploy, but production deployments
should use durable nonce storage with atomic consume semantics.

## Deploy the UI to GitHub Pages

The workflow in `.github/workflows/pages.yml` builds `demo/web` and deploys `demo/web/dist`.

Before enabling Pages, set the repository variable:

```text
VITE_DEMO_API_BASE_URL=https://your-vercel-project.vercel.app
```

Then enable GitHub Pages with GitHub Actions as the source and run the `Deploy Demo Site` workflow.

## Validation

Run the full local validation:

```bash
npm run check
npm run format:check
git diff --check
```
