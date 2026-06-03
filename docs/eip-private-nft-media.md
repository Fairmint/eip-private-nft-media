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

This specification defines a discovery and authorization pattern for non-fungible tokens whose full
media or metadata cannot be public by default. The token's public metadata exposes an opaque private
media URI. A wallet or application requests that URI, receives a Sign-In with Ethereum (SIWE)
challenge, signs the challenge, and receives the protected metadata or media only after the resource
server verifies token-scoped authorization.

The protected resource can contain private media, private metadata, or a manifest of additional
protected resources. The public token metadata remains compatible with existing ERC-721 and ERC-1155
clients.

## Motivation

ERC-721 and ERC-1155 define token ownership and public metadata discovery, but they do not define a
standard way to expose token-related media that should only be visible to the holder or an
authorized delegate. Projects that need private media must define their own authorization, challenge
construction, delegation, and replay-protection flows.

Without a shared convention, private media implementations differ in ways that wallets, indexers,
and media clients cannot reliably discover:

- whether and how the private resource is advertised in public metadata;
- how an unauthenticated client discovers the authorization challenge;
- which fields a signed proof binds, including chain, contract, token, resource, verifier domain,
  nonce, and expiration;
- how holders, approved operators, and delegates are represented;
- how private-resource changes, revocations, or URI rotations are signaled.

This draft standardizes that discovery and authorization layer while preserving existing NFT
metadata behavior for wallets and indexers.

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT",
"RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as
described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

### Definitions

This specification uses the following terms:

- `asset`: an ERC-721 `tokenId` or an ERC-1155 `id`.
- `account`: the token owner or holder whose ownership, balance, approval, or delegation state is
  used to authorize access.
- `private media URI`: an HTTPS URI that identifies a protected token resource. It is not itself
  confidential.
- `resource server`: the HTTPS service that issues SIWE challenges and serves protected resources.
- `authorization proof`: a SIWE message and signature that prove the signer controls, owns, or is
  delegated access to the token-scoped private media URI.
- `authorized subject`: a token owner, an approved operator, an approved delegate, or another
  subject accepted by the resource server's published policy.

### Public Metadata Discovery

Tokens that implement this specification MUST expose the private media URI through existing public
metadata JSON. ERC-721 tokens expose this JSON through `tokenURI(tokenId)`. ERC-1155 tokens expose
this JSON through the metadata URI returned by `uri(id)`.

```json
{
  "name": "Example NFT",
  "description": "Public description safe for unauthenticated clients.",
  "image": "https://example.com/public-preview.png",
  "private_media_uri": "https://media.example.com/eip-private-nft-media/1/0xabc.../42"
}
```

The `private_media_uri` field MUST be treated as a discovery pointer only. It MUST NOT imply that
the caller is authorized to read the protected resource. The private media URI MUST be an HTTPS URI.
The URI MUST NOT embed secrets, bearer tokens, personally identifying information, or confidential
media payloads. Public metadata SHOULD include enough non-sensitive information for wallets and
indexers to render a safe fallback experience.

The public metadata field is token-scoped. Holder-specific, delegate-specific, or policy-specific
protected content MUST be selected by the resource server after authorization, not by embedding
account-specific secrets in public metadata.

### Protected Resource Flow

