---
title: SIWE-Gated NFT Media URI Magicians Post
description: Draft initial Ethereum Magicians post for the SIWE-Gated NFT Media URI proposal.
---

# SIWE-Gated NFT Media URI Magicians Post

This document drafts the initial Ethereum Magicians discussion post required before submitting the
SIWE-Gated NFT Media URI proposal upstream.

## Reference Patterns

Recent ERC discussion threads work best when the opening post is shorter than the full draft,
states the use case plainly, and asks for concrete feedback. Useful examples include
[ERC-8126](https://ethereum-magicians.org/t/erc-8126-ai-agent-verification/27445),
[ERC-8118](https://ethereum-magicians.org/t/erc-8118-agent-authorization/27402), and
[ERC-8103](https://ethereum-magicians.org/t/erc-8103-permissioned-authorization-object/27135).

## Recommended Forum Metadata

Thread title:

```text
ERC Draft: SIWE-Gated NFT Media URI
```

Category:

```text
ERCs
```

Suggested tags:

```text
erc, nft, privacy, siwe
```

## Proposed Initial Post

Hi everyone,

I would like feedback on a new ERC draft: **SIWE-Gated NFT Media URI**.

The core use case is simple: a wallet sees `private_media_uri` in public NFT metadata, asks the
owner, holder, or another authorized subject to sign a SIWE challenge, then displays the returned
private `image` instead of the public preview. Existing clients that do not implement the proposal
can keep rendering the public metadata.

Draft specification:

```text
https://github.com/Fairmint/eip-private-nft-media/blob/main/docs/eip-private-nft-media.md
```

## Summary

Discovery stays in existing ERC-721/ERC-1155 metadata:

```json
{
  "image": "https://example.com/public-preview.png",
  "private_media_uri": "https://media.example.com/eip-private-nft-media/1/0xabc.../42"
}
```

An unauthenticated request to that URI returns `401 Unauthorized` with a `WWW-Authenticate: SIWE`
challenge. The challenge endpoint returns a SIWE message whose `uri` is the private media URI. The
SIWE `resources` entry binds the proof to the chain, token standard, contract, token id, token
account, private media URI, nonce, and expiration.

The resource server verifies the SIWE signature, including EIP-1271 for contract accounts, and checks
token authorization at request time. For ERC-721, the bound account must be the owner. For ERC-1155,
the bound account must have `balanceOf(account, id) > 0`. Resource servers may also accept approved
operators or delegates if their policy treats those relationships as content-access grants.

On success, the protected URI can return direct media or private JSON metadata. If private JSON
metadata includes `image`, wallets should render that as the unlocked NFT image.

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
