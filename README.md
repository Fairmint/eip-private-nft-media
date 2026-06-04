# eip-private-nft-media

Reference implementation and draft materials for SIWE-Gated NFT Media URI.

The primary use case is a standard wallet unlock flow for private NFT media. A wallet detects
`private_media_uri` in public token metadata, asks the owner or holder to sign a SIWE challenge, and
displays the returned private `image` instead of the public preview. The same exact-resource binding
can also protect a separate JSON resource for selective sharing.

## Contents

- [EIP draft](docs/eip-private-nft-media.md)
- [Ethereum Magicians initial post draft](docs/eip-private-nft-media-magicians-post.md)
- [TypeScript reference implementation](src)
- [End-to-end demo](demo)
- [Behavioral tests](test)

## Reference Implementation

The implementation covers SIWE challenge generation, `Authorization: SIWE` parsing, exact resource
binding, nonce replay protection, ERC-721 owner checks, ERC-1155 holder checks, and optional hooks
for contract-account signatures or delegated access.

Install dependencies with Node 24 or newer and run the checks:

```bash
npm install
npm run check
```

## End-to-End Demo

The demo shows the proposal on Base Sepolia:

1. a public ERC-721 mint;
2. public metadata with `private_media_uri`;
3. SIWE unlock for the private `image`;
4. a delegation token scoped to one protected `.json` resource.

See [demo/README.md](demo/README.md) for local setup, Vercel API deployment, GitHub Pages
deployment, and testnet contract deployment.

The main verification entrypoint is `verifyPrivateMediaAuthorization`:

```ts
import {
  createPrivateMediaResourceBinding,
  verifyPrivateMediaAuthorization,
} from "@fairmint/eip-private-nft-media";
```

The verifier expects callers to provide chain-reading functions for ownership, balances, optional
approval or delegation checks, and optional EIP-1271 signature checks. The in-memory nonce store is a
reference utility for examples and tests, not production storage.

The verifier enforces HTTPS private media URIs, with a loopback HTTP exception for local demo
development only.
