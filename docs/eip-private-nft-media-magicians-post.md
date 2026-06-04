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
[eip-private-nft-media.md](https://github.com/Fairmint/eip-private-nft-media/blob/main/docs/eip-private-nft-media.md)

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

The draft builds on existing ERC-721/ERC-1155 metadata, SIWE, and EIP-1271 contract-account
signatures. It does not add a new on-chain interface.

I would especially appreciate feedback on whether `private_media_uri` is clear, whether the SIWE
challenge flow fits wallet and media-client expectations, and whether this is small enough for
wallets, indexers, NFT projects, and media servers to implement consistently.

Thanks for reading.
