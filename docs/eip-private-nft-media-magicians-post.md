---
title: SIWE-Gated NFT Media URI Magicians Post
description: Draft initial Ethereum Magicians post for the SIWE-Gated NFT Media URI proposal.
---

# SIWE-Gated NFT Media URI Magicians Post

This document drafts the initial Ethereum Magicians discussion post required before submitting the
SIWE-Gated NFT Media URI proposal upstream.

## Reference Patterns

Recent Ethereum Magicians EIP/ERC discussion threads tend to work best when the opening post is
shorter than the full EIP and asks for concrete review:

- [ERC-8126: AI Agent Verification](https://ethereum-magicians.org/t/erc-8126-ai-agent-verification/27445)
  opens with a plain-language proposal, lists the main design elements, names dependencies, and ends
  with specific feedback questions.
- [ERC-8118: Agent Authorization](https://ethereum-magicians.org/t/erc-8118-agent-authorization/27402)
  includes abstract, pull request link, key features, use cases, dependencies, and a short
  checklist.
- [ERC-8103: Permissioned Authorization Object](https://ethereum-magicians.org/t/erc-8103-permissioned-authorization-object/27135)
  starts with the narrow scope, explains what the proposal does not define, and then gives summary,
  motivation, and specification details.
- [ERC-1450: RTA-Controlled Security Token Standard](https://ethereum-magicians.org/t/erc-1450-rta-controlled-security-token-standard/26385)
  links to the full draft and asks for discussion on concrete design tradeoffs.

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

I would like to propose a new ERC draft: **SIWE-Gated NFT Media URI**.

The goal is to make private NFT media work consistently in wallets: a wallet sees
`private_media_uri`, asks the owner or another authorized account to sign a SIWE challenge, and then
displays the unlocked private `image` in place of the public preview. The same authorization flow can
also expose additional private media, documents, or resources without putting sensitive content in
public metadata, public token URIs, on-chain event logs, or authorization-bearing URLs. For example,
a holder can authorize a third-party site to fetch one protected `.json` resource without sharing the
unlocked image.

## Abstract

This proposal defines a discovery and authorization pattern for NFTs whose full media or metadata
cannot be public by default.

The token's public metadata exposes an opaque HTTPS private media URI. A wallet or application
requests that URI, receives a Sign-In with Ethereum (SIWE) challenge, signs the challenge, and
receives the protected metadata or media only after the resource server verifies token-scoped
authorization.

The core response is private NFT metadata or media for wallet display, including a private `image`
that replaces the public preview after authorization. The response can also list a manifest of
additional protected resources whose access can be scoped independently. Existing ERC-721 and
ERC-1155 public metadata behavior remains compatible with wallets and indexers that do not implement
this proposal.

Draft specification:

```text
https://github.com/Fairmint/eip-private-nft-media/blob/main/docs/eip-private-nft-media.md
```

## Motivation

ERC-721 and ERC-1155 define ownership and public metadata discovery, but they do not define a
standard way to expose token-related media that should only be visible to a holder, approved
operator, or explicit delegate.

Today, private media is usually implemented as application-specific behavior around standard NFT
metadata. Those designs can work within one application, but clients cannot rely on a shared answer
to questions like:

- where is the private resource advertised;
- how does an unauthenticated client discover the authorization challenge;
- which chain, contract, token, resource, account, domain, nonce, and expiration are bound into the
  signed proof;
- how are holders, approved operators, and delegates represented;
- how are private-resource changes, revocations, or URI rotations signaled.

This proposal tries to standardize the missing authorization layer while preserving existing public
NFT metadata behavior.

## Key Design Points

1. **Discovery uses existing token metadata**

   ERC-721 tokens expose the private media URI through `tokenURI(tokenId)` metadata. ERC-1155 tokens
   expose it through the metadata URI returned by `uri(id)`.

   ```json
   {
     "private_media_uri": "https://media.example.com/eip-private-nft-media/1/0xabc.../42"
   }
   ```

   The URI is only a discovery pointer. It is not an authorization secret.

2. **Wallets can unlock private media once**

   A wallet can implement one flow: detect `private_media_uri`, request the SIWE challenge, ask the
   authorized wallet to sign, and render the returned private `image` as the unlocked NFT media. The
   public `image` remains the fallback for clients that do not implement the proposal.

3. **Authorization is account-scoped**

   The SIWE resource binding includes an account whose ownership, balance, approval, or delegation
   state authorizes access.

   For ERC-1155, the bound account must have `balanceOf(account, id) > 0`. For operator or delegate
   flows, `account` is the holder whose authorization is being relied on; the SIWE signer may be a
   different address.

4. **Authorization uses SIWE**

   An unauthenticated request to the private media URI returns `401 Unauthorized` with a
   `WWW-Authenticate: SIWE` challenge. The SIWE message binds the proof to:
   - resource server domain;
   - requested private media URI or challenge endpoint;
   - chain id;
   - token standard;
   - contract address;
   - token id;
   - account;
   - nonce and expiration.

5. **Resource servers verify token authorization**

   The resource server verifies the SIWE signature, including EIP-1271 for contract accounts, and
   checks that the signer is an authorized subject for the token at the time of the request.

   For ERC-721, the owner is the required baseline. Resource servers can also choose to authorize a
   token-approved address, approved operator, or explicit delegate if their policy treats that
   relationship as a content-access grant.

   For ERC-1155, the bound account must have positive balance and is the required baseline. Resource
   servers can also choose to authorize an approved operator or explicit delegate.

6. **Additional access is exact-resource scoped**

   The protected `private_media_uri` can return application-defined references to additional private
   documents or media. A resource server can scope access to one selected resource, so a holder can
   share a specific `.json` resource with a third-party site without granting access to the unlocked
   image or every protected resource for the token.

   This proposal standardizes the resource binding that must be enforced. It does not standardize a
   delegation registry, application identity system, or consent UI.

7. **Updates do not require a new token interface**

   If `private_media_uri` changes, the token's public metadata changes. If protected content changes
   behind a stable private media URI, the resource server can use HTTP caching headers,
   authorization checks, and short-lived bearer tokens to control refresh behavior.

## Non-Goals

This proposal does not try to:

- standardize encrypted on-chain payloads;
- define a global key distribution or revocation system;
- define a new on-chain discovery interface;
- make zero-knowledge ownership proofs the baseline authorization mechanism;
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
4. Are exact-resource rules enough for selective third-party access, such as one protected `.json`
   resource, without standardizing a delegation system?

Thanks for reading. I would especially welcome feedback from wallet implementers, NFT indexers,
ERC-721/ERC-1155 contract authors, and teams that have implemented token-gated or private NFT media
flows.
