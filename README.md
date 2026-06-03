# eip-private-nft-media

Reference implementation and draft materials for Private NFT Media Authorization.

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
