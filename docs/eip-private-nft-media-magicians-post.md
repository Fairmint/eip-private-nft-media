---
title: SIWE-Gated NFT Media URI Magicians Post
description: Draft initial Ethereum Magicians post for the SIWE-Gated NFT Media URI proposal.
---

# ERC Draft: SIWE-Gated NFT Media URI

Hi everyone,

I would like feedback on a new ERC draft: **SIWE-Gated NFT Media URI**.

The core use case is simple: a wallet sees `private_media_uri` in public NFT metadata, asks an
authorized account to sign a SIWE challenge, then displays the returned private `image` instead of
the public preview. Existing clients that do not implement the proposal can keep rendering the
public metadata.

Draft specification:

```text
https://github.com/Fairmint/eip-private-nft-media/blob/main/docs/eip-private-nft-media.md
```

## Summary

Discovery stays in existing ERC-721/ERC-1155 metadata:

```json
{
  "image": "https://example.com/public-preview.png",
  "private_media_uri": "https://media.example.com/eip-private-nft-media/8453/0xabc0000000000000000000000000000000000000/42"
}
```

Requesting that URI without authorization returns `401 Unauthorized` with
`WWW-Authenticate: SIWE`. The wallet fetches the challenge, the owner or holder signs, the resource
server verifies SIWE plus current ownership or balance, and the protected URI returns private JSON
metadata with `image`. Wallets render that `image` as the unlocked NFT media.

The same exact-resource binding can protect additional resources. For example, a holder could
authorize a third-party site to fetch `third-party-view.json` without granting access to
`private-image.png` or every protected resource for the token.

## Non-Goals

This proposal does not try to:

- define a new on-chain discovery interface;
- standardize encrypted on-chain payloads;
- define a global delegation registry or key distribution system;
- make zero-knowledge ownership proofs the baseline;
- make the private media URI confidential.

## Dependencies

The current draft references:

- ERC-721 and ERC-1155 for NFT ownership and balances;
- EIP-1271 for contract-account signatures;
- EIP-4361 for SIWE.

## Feedback Requested

I would appreciate early feedback on these design questions:

1. Is `private_media_uri` the right public metadata field name?
2. Does the `WWW-Authenticate: SIWE` challenge flow fit wallet and media-client expectations?
3. Is account-bound authorization the right model for ERC-1155 holder and optional operator flows?
4. Is exact-resource binding enough for selective access, such as sharing one protected `.json`
   resource without standardizing a delegation system?

Thanks for reading. I would especially welcome feedback from wallet implementers, NFT indexers,
ERC-721/ERC-1155 contract authors, and teams that have implemented token-gated or private NFT media
flows.
