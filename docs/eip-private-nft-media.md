---
title: SIWE-Gated NFT Media URI
description: Defines Sign-In with Ethereum authorization for private NFT media.
author: HardlyDifficult (@HardlyDifficult) <team@fairmint.co>
discussions-to: https://ethereum-magicians.org/
status: Draft
type: Standards Track
category: ERC
created: 2026-05-27
requires: 721, 1155, 1271, 4361
---

## Abstract

This specification defines a `private_media_uri` metadata field and Sign-In with Ethereum (SIWE,
[EIP-4361](./eip-4361.md)) authorization flow for private [ERC-721](./eip-721.md) and
[ERC-1155](./eip-1155.md) media. Public token metadata exposes an HTTPS resource pointer. A resource
server challenges the requester with SIWE and serves private metadata or media only after verifying
token-scoped authorization.

The core wallet use case is an unlocked NFT preview: a wallet detects `private_media_uri`, obtains
authorization from the holder or another authorized subject, and renders the returned private
`image` in place of the public fallback media.

## Motivation

ERC-721 and ERC-1155 define token ownership and public metadata discovery, but they do not define a
standard way to expose token-related media that should only be visible to the owner or holder.
Projects therefore define incompatible challenge, signature, and replay protection flows.

This proposal standardizes:

- metadata discovery through `private_media_uri`;
- SIWE challenge discovery for unauthenticated requests;
- token, account, resource, domain, nonce, and expiration binding;
- owner and holder authorization checks;
- a common wallet flow for replacing public fallback media with a private `image`.

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
fallback. The public `image` MAY be a preview, placeholder, redacted asset, or other safe media.

### Typical Wallet Flow

1. The wallet reads public token metadata and renders the public `image`.
2. The wallet sees `private_media_uri` and requests it.
3. The resource server returns a SIWE challenge.
4. The holder or another authorized subject signs.
5. The wallet retries the request and renders the returned private `image` as the unlocked NFT
   media.

### Protected Resource Flow

A resource server that receives an unauthenticated request for a private media URI MUST respond with
`401 Unauthorized` and a `WWW-Authenticate` header using the `SIWE` scheme:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: SIWE realm="private-nft-media", challenge_uri="https://media.example.com/auth/challenge?resource=..."
```

The challenge endpoint MUST accept an `address` query parameter containing the SIWE address that will
sign. It MUST bind the token account whose ownership, balance, approval, or delegation state will
authorize access. Clients MUST supply that token account with an `account` query parameter unless it
is the same as `address`, in which case the resource server MAY default `account` to `address`.

The challenge endpoint MUST return `application/json` with a `message` string containing the
complete SIWE message to sign, and MAY return `expires_at` matching the SIWE `expiration-time`.

```json
{
  "message": "example.com wants you to sign in with your Ethereum account...",
  "expires_at": "2026-06-03T12:10:00.000Z"
}
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

The resource binding MUST use this URI form:

```text
eip155:{chainId}/{standard}:{contractAddress}/{tokenId}?account={account}&resource={privateMediaUri}
```

The `contractAddress` and `account` values MUST be 20-byte hexadecimal Ethereum addresses with a
`0x` prefix. `tokenId` and `privateMediaUri` MUST be percent-encoded when inserted into the resource
binding.

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

The `Authorization` value after `SIWE` MUST be an unpadded base64url-encoded JSON object with a
`message` string and `signature` hex string:

```json
{
  "message": "example.com wants you to sign in with your Ethereum account...",
  "signature": "0x..."
}
```

After verification, the resource server MAY return private NFT metadata or direct private media. If
the response is JSON metadata, clients SHOULD treat `image` as the unlocked replacement for the
public metadata `image`. If the response is direct media, clients MAY render it as the unlocked
token media.

The response MAY also include application-defined references to additional protected resources. This
specification does not standardize the manifest schema; each referenced resource is authorized by
the same SIWE resource binding rules.

```json
{
  "name": "Example NFT",
  "description": "Private holder-only description.",
  "image": "https://media.example.com/resource/private-image.png",
  "private_resources": [
    {
      "name": "Third-Party View",
      "resource_uri": "https://media.example.com/resource/third-party-view.json",
      "media_type": "application/json"
    },
    {
      "name": "Subscription Agreement",
      "resource_uri": "https://media.example.com/resource/subscription-agreement.pdf",
      "media_type": "application/pdf"
    }
  ]
}
```

