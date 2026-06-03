# eip-private-nft-media

Reference implementation and draft materials for Private NFT Media Authorization.

The primary use case is a standard wallet unlock flow for private NFT media. A wallet detects
`private_media_uri` in public token metadata, asks the owner or authorized account to sign a SIWE
challenge, and then displays the returned private `image` instead of the public preview. Additional
private media, documents, and resources can use the same authorization flow.

## Contents

- [EIP draft](docs/eip-private-nft-media.md)
- [Ethereum Magicians initial post draft](docs/eip-private-nft-media-magicians-post.md)
- [TypeScript reference implementation](src)
- [Behavioral tests](test)

## Reference Implementation

The implementation is framework-agnostic TypeScript. It covers:

- deterministic SIWE resource binding construction and parsing;
- `Authorization: SIWE ...` header encoding and parsing;
- nonce issuance and single-use consumption;
- ERC-721 owner, token approval, operator, and delegation checks;
- ERC-1155 positive-balance, operator, and delegation checks;
- EIP-1271 contract-account signature verification hook;
- resource-scoped delegation, including selective access to manifest entries.

Install dependencies and run the checks:

```bash
npm install
npm run check
```

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
