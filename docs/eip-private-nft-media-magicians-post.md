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

The proposed metadata addition is one new public metadata field:

```json
{
  "name": "Example NFT",
  "description": "Public description safe for unauthenticated clients.",
  "image": "https://example.com/public-preview.png",
  "private_media_uri": "https://media.example.com/eip-private-nft-media/8453/0xabc0000000000000000000000000000000000000/42"
}
```

ERC-721 tokens would expose this JSON through `tokenURI(tokenId)`. ERC-1155 tokens would expose it
through the existing metadata URI returned by `uri(id)`.

`private_media_uri` is only a discovery pointer. It must be an absolute HTTPS URI, must not include
a fragment or embedded userinfo, and must not contain secrets, bearer tokens, account-specific
secrets, or private media payloads. Existing clients can ignore it and continue rendering the public
`image`.

## Wallet Flow

The primary wallet use case is:

1. The wallet reads normal ERC-721/ERC-1155 metadata and renders the public `image`.
2. The wallet sees `private_media_uri` and requests it.
3. The resource server returns `401 Unauthorized` with `WWW-Authenticate: SIWE` and a
   `challenge_uri`.
4. The wallet asks the owner, holder, or another authorized account to sign the SIWE message.
5. The wallet retries the protected URI with the signed SIWE proof.
6. The resource server verifies the signature and token authorization, then returns private JSON
   metadata containing `image`.
7. The wallet renders that private `image` as the unlocked NFT media.

The intent is that wallet providers can implement this once: detect `private_media_uri`, run the
SIWE unlock flow, and replace the public preview with the private `image`.

## SIWE Binding

The SIWE challenge binds the signature to the exact resource being requested. The challenge message
must include the resource server domain, requested private media URI, token chain id, nonce,
expiration, and a token-scoped SIWE `resources` entry:

```text
eip155:{chainId}/{standard}:{contractAddress}/{tokenId}?account={account}&resource={privateMediaUri}
```

For example:

```text
eip155:8453/erc721:0xabc0000000000000000000000000000000000000/42?account=0x1230000000000000000000000000000000000000&resource=https%3A%2F%2Fmedia.example.com%2Feip-private-nft-media%2F8453%2F0xabc0000000000000000000000000000000000000%2F42
```

The resource server verifies the SIWE message, signature, nonce, expiration, domain, URI, chain,
contract, token id, account, and exact private media URI before serving content. EIP-1271 is used
for contract-account signatures.

For ERC-721, the bound account must be the current `ownerOf(tokenId)`. For ERC-1155, the bound
account must have `balanceOf(account, id) > 0`. Resource servers may also support approved
operators or delegates if their own content policy treats those relationships as authorization.

## Additional Resources

The same exact-resource binding can protect more than the unlocked NFT image. For example, a holder
could authorize a third-party site to fetch `third-party-view.json` without granting access to
`private-image.png` or every protected resource for the token. The proposal does not define a global
delegation registry; it only defines how a protected URI is discovered and how SIWE authorization is
scoped to that exact URI.

The draft builds on existing ERC-721/ERC-1155 metadata, SIWE, and EIP-1271 contract-account
signatures. It does not add a new on-chain interface.

I would especially appreciate feedback on whether `private_media_uri` is clear, whether the SIWE
challenge flow fits wallet and media-client expectations, and whether this is small enough for
wallets, indexers, NFT projects, and media servers to implement consistently.

Thanks for reading.