### Verification Rules

The resource server MUST verify all of the following before serving protected content:

- the SIWE message is syntactically valid under EIP-4361;
- for externally owned SIWE addresses, the recovered signer address matches the SIWE address;
- for contract-account SIWE addresses, the signature is valid under [EIP-1271](./eip-1271.md) for
  that address on the bound chain;
- `domain` matches the resource server host;
- `uri` matches the requested private media URI or the issued challenge endpoint;
- `chain-id` matches the chain in the resource binding;
- `expiration-time` is present and has not passed;
- the resource binding matches the requested chain, contract address, token standard, token id,
  account, and private media URI;
- the nonce was issued by the resource server, has not expired, and has not been used;
- the signer is an authorized subject for the token at the time of the request.

For ERC-721, the bound account MUST equal `ownerOf(tokenId)`. Resource servers MUST authorize the
current `ownerOf(tokenId)`.

For ERC-1155, the account bound to the resource MUST have `balanceOf(account, id) > 0`. Resource
servers MUST authorize the bound account.

Resource servers MAY additionally authorize approved operators or delegates if the resource policy
treats those relationships as content-access grants.

Resource servers SHOULD re-check token ownership, balance, approval, or delegation before every
protected response. A server MAY issue a short-lived bearer token after SIWE verification, but the
bearer token MUST be scoped to the chain, contract, token standard, token id, account, resource URI,
and authorized subject.

### Nonce Handling

Nonces MUST be unpredictable, single-use, and bound to the resource server domain. A nonce MUST be
consumed only after signature, binding, and token authorization checks pass. Reusing a consumed
nonce MUST fail. Servers SHOULD use short nonce lifetimes.

### Additional Resources and Delegation

Resource servers MAY expose additional protected resources and delegation policies. This
specification defines the resource scope that MUST be enforced; it does not standardize one
application identity system, delegation registry, or consent UI.

For example, a holder can authorize a third-party site to access
`https://media.example.com/resource/third-party-view.json`. That authorization does not allow the
site to fetch `https://media.example.com/resource/private-image.png` or any sibling resource unless
those URIs are also covered by the resource server's policy.

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

Owner and holder access are the required baseline because transfer approvals are not always intended
as data-access consent. Resource servers can still support operators, delegates, or application
policies when those relationships are appropriate for the protected resource.

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
- ERC-1155 holder with positive balance can access the private media URI;
- optional operator or delegate access succeeds only when accepted by the resource policy;
- wallet can render unlocked `image` from private JSON metadata;
- wrong `domain`, `uri`, `chain-id`, contract, token id, account, or private media URI fails;
- expired SIWE message fails;
- reused nonce fails;
- authorized subject can retrieve application-defined references to protected resources;
- optional delegated signer succeeds only while accepted by the resource policy;
- delegate scoped to one `.json` resource cannot access the unlocked image or sibling manifest
  resources;
- revoked or expired delegate fails;
- public `tokenURI` and ERC-1155 `uri` remain readable by clients that do not implement this
  specification.

## Reference Implementation

A reference implementation can be provided under `../assets/eip-####/` after an EIP number is
assigned.

## Security Considerations

- This EIP defines access control, not anonymity. The resource server can learn the requester,
  token, account, and resource relationship from the SIWE proof and request.
- Private data must not appear in public metadata, token URIs, on-chain logs, or private media URIs.
  The URI is a locator, not an authorization secret.
- Resource servers must validate SIWE fields exactly. A proof for one domain, chain, contract,
  token, account, or resource must not authorize another.
- Servers must prevent nonce replay and should use short challenge expirations.
- Bearer tokens, if used, should be short-lived, revocable, and scoped to the authorized resource.
- Cached ownership, approval, balance, or delegation state can leak data after sale, burn, transfer,
  or revocation. Sensitive deployments should re-check authorization before every response.
- Implementations should minimize SIWE message logging, avoid account-specific resource URLs, and
  make wallet prompts clear about the resource being unlocked.
- Private storage keys, signing keys, delegation records, and bearer-token secrets require
  least-privilege access, encryption at rest, rotation, and audit logging.
- Delegations should be short-lived, revocable, limited to specific resources, and visible to the
  delegator.

## Copyright

Copyright and related rights waived via [CC0](../LICENSE.md).
