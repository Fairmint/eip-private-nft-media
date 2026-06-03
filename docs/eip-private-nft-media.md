---
title: Private NFT Media Authorization
description: Defines Sign-In with Ethereum authorization for private NFT media and metadata.
author: Fairmint Contributors <team@fairmint.co>
discussions-to: https://ethereum-magicians.org/
status: Draft
type: Standards Track
category: ERC
created: 2026-05-27
requires: 712, 721, 1155, 1271, 4361
---

## Abstract

This specification defines a `private_media_uri` metadata field and Sign-In with Ethereum (SIWE)
authorization flow for private ERC-721 and ERC-1155 media. Public token metadata exposes an HTTPS
resource pointer. A resource server challenges the requester with SIWE and serves private metadata,
media, or a manifest only after verifying token-scoped authorization.

The core wallet use case is an unlocked NFT preview: a wallet detects `private_media_uri`, obtains
authorization from the holder or another authorized subject, and renders the returned private
`image` or `animation_url` in place of the public fallback media.

## Motivation

ERC-721 and ERC-1155 define token ownership and public metadata discovery, but they do not define a
standard way to expose token-related media that should only be visible to a holder, operator, or
delegate. Projects therefore define incompatible challenge, signature, delegation, and replay
protection flows.

This proposal standardizes:

- metadata discovery through `private_media_uri`;
- SIWE challenge discovery for unauthenticated requests;
- token, account, resource, domain, nonce, and expiration binding;
- holder, operator, and delegate authorization checks;
- a common wallet flow for replacing public fallback media with private image or video media.

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT",
"RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as
described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

### Definitions

- `account`: the token owner or holder whose ownership, balance, approval, or delegation state is
  used to authorize access.
- `private media URI`: an HTTPS URI that identifies a protected token resource. It is not itself
  confidential.
- `resource server`: the HTTPS service that issues SIWE challenges and serves protected resources.
- `authorization proof`: a SIWE message and signature used to authenticate a signer for a
  token-scoped private media URI.
- `authorized subject`: a token owner, an approved operator, an approved delegate, or another
  subject accepted by the resource server's published policy.

### Public Metadata Discovery

Tokens that implement this specification MUST expose `private_media_uri` in existing public
metadata JSON. ERC-721 tokens expose this JSON through `tokenURI(tokenId)`. ERC-1155 tokens expose
it through the metadata URI returned by `uri(id)`.

```json
{
  "name": "Example NFT",
  "description": "Public description safe for unauthenticated clients.",
  "image": "https://example.com/public-preview.png",
  "private_media_uri": "https://media.example.com/eip-private-nft-media/1/0xabc.../42"
}
```

`private_media_uri` is only a discovery pointer. It MUST be HTTPS and MUST NOT embed secrets, bearer
tokens, personally identifying information, account-specific secrets, or confidential media payloads.
Public metadata SHOULD include enough non-sensitive information for wallets and indexers to render a
fallback. The public `image` or `animation_url` MAY be a preview, placeholder, redacted asset, or
other safe media.

### Protected Resource Flow