A resource server that receives an unauthenticated request for a private media URI MUST respond with
`401 Unauthorized`. The response MUST include a challenge endpoint or challenge payload. The
resource server SHOULD use the `WWW-Authenticate` header with a `SIWE` scheme:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: SIWE realm="private-nft-media", challenge_uri="https://media.example.com/auth/challenge?resource=..."
```

The client obtains a SIWE challenge and signs it with the wallet that is claiming access. The SIWE
message MUST comply with EIP-4361 and MUST include:

- `domain` equal to the resource server host;
- `uri` equal to the private media URI or challenge endpoint;
- `chain-id` equal to the chain that hosts the token contract;
- a server-generated `nonce`;
- `issued-at`;
- an `expiration-time`;
- a `resources` entry that binds the proof to the chain, contract, token standard, token id,
  account, and private media URI.

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

After successful verification, the resource server MAY return private metadata, private media, or a
manifest index of authorized resources. A manifest index lets the public metadata expose one
protected `private_media_uri`, while the protected response enumerates one or more individually
protected documents or media files:

```json
{
  "name": "Example NFT",
  "description": "Private holder-only description.",
  "image": "https://media.example.com/resource/image.png",
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
  ],
  "attributes": [
    {
      "trait_type": "Access Level",
      "value": "Holder"
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
- the nonce was issued by the resource server, has not expired, and has not been used;
- `expiration-time` is present and has not passed;
- the resource binding matches the requested chain, contract address, token standard, token id,
  account, and private media URI;
- the signer is an authorized subject for the token at the time of the request.

For ERC-721, an authorized subject MUST be at least one of:

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
consumed only after the resource server successfully validates the SIWE signature, all resource
bindings, and token authorization. Reusing a consumed nonce MUST fail.

Servers SHOULD use short nonce lifetimes. Clients SHOULD request a new challenge instead of caching
signed SIWE messages.

### Delegation

Resource servers MAY support delegated access. Delegation MUST be explicit, token-scoped, and
resource-scoped.

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
delegator, an on-chain delegation registry, or a server-side custodian policy. When SIWE is used as
the delegation proof, the SIWE `resources` field SHOULD include the exact delegated resource URI or
URI prefix and SHOULD identify the delegate address, expiration, and revocation identifier in a
server-defined statement or resource entry.

A resource server MAY use the protected `private_media_uri` as an index of authorized resources and
then require each indexed `resource_uri` to be requested with its own SIWE challenge. This supports
the following delegated access flow:

1. The holder requests the public `private_media_uri`, completes SIWE, and receives a manifest index
   of protected documents or media files.
2. The holder selects one or more indexed `resource_uri` values and signs a delegation proof that
   names the delegate, token binding, selected resources, expiration, and revocation identifier.
3. The delegate requests a selected `resource_uri` and completes SIWE as the delegate.
4. The resource server verifies the delegate's SIWE proof, the delegation proof, the token binding,
   and the requested resource URI before serving the response.

A delegate scoped to one indexed resource MUST NOT be authorized for sibling resources in the same
manifest unless the delegation proof also covers those resources. For example, a delegation covering
`https://media.example.com/resource/subscription-agreement.pdf` MUST fail for
`https://media.example.com/resource/cap-table-snapshot.csv` unless a separate delegation or allowed
URI prefix covers that CSV resource.

Regardless of representation, the resource server MUST verify that the delegator was authorized to
grant access when the delegation was created and SHOULD verify that the delegator remains authorized
before serving each protected response.

Delegations MUST be revocable. Resource servers SHOULD prefer the narrowest accepted delegation
scope and SHOULD NOT treat broad token operator approvals as sufficient for highly sensitive content
unless the resource policy explicitly says so.

### Updates

If `private_media_uri` changes, the token's public metadata changes. Implementations SHOULD use the
metadata refresh or cache-invalidation mechanisms already expected by their token standard and
client ecosystem.

Protected content can also change behind a stable private media URI. Resource servers SHOULD use
standard HTTP caching headers, authorization checks, and short-lived bearer tokens so clients can
refresh protected resources without requiring a new token contract interface.

## Rationale

This specification uses SIWE because it is wallet-native, human-readable, and already binds a
signature to a domain, URI, chain id, nonce, and expiration. Adding a token-scoped resource binding
keeps the proof interoperable without introducing a new wallet signing primitive.

The discovery mechanism uses public metadata because ERC-721 and ERC-1155 already define metadata
URIs as the common token media discovery path. Reusing that path avoids adding another contract
interface for clients to probe before they can learn where authorization begins.

The `private_media_uri` field is intentionally an opaque pointer so projects can expose a safe
fallback without leaking sensitive details. Account-specific behavior is handled by the resource
server after SIWE authorization, where the server can evaluate ownership, balance, approvals,
delegation, content negotiation, logging, and revocation.

The resource server performs authorization off-chain because private media usually has off-chain
storage, access logging, revocation, and content-negotiation requirements. On-chain contracts remain
responsible for ownership and approval signals.

## Alternative Designs

### Fully Public Metadata

Public metadata is simple and maximally compatible, but it cannot protect regulated, personal,
commercial, unrevealed, or token-gated media. It also creates permanent leakage once indexers cache
the content.

### On-Chain Encrypted Payloads

On-chain encrypted payloads make availability strong, but they move the hard problem to key
distribution, key rotation, revocation, and ciphertext metadata leakage. They also increase storage
costs and do not fit large media assets.

### Dedicated On-Chain Discovery Interface

A dedicated contract interface for private media discovery would give clients an on-chain feature
probe, but ERC-721 and ERC-1155 clients already discover token media through metadata. Adding a
second discovery path increases implementation and indexing complexity without changing the
authorization problem, which still happens at the resource server.

### Token-Gated Sessions Without SIWE

Custom token-gated sessions are easy to deploy but often fail to bind the proof to the exact chain,
contract, token id, domain, and resource. That makes replay and cross-resource confusion more
likely, and it prevents wallets from building reusable private NFT media support.

### Zero-Knowledge Ownership Proofs

Zero-knowledge ownership proofs can reduce disclosure of the wallet address to the resource server,
but current wallet support and implementation complexity make them a poor baseline requirement. They
can be layered on top of this draft in a future extension.

## Backwards Compatibility

This specification is backwards compatible with ERC-721 and ERC-1155. Existing wallets, explorers,
and indexers can ignore `private_media_uri`.

Public `tokenURI` and ERC-1155 `uri` responses can continue to return redacted or preview metadata.
Unauthorized clients receive `401 Unauthorized` for the private media URI instead of private
content.

## Test Cases

Implementations should cover at least these cases:

- unauthenticated request returns `401 Unauthorized` with a SIWE challenge;
- current ERC-721 owner can access the private media URI;
- current ERC-721 approved address can access only while approval remains active;
- ERC-1155 holder with positive balance can access the private media URI;
- ERC-1155 operator can access only while `isApprovedForAll(account, operator)` remains active;
- wrong `domain` fails;
- wrong `chain-id` fails;
- wrong contract address fails;
- wrong token id fails;
- wrong account fails;
- wrong private media URI fails;
- expired SIWE message fails;
- reused nonce fails;
- authorized subject can retrieve a manifest index of protected resources;
- delegated signer succeeds while delegation is active;
- delegate scoped to one indexed resource can access that resource;
- delegate scoped to one indexed resource cannot access sibling resources in the same manifest;
- revoked or expired delegate fails;
- public `tokenURI` and ERC-1155 `uri` remain readable by clients that do not implement this
  specification.

## Reference Implementation

The following TypeScript sketch shows the expected verification shape. It omits storage, RPC,
logging, and framework-specific details.

```ts
type PrivateMediaResource = {
  chainId: number;
  standard: "erc721" | "erc1155";
  contract: `0x${string}`;
  tokenId: string;
  account: `0x${string}`;
  privateMediaUri: string;
};

type AuthorizationProof = {
  message: string;
  signature: `0x${string}`;
};

async function verifyPrivateMediaProof(
  proof: AuthorizationProof,
  resource: PrivateMediaResource,
  requestHost: string,
  requestUri: string,
  issuedChallengeUri: string,
): Promise<`0x${string}`> {
  const parsed = parseSiweMessage(proof.message);
  const subject = parsed.address.toLowerCase() as `0x${string}`;
  const signer = await recoverSigner(parsed, proof.signature);
  const isEoaSignature = signer.toLowerCase() === subject;
  const isContractSignature = await isValidEip1271Signature(
    subject,
    proof.message,
    proof.signature,
    resource.chainId,
  );

  if (!isEoaSignature && !isContractSignature) {
    throw new Error("invalid signature");
  }

  assertEqual(parsed.domain, requestHost);
  assertOneOf(parsed.uri, [requestUri, issuedChallengeUri]);
  assertEqual(parsed.chainId, resource.chainId);
  assertNotExpired(parsed.expirationTime);
  assertResourceBinding(parsed.resources, resource);

  const authorized = await isAuthorizedSubject(subject, resource);
  if (!authorized) {
    throw new Error("unauthorized");
  }

  await consumeNonce(parsed.domain, parsed.nonce);

  return subject;
}
```

## Security Considerations

Private data must not be placed in public metadata, public token URIs, on-chain event logs, or
private media URIs. The URI is a locator, not an authorization secret.

Account-specific private media URIs should avoid embedding account addresses or other identifying
details unless they are necessary for routing. If account information appears in the URI, the URI
must still be treated as public and non-authorizing.

Resource servers must use HTTPS and should reject plain HTTP private media URIs. Servers must
validate SIWE fields exactly, including domain, URI, chain id, nonce, expiration, and token-scoped
resource binding. A signed message for one chain, contract, token, domain, or resource must not
authorize any other resource.

Servers must prevent nonce replay and should use short challenge expirations. If bearer tokens are
issued after SIWE verification, they should be short-lived, resource-scoped, and revocable.

Servers that cache ownership, approval, balance, or delegation state risk serving data after a sale,
burn, revoke, or approval change. Sensitive deployments should re-check authorization before every
protected response.

Private media storage keys, signing keys, delegation records, and bearer-token secrets must be
protected with least-privilege access, encryption at rest, rotation procedures, and audit logging.
Operational logs should avoid recording protected content and should redact authorization proofs.

Delegation increases the blast radius of compromise. Delegations should be short-lived, revocable,
limited to specific resources, and visible to the delegator. Servers should rate limit challenge and
resource endpoints, and should avoid error messages that reveal whether a token exists or who owns
it.

## Copyright

Copyright and related rights waived via [CC0](../LICENSE.md).
