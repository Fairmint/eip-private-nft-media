---
title: SIWE-Gated NFT Media URI
description: Defines Sign-In with Ethereum authorization for private NFT media.
author: HardlyDifficult (@HardlyDifficult) <nick@fairmint.co>
discussions-to: https://ethereum-magicians.org/t/siwe-gated-nft-media-uri/28708
status: Draft
type: Standards Track
category: ERC
created: 2026-05-27
requires: 721, 1155, 1271, 4361
---

# SIWE-Gated NFT Media URI

## Abstract

This specification defines a `private_media_uri` metadata field and Sign-In
with Ethereum (SIWE) flow for private ERC-721 and ERC-1155 media. A wallet can
detect the field, ask an authorized account to sign, and render the returned
private `image` in place of public fallback media.

The proposal composes
[ERC-721](https://eips.ethereum.org/EIPS/eip-721),
[ERC-1155](https://eips.ethereum.org/EIPS/eip-1155),
[ERC-1271](https://eips.ethereum.org/EIPS/eip-1271), and
[ERC-4361](https://eips.ethereum.org/EIPS/eip-4361). It does not add an onchain
discovery interface, delegation registry, encrypted payload format, or
zero-knowledge ownership proof.

## Motivation

NFT metadata is public by default. Some tokens need a public preview and an
image, document, or data file available only to an authorized account. Existing
application-specific unlock flows cannot be implemented once by wallets and
media clients.

This proposal standardizes only the missing boundaries: where a protected URI
is advertised, how a SIWE challenge is discovered, what the signature binds,
and how current token authorization is checked before private content is
served.

## Specification

The key words MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT, and MAY are to be
interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119)
and [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

### Definitions

- **account**: the ERC-721 owner or ERC-1155 holder whose token state authorizes
  access.
- **private media URI**: an absolute HTTPS URI without userinfo or fragment that
  identifies one protected token resource.
- **resource server**: the HTTPS service that issues SIWE challenges and serves
  protected resources.

### Public metadata discovery

Tokens implementing this specification MUST expose `private_media_uri` as a
string member of their existing public metadata JSON. ERC-721 tokens expose the
JSON through `tokenURI(tokenId)`; ERC-1155 tokens expose it through the metadata
URI returned by `uri(id)`.

```json
{
  "name": "Example NFT",
  "description": "Public description safe for unauthenticated clients.",
  "image": "https://example.com/public-preview.png",
  "private_media_uri": "https://media.example.com/private/8453/0x1111111111111111111111111111111111111111/42"
}
```

`private_media_uri` MUST:

- be an absolute HTTPS URI without userinfo or fragment;
- contain no bearer token, secret, personal information, or private payload;
- identify one protected resource; and
- leave enough public metadata for a safe unauthenticated fallback.

The URI is a discovery pointer, not an authorization secret.

### Challenge discovery

An unauthenticated request to the private media URI MUST return
`401 Unauthorized` with a `WWW-Authenticate` header using the `SIWE` scheme:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: SIWE realm="private-nft-media", challenge_uri="https://media.example.com/auth/challenge?resource=https%3A%2F%2Fmedia.example.com%2Fprivate%2F8453%2F0x1111111111111111111111111111111111111111%2F42"
```

The `challenge_uri` MUST be absolute HTTPS and use the same scheme and authority
as the requested private resource. It MUST bind challenge issuance to the exact
requested private media URI. In the discovery form above, `resource` is that
URI percent-encoded; the server MUST reject a missing or mismatched resource.
Before requesting the discovered URI, the client MUST append an `address` query
parameter containing the signing Ethereum address and MAY append a different
token `account`. The endpoint MUST reject a missing `address`. If `account` is
omitted, the server MUST use `address` as the account.

Naming a different signer grants no authority. Before serving content, the
server MUST verify an approved operator, token approval, or explicit delegation
between the signer and bound account.

The challenge endpoint MUST return `application/json` with a complete SIWE
`message` and MAY return `expires_at`. The SIWE message MUST include:

- domain and port matching the requested private URI;
- `uri` equal to the exact requested private URI;
- `chain-id` equal to the token contract chain;
- an unpredictable, short-lived nonce;
- `issued-at` and `expiration-time`; and
- one `resources` entry binding the chain, token standard, contract, token ID,
  account, and exact private URI.

### Resource binding

The SIWE resource entry MUST use this URI form:

```text
eip155:{chainId}/{standard}:{contract}/{tokenId}?account={account}&resource={encodedUri}
```

Rules:

- `standard` MUST be `erc721` or `erc1155`;
- chain and token IDs MUST be unsigned base-10 integers;
- contract and account MUST be 20-byte `0x` addresses compared by value, not
  case;
- decoded `resource` MUST equal the requested private URI exactly; and
- authority for one resource MUST NOT authorize a sibling path.

### Authorization proof

The client retries the private resource with an unpadded base64url JSON object
after the `SIWE` scheme:

```http
Authorization: SIWE eyJtZXNzYWdlIjoiLi4uIiwic2lnbmF0dXJlIjoiMHguLi4ifQ
```

The decoded object MUST contain a `message` string and a `signature` string
encoded as `0x`-prefixed hexadecimal. Unknown JSON members MUST be ignored.
Malformed, expired, replayed, or mismatched proofs MUST NOT return private
content.

Before responding, the resource server MUST verify:

1. SIWE syntax, signature, nonce, expiration, and future `not-before`
   rejection. The message carries `issued-at`; freshness is enforced through
   expiration, not-before, and nonce policy rather than a separate reference
   freshness check.
2. Exact domain, URI, chain, contract, token ID, account, and resource binding.
3. EOA recovery or ERC-1271 validation for the SIWE address.
4. Authorization between signer and bound account when they differ.
5. Current token state: ERC-721 `ownerOf(tokenId)` equals the account, or
   ERC-1155 `balanceOf(account, id) > 0`.
6. Atomic, single-use nonce consumption and any explicit delegation scope.

For ERC-721, the server MAY authorize the token-level `getApproved` address or
an operator accepted by `isApprovedForAll`. For ERC-1155, it MAY authorize an
operator accepted by `isApprovedForAll`. Any additional delegation policy MUST
be explicit and scoped to the exact resource.

Ownership, balance, approval, and delegation SHOULD be rechecked before every
protected response. A cache policy MUST NOT leak content after transfer, burn,
or revocation.

For wallet rendering, a private media URI SHOULD return JSON NFT metadata whose
`image` replaces the public preview. Other exact resources MAY use the same
authorization flow.

## Rationale

SIWE is wallet-native, human-readable, and already binds signatures to a domain,
URI, chain ID, nonce, and expiration. The resource entry adds token and exact-URI
scope without introducing a new wallet signing primitive.

Discovery stays in existing public metadata so ERC-721 and ERC-1155 clients can
ignore the extension. Authorization stays offchain because the protected media
is served offchain, while token contracts remain responsible for ownership,
balance, and approval signals.

## Backwards compatibility

Existing wallets, explorers, and indexers can ignore `private_media_uri` and
continue rendering the public metadata. Implementing wallets can unlock private
media without a token-contract change.

## Security considerations

- Treat this protocol as access control, not anonymity or encrypted storage.
- The resource server can observe requester, token, account, and resource
  relationships.
- Never place private data in public metadata, token URIs, chain logs, or the
  private URI itself.
- A proof for one domain, chain, token, account, or URI MUST NOT authorize
  another.
- Durable nonce storage MUST consume each nonce once atomically across all
  instances.
- Delegations and signed URLs SHOULD be short-lived, revocable, and exact-scope.
- Resource servers SHOULD redact sensitive provider and chain errors from
  unauthenticated responses.

## Test cases

Implementations should prove at least:

- unauthenticated requests return a valid SIWE challenge;
- an ERC-721 owner and ERC-1155 holder can read the bound resource;
- every wrong bound field fails;
- expired and reused nonces fail;
- a different signer fails without explicit authorization;
- authorization for one JSON resource cannot unlock an image; and
- public metadata remains usable without the extension.

## Reference implementation

This repository contains a non-normative TypeScript implementation:

- [`src/challenge.ts`](../src/challenge.ts) constructs challenges;
- [`src/authorization.ts`](../src/authorization.ts) verifies proofs and token
  authorization;
- [`src/resource-binding.ts`](../src/resource-binding.ts) implements exact
  binding;
- [`examples/resource-server.ts`](../examples/resource-server.ts) shows a
  minimal integration; and
- [`test/authorization.test.ts`](../test/authorization.test.ts) contains
  executable cases.

The implementation permits loopback HTTP for local development only. A
conforming deployed resource uses HTTPS. Its in-memory nonce store is a
development adapter, not production persistence.

## Copyright

Copyright and related rights waived via [CC0](../LICENSE.md).
