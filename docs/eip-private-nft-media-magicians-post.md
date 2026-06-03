---
title: Private NFT Media Authorization Magicians Post
description: Draft initial Ethereum Magicians post for the Private NFT Media Authorization proposal.
---

# Private NFT Media Authorization Magicians Post

This document drafts the initial Ethereum Magicians discussion post required before submitting the
Private NFT Media Authorization proposal upstream.

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
EIP-Draft: Private NFT Media Authorization
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

I would like to propose a new ERC draft: **Private NFT Media Authorization**.

The goal is to standardize how ERC-721 and ERC-1155 tokens can expose private or holder-only media
without putting sensitive content in public metadata, public token URIs, on-chain event logs, or
authorization-bearing URLs.

## Abstract

This proposal defines a discovery and authorization pattern for NFTs whose full media or metadata
cannot be public by default.

The token's public metadata exposes an opaque HTTPS private media URI. A wallet or application
requests that URI, receives a Sign-In with Ethereum (SIWE) challenge, signs the challenge, and
receives the protected metadata or media only after the resource server verifies token-scoped
authorization.

The protected resource can contain private media, private metadata, or a manifest of additional
protected resources. Existing ERC-721 and ERC-1155 public metadata behavior remains compatible with
wallets and indexers that do not implement this proposal.

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

2. **Authorization is account-scoped**

   The SIWE resource binding includes an account whose ownership, balance, approval, or delegation
   state authorizes access.

   For ERC-1155, the bound account must have `balanceOf(account, id) > 0`. For operator or delegate
   flows, `account` is the holder whose authorization is being relied on; the SIWE signer may be a
   different address.

3. **Authorization uses SIWE**

   An unauthenticated request to the private media URI returns `401 Unauthorized`, preferably with a
   `WWW-Authenticate: SIWE` challenge. The SIWE message binds the proof to:
   - resource server domain;
   - requested private media URI or challenge endpoint;
   - chain id;
   - token standard;
   - contract address;
   - token id;
   - account;
   - nonce and expiration.

4. **Resource servers verify token authorization**

   The resource server verifies the SIWE signature, including EIP-1271 for contract accounts, and
   checks that the signer is an authorized subject for the token at the time of the request.

   For ERC-721, authorized subjects include the owner, token-approved address, approved operator, or
   explicit delegate.

   For ERC-1155, the bound account must have positive balance, and authorized subjects include the
   bound account, an approved operator, or an explicit delegate.

5. **Delegation is explicit, token-scoped, and resource-scoped**

   The protected `private_media_uri` can return a manifest index of private documents or media.
   Delegation can then be scoped to one or more selected manifest resources, so a holder can share a
   specific document with a delegate without granting access to every protected resource for the
   token.

   Delegation can be represented by EIP-712 typed data, SIWE, an on-chain delegation registry, or a
   server-side custodian policy, but it must be token-scoped, revocable, and bounded by resource and
   expiration.

6. **Updates do not require a new token interface**

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

- EIP-712 for typed-data delegation;
- ERC-721 and ERC-1155 for NFT ownership and balances;
- EIP-1271 for contract-account signatures;
- EIP-4361 for SIWE.

## Feedback Requested

I would appreciate early feedback on these design questions:

1. Is `private_media_uri` the right public metadata field name?
2. Is metadata-only discovery sufficient, or is there a concrete use case that needs an additional
   contract interface?
3. For ERC-1155, should the resource server require `balanceOf(account, id) > 0` for the bound
   account, or are there valid zero-balance access patterns this should allow?
4. Does the `WWW-Authenticate: SIWE` challenge flow fit wallet and media-client expectations?
5. Should the SIWE resource binding include the account whose ownership or balance authorizes
   access, or is chain/contract/token/resource enough?
6. Are the resource-scoped delegation rules specific enough to support selective sharing without
   over-standardizing one delegation mechanism?
7. Are existing metadata refresh and HTTP caching mechanisms enough for private-resource updates, or
   should the proposal define additional refresh guidance?

Thanks for reading. I would especially welcome feedback from wallet implementers, NFT indexers,
ERC-721/ERC-1155 contract authors, and teams that have implemented token-gated or private NFT media
flows.