A resource server that receives an unauthenticated request for a private media URI MUST respond with
`401 Unauthorized`. The response MUST include a challenge endpoint or challenge payload. The
resource server SHOULD use the `WWW-Authenticate` header with a `SIWE` scheme:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: SIWE realm="private-nft-media", challenge_uri="https://media.example.com/auth/challenge?resource=..."
```

The client obtains and signs a SIWE challenge. The SIWE message MUST comply with EIP-4361 and MUST
include:

- `domain` equal to the resource server host;
- `uri` equal to the private media URI or challenge endpoint;
- `chain-id` equal to the token contract chain;
- a server-generated nonce;
- `issued-at`;
- an `expiration-time`;
- a `resources` entry binding chain, token standard, contract, token id, account, and private media
  URI.

The resource binding SHOULD use a deterministic URI form:

```text
eip155:{chainId}/{standard}:{contractAddress}/{tokenId}?account={account}&resource={privateMediaUri}
```

Examples:

```text
eip155:8453/erc721:0xabc0000000000000000000000000000000000000/42?account=0x1230000000000000000000000000000000000000&resource=https%3A%2F%2Fmedia.example.com%2Fasset%2F42
eip155:8453/erc1155:0xabc0000000000000000000000000000000000000/7?account=0x1230000000000000000000000000000000000000&resource=https%3A%2F%2Fmedia.example.com%2Fasset%2F7
```

The client then sends the signed authorization proof to the resource server:

```http
GET /eip-private-nft-media/1/0xabc.../42 HTTP/1.1
Host: media.example.com
Authorization: SIWE eyJtZXNzYWdlIjoiLi4uIiwic2lnbmF0dXJlIjoiMHguLi4ifQ
```

The `Authorization` value after `SIWE` is a base64url-encoded JSON object:

```json
{
  "message": "example.com wants you to sign in with your Ethereum account...",
  "signature": "0x..."
}
```

After verification, the resource server MAY return private NFT metadata, direct private media, or a
manifest of individually protected resources. If the response is JSON metadata, clients SHOULD treat
`image` and `animation_url` as the unlocked replacements for the public metadata media fields. If
the response is direct image or video media, clients MAY render it as the unlocked token media.

```json
{
  "name": "Example NFT",
  "description": "Private holder-only description.",
  "image": "https://media.example.com/resource/private-image.png",
  "animation_url": "https://media.example.com/resource/private-video.mp4",
  "private_resources": [
    {
      "name": "Subscription Agreement",
      "resource_uri": "https://media.example.com/resource/subscription-agreement.pdf",
      "media_type": "application/pdf"
    },
    {
      "name": "Cap Table Snapshot",
      "resource_uri": "https://media.example.com/resource/cap-table-snapshot.csv",
      "media_type": "text/csv"
    }
  ]
}
```

### Verification Rules

The resource server MUST verify all of the following before serving protected content:

- the SIWE message is syntactically valid under EIP-4361;
- for externally owned SIWE addresses, the recovered signer address matches the SIWE address;
- for contract-account SIWE addresses, the signature is valid under EIP-1271 for that address on the
  bound chain;
- `domain` matches the resource server host;
- `uri` matches the requested private media URI or the issued challenge endpoint;
- `chain-id` matches the chain in the resource binding;
- `expiration-time` is present and has not passed;
- the resource binding matches the requested chain, contract address, token standard, token id,
  account, and private media URI;
- the nonce was issued by the resource server, has not expired, and has not been used;
- the signer is an authorized subject for the token at the time of the request.

For ERC-721, the bound account MUST equal `ownerOf(tokenId)`. The signer MUST be at least one of:

- the current `ownerOf(tokenId)`;
- the address returned by `getApproved(tokenId)`;
- an operator authorized by `isApprovedForAll(owner, signer)`;
- an explicit delegate accepted under the delegation rules below.

For ERC-1155, the account bound to the resource MUST have `balanceOf(account, id) > 0`, and an
authorized subject MUST be at least one of:

- the bound account;
- an operator authorized by `isApprovedForAll(account, signer)`;
- an explicit delegate accepted for the bound account under the delegation rules below.

Resource servers SHOULD re-check token ownership, balance, approval, or delegation before every
protected response. A server MAY issue a short-lived bearer token after SIWE verification, but the
bearer token MUST be scoped to the chain, contract, token standard, token id, account, resource URI,
and authorized subject.

### Nonce Handling

Nonces MUST be unpredictable, single-use, and bound to the resource server domain. A nonce MUST be
consumed only after signature, binding, and token authorization checks pass. Reusing a consumed
nonce MUST fail. Servers SHOULD use short nonce lifetimes.

### Delegation

Resource servers MAY support delegated access. Delegation MUST be explicit, revocable,
token-scoped, and resource-scoped.

A delegation proof SHOULD include:

- delegator address;
- delegate address;
- chain id;
- contract address;
- token standard;
- token id or token id range;
- allowed resource URI or resource URI prefix;
- expiration time;
- revocation identifier.

Delegation MAY be represented by an EIP-712 typed-data signature, a SIWE message signed by the
delegator, an on-chain delegation registry, or a server-side custodian policy. The resource server
MUST verify that the delegator was authorized when the delegation was created and SHOULD verify that
the delegator remains authorized before serving each protected response.

If a `private_media_uri` returns a manifest, each `resource_uri` MAY require its own SIWE challenge.
A delegate scoped to one manifest resource MUST NOT be authorized for sibling resources unless the
delegation also covers those resources or an allowed URI prefix.

Resource servers SHOULD prefer the narrowest accepted delegation scope and SHOULD NOT treat broad
operator approvals as sufficient for sensitive content unless the resource policy says so.

### Updates

If `private_media_uri` changes, the token's public metadata changes. Implementations SHOULD use the
metadata refresh and cache invalidation mechanisms already expected by their token standard and
client ecosystem. Protected content behind a stable URI SHOULD use standard HTTP caching headers and
fresh authorization checks.

## Rationale

SIWE is wallet-native, human-readable, and already binds signatures to a domain, URI, chain id,
nonce, and expiration. This specification adds a token-scoped resource binding instead of a new
wallet signing primitive.

Discovery uses public metadata because ERC-721 and ERC-1155 clients already discover token media
there. Authorization stays off-chain because private media usually requires off-chain storage,
logging, revocation, and content negotiation. Token contracts remain responsible for ownership,
balance, and approval signals.

## Alternative Designs

- A dedicated on-chain discovery interface would add a feature probe, but ERC-721 and ERC-1155
  already discover media through metadata and authorization still happens at the resource server.
- On-chain encrypted payloads improve availability, but key distribution, rotation, revocation, and
  ciphertext metadata leakage remain unsolved.
- Custom token-gated sessions are easy to deploy, but they often omit exact chain, contract, token,
  domain, nonce, expiration, or resource binding.
- Zero-knowledge ownership proofs can reduce address disclosure, but current wallet support and
  implementation complexity make them better suited for future extensions.

## Backwards Compatibility

This specification is backwards compatible with ERC-721 and ERC-1155. Existing wallets, explorers,
and indexers can ignore `private_media_uri`.

Public `tokenURI` and ERC-1155 `uri` responses can continue to return redacted or preview metadata.
Wallets that implement this specification can unlock and render private media without changing token
contracts. Unauthorized clients receive `401 Unauthorized` for the private media URI instead of
private content.

## Test Cases

Implementations should cover at least these cases:

- unauthenticated request returns `401 Unauthorized` with a SIWE challenge;
- current ERC-721 owner can access the private media URI;
- ERC-721 approved address or operator can access only while approval remains active;
- ERC-1155 holder with positive balance can access the private media URI;
- ERC-1155 operator can access only while `isApprovedForAll(account, operator)` remains active;
- wallet can render unlocked `image` or `animation_url` from private JSON metadata;
- wrong `domain`, `uri`, `chain-id`, contract, token id, account, or private media URI fails;
- expired SIWE message fails;
- reused nonce fails;
- authorized subject can retrieve a manifest index of protected resources;
- delegated signer succeeds only while delegation is active;
- delegate scoped to one indexed resource cannot access sibling manifest resources;
- revoked or expired delegate fails;
- public `tokenURI` and ERC-1155 `uri` remain readable by clients that do not implement this
  specification.

## Reference Implementation

The repository includes a TypeScript reference implementation in [`src/`](../src) and behavioral
tests in [`test/`](../test). The main entrypoint is `verifyPrivateMediaAuthorization`.

## Security Considerations

- Private data must not appear in public metadata, token URIs, on-chain logs, or private media URIs.
  The URI is a locator, not an authorization secret.
- Resource servers must validate SIWE fields exactly. A proof for one domain, chain, contract,
  token, account, or resource must not authorize another.
- Servers must prevent nonce replay and should use short challenge expirations.
- Bearer tokens, if used, should be short-lived, revocable, and scoped to the authorized resource.
- Cached ownership, approval, balance, or delegation state can leak data after sale, burn, transfer,
  or revocation. Sensitive deployments should re-check authorization before every response.
- Private storage keys, signing keys, delegation records, and bearer-token secrets require
  least-privilege access, encryption at rest, rotation, and audit logging.
- Delegations should be short-lived, revocable, limited to specific resources, and visible to the
  delegator.

## Copyright

Copyright and related rights waived via [CC0](../LICENSE.md).
