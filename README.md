# eip-private-nft-media

Reference implementation and draft materials for SIWE-Gated NFT Media URI.

The proposal is intentionally small: public NFT metadata can include `private_media_uri`. A wallet
or app requests that URI, signs the SIWE challenge returned by the resource server, and then receives
private metadata whose `image` can replace the public preview image.

The hosted site is only a demo surface. The important parts for implementers are metadata discovery,
SIWE challenge construction, SIWE proof verification, and NFT authorization checks.

## Core Flow

1. Return public metadata with `private_media_uri`.
2. Protect that URI with `401 Unauthorized` and a `WWW-Authenticate: SIWE` challenge.
3. Build a SIWE message bound to the exact private resource.
4. Verify the returned SIWE proof, nonce, resource binding, and NFT authorization.
5. Return private metadata with a private `image`.

## Metadata Discovery

ERC-721 `tokenURI(tokenId)` and ERC-1155 `uri(id)` continue to return normal public metadata. The
only addition is `private_media_uri`.

```json
{
  "name": "Example NFT",
  "description": "Public preview metadata.",
  "image": "https://media.example.com/public/8453/0xabc.../42/image.png",
  "private_media_uri": "https://media.example.com/private/8453/0xabc.../42/metadata"
}
```

See the demo metadata route in [demo/api/app.ts](demo/api/app.ts).

## Challenge Discovery

When a client requests `private_media_uri` without a valid proof, return a SIWE challenge pointer.

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: SIWE realm="private-nft-media", challenge_uri="https://media.example.com/auth/challenge?resource=..."
Content-Type: application/json

{"error":"authorization_required"}
```

The reference challenge response lives in [demo/api/lib/protected-resource.ts](demo/api/lib/protected-resource.ts).
The standalone example is [examples/resource-server.ts](examples/resource-server.ts).
The `challenge_uri` uses the same origin as the protected URI, which keeps SIWE domain checks simple
for wallets.

## SIWE Challenge

The challenge uses the standard `siwe` package. The critical detail is the `resources` entry: it
binds the signature to one chain, NFT standard, contract, token id, account, and private URI.

```ts
import { SiweMessage } from "siwe";

const message = new SiweMessage({
  address,
  chainId: resource.chainId,
  domain,
  expirationTime: expiresAt.toISOString(),
  issuedAt: issuedAt.toISOString(),
  nonce,
  resources: [createPrivateMediaResourceBinding(resource)],
  uri: resource.privateMediaUri,
  version: "1",
}).prepareMessage();
```

Implementation links:

- SIWE message construction: [src/challenge.ts](src/challenge.ts)
- Exact resource binding format: [src/resource-binding.ts](src/resource-binding.ts)
- Challenge route example: [demo/api/app.ts](demo/api/app.ts)

The resource binding looks like this:

```text
eip155:{chainId}/{standard}:{contractAddress}/{tokenId}?account={account}&resource={privateMediaUri}
```

## Authorization Header

After signing, the client retries the protected resource with `Authorization: SIWE ...`.

```ts
const proof = { message: challenge.message, signature };
const authorization = encodeAuthorizationProof(proof);

await fetch(privateMediaUri, {
  headers: { Authorization: authorization },
});
```

The header encoder and parser are in [src/authorization-header.ts](src/authorization-header.ts).

## Verification

Resource servers should verify the SIWE proof before returning private content.

```ts
const authorization = await verifyPrivateMediaAuthorization({
  proof: parseAuthorizationHeader(request.headers.authorization),
  resource,
  chainReader,
  nonceStore,
});
```

The verifier in [src/authorization.ts](src/authorization.ts) does the critical checks:

- parses the message with `new SiweMessage(message)`;
- verifies the signature with `SiweMessage.verify(...)`;
- checks `domain`, `uri`, `chainId`, expiration, and nonce;
- requires the exact `resources` binding from [src/resource-binding.ts](src/resource-binding.ts);
- checks ERC-721 ownership or ERC-1155 balance for the bound `account`;
- supports EIP-1271 contract accounts and explicit approval/delegation hooks.

The signature verification path is intentionally visible:

```ts
const parsed = new SiweMessage(message);

const result = await parsed.verify({
  domain: parsed.domain,
  signature,
  time: now.toISOString(),
});

if (!result.success) throw new Error("invalid SIWE proof");
```

## NFT Authorization

The verifier expects the resource server to provide chain-reading functions. This keeps the standard
independent from any RPC library.

```ts
const chainReader = {
  ownerOf: async ({ contract, tokenId }) => owner,
  getApproved: async ({ contract, tokenId }) => approvedAddressOrNull,
  balanceOf: async ({ contract, tokenId, account }) => balance,
  isApprovedForAll: async ({ contract, account, operator }) => approved,
  isValidEip1271Signature: async ({ address, message, signature }) => valid,
};
```

For ERC-721, the bound `account` must be the current `ownerOf(tokenId)`. For ERC-1155, the bound
`account` must have `balanceOf(account, id) > 0`. Optional operator, token approval, EIP-1271, and
delegation checks are implementation hooks, not extra discovery mechanisms. If the SIWE signer is not
the bound `account`, ownership or balance is not enough; an approval or delegation check must also
authorize that signer.

## Scoped Delegation

Delegation is deliberately resource-scoped. If a user grants access to one JSON document, that grant
should not unlock the private image. In that flow, the third-party wallet signs as `address` while the
token owner remains the bound `account`, so the server must verify the delegation before returning
content.

```ts
const delegationVerifier = {
  async verifyDelegation({ delegate, delegator, resource, now }) {
    return (
      grant.delegate === delegate &&
      grant.delegator === delegator &&
      grant.resourceUri === resource.privateMediaUri &&
      grant.expiresAt > now
    );
  },
};
```

The demo uses JWTs for its own delegation grants, but that token format is not part of the proposal.
The important behavior is exact-resource enforcement. See [demo/api/lib/delegation-token.ts](demo/api/lib/delegation-token.ts)
and the delegated-access tests in [test/authorization.test.ts](test/authorization.test.ts).

## Files Worth Reading

- [docs/eip-private-nft-media.md](docs/eip-private-nft-media.md): the EIP draft.
- [src/challenge.ts](src/challenge.ts): SIWE challenge construction.
- [src/authorization.ts](src/authorization.ts): SIWE proof and NFT authorization verification.
- [src/resource-binding.ts](src/resource-binding.ts): deterministic resource binding.
- [src/authorization-header.ts](src/authorization-header.ts): `Authorization: SIWE` encoding.
- [examples/resource-server.ts](examples/resource-server.ts): minimal resource-server flow.
- [test/authorization.test.ts](test/authorization.test.ts): expected behavior and edge cases.

## Run Checks

```bash
npm install
npm run check
```

The end-to-end demo is available in [demo](demo), but it is only a way to exercise the proposal. The
reference implementation above is the part implementers should study or copy.
