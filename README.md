# eip-private-nft-media

Reference implementation and draft materials for SIWE-Gated NFT Media URI.

The primary use case is a standard wallet unlock flow for private NFT media. A wallet detects
`private_media_uri` in public token metadata, asks the owner or authorized account to sign a SIWE
challenge, and then displays the returned private `image` instead of the public preview. Additional
private media, documents, and resources can use the same authorization flow. For example, a holder
can delegate access to one protected `.json` resource for a third-party site without sharing the
unlocked `image`. The demo uses a demo-specific delegation token; the standard part is exact
resource binding and enforcement.

## Contents

- [EIP draft](docs/eip-private-nft-media.md)
- [Ethereum Magicians initial post draft](docs/eip-private-nft-media-magicians-post.md)
- [TypeScript reference implementation](src)
- [End-to-end demo](demo)
- [Behavioral tests](test)

## Reference Implementation

The implementation is framework-agnostic TypeScript. It covers:

- SIWE challenge construction;
- deterministic SIWE resource binding construction and parsing;
- `Authorization: SIWE ...` header encoding and parsing;
- nonce issuance and single-use consumption;
- ERC-721 owner checks, plus opt-in token approval, operator, and delegation checks;
- ERC-1155 positive-balance checks, plus opt-in operator and delegation checks;
- EIP-1271 contract-account signature verification hook;
- resource-scoped delegation, including selective access to additional protected resources.

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

The verifier expects callers to provide chain-reading functions for ownership, approval, balances,
and optional EIP-1271 signature checks. The in-memory nonce and delegation stores are reference
utilities for examples and tests, not production storage.

The verifier enforces HTTPS private media URIs, with a loopback HTTP exception for local demo
development only.
