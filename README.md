# eip-private-nft-media

Reference implementation and draft specification for SIWE-gated private NFT
media.

The draft adds a `private_media_uri` field to public ERC-721 or ERC-1155
metadata. A wallet requests that exact URI, signs the Sign-In with Ethereum
(SIWE) challenge returned by the resource server, and receives private metadata
only after the server rechecks token authorization.

> [!IMPORTANT]
> This proposal is a draft with no assigned EIP number. It is not an adopted
> Ethereum standard or production-grade private storage.

## Read by depth

- [Public wiki](https://github.com/Fairmint/eip-private-nft-media/wiki) provides
  the progressive protocol, implementation, security, and demo guide.
- [Protocol specification](docs/eip-private-nft-media.md) defines discovery,
  challenge, binding, verification, and security requirements.
- [Demo guide](demo/README.md) runs the browser-to-resource-server flow and
  explains the production boundary.
- [Ethereum Magicians discussion](https://ethereum-magicians.org/t/siwe-gated-nft-media-uri/28708)
  hosts public proposal feedback.

## Flow

1. Public token metadata advertises a safe preview and `private_media_uri`.
2. An unauthenticated request returns `401 Unauthorized` and a SIWE challenge
   URI.
3. The challenge binds the signer to one domain, chain, token, account, and
   exact private resource.
4. The resource server verifies the proof, consumes the nonce once, and
   rechecks ownership, balance, approval, or explicit delegation.
5. The authorized response returns private metadata whose `image` can replace
   the public preview.

The URI is a discovery pointer, not a secret. Clients that do not implement the
draft continue rendering ordinary public NFT metadata.

## Implementation map

- [`src/challenge.ts`](src/challenge.ts) constructs SIWE challenges.
- [`src/authorization-header.ts`](src/authorization-header.ts) encodes and
  parses `Authorization: SIWE` proofs.
- [`src/resource-binding.ts`](src/resource-binding.ts) owns exact-resource
  binding.
- [`src/authorization.ts`](src/authorization.ts) verifies signatures and
  current NFT authorization.
- [`src/nonce-store.ts`](src/nonce-store.ts) provides a development nonce-store
  adapter; production needs durable atomic consumption across instances.
- [`examples/resource-server.ts`](examples/resource-server.ts) is the minimal
  server integration.
- [`test/authorization.test.ts`](test/authorization.test.ts) contains executable
  success and failure cases.

The package intentionally leaves chain reads, delegation policy, protected
storage, caching, rate limiting, and audit behavior to the resource server.

## Local development

This repository requires Node.js 24 and npm 11 or newer.

```bash
npm ci
npm run check
npm run format:check
```

Run the local demo in separate terminals with `npm run demo:api` and
`npm run demo:web`.
