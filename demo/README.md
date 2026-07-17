# Private NFT media demo

The demo exercises the browser-to-resource-server flow described in the
[draft specification](../docs/eip-private-nft-media.md). It is a local and
hosted reference, not production authorization infrastructure.

## What it proves

1. Mint or select the configured Base Sepolia ERC-721.
2. Render the public metadata preview.
3. Discover `private_media_uri`.
4. Obtain and sign an exact-resource SIWE challenge.
5. Render the returned private `image`.
6. Grant a second wallet access to one JSON resource and prove that the same
   delegation cannot unlock the private image.

The API implementation lives in [`demo/api`](api), the wallet UI in
[`demo/web`](web), and the Vercel function entry point in [`api/index.ts`](../api/index.ts).

## Run locally

Install dependencies from the repository root:

```bash
npm ci
```

Run the API and web app in separate terminals:

```bash
npm run demo:api
npm run demo:web
```

Use [`demo/shared/demo-nft.ts`](shared/demo-nft.ts) as the current source of
truth for the chain and contract. Do not copy its address into durable
instructions.

## Browser checklist

1. Connect a wallet on Base Sepolia.
2. Mint the demo NFT or select one already owned by the connected wallet.
3. Confirm the public preview appears.
4. Sign the SIWE challenge and confirm the private image replaces the preview.
5. Enter a different wallet address and grant it access to
   `third-party-view.json`.
6. Switch to that wallet and confirm it can read the delegated JSON document but
   cannot unlock the private image.

The third-party wallet signs as itself while the token owner remains the bound
`account`. The API must verify exact-resource delegation before serving the
document. The demo's JWT delegation format is not part of the protocol.

## Hosted deployment

The hosted demo is one Vercel application. Static wallet assets and `/api/**`
share an origin, while the API entry point may run in multiple serverless
instances.

Required Vercel environment variables are secrets:

```text
DEMO_DELEGATION_SECRET=<random secret for demo delegation and image URLs>
DEMO_NONCE_SECRET=<random secret>
```

The checked-in [`vercel.json`](../vercel.json) owns the install command, build
command, output directory, function settings, and `/api/**` rewrite.

To replace the demo contract, set a funded Base Sepolia deployer key and pass
the hosted origin:

```bash
export DEMO_DEPLOYER_PRIVATE_KEY=0x...
npm run demo:deploy-contract -- https://your-vercel-project.vercel.app
```

After deployment, update `demoContractAddress` in
[`demo/shared/demo-nft.ts`](shared/demo-nft.ts) and redeploy the application.

## Production boundary

The hosted demo deliberately uses:

- signed stateless nonces with process-local, best-effort replay detection;
- demo-only JWT delegation tokens; and
- short-lived JWT image URLs.

That design is unsafe as production authorization storage across process
restarts or multiple instances. Production requires durable atomic nonce
consumption, explicit delegation persistence and revocation, protected asset
storage, reliable chain reads, rate limiting, audit evidence, and carefully
scoped caching.

The resource-server authorization boundary is
[`demo/api/lib/protected-resource.ts`](api/lib/protected-resource.ts).

## Validation

```bash
npm run check
npm run format:check
git diff --check
```

`npm run check` includes type checking, unit tests, the demo build, and an API
smoke test for public metadata and challenge discovery.
