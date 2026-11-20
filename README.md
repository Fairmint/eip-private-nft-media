# eip-private-nft-media

Reference implementation for
[ERC-8291: SIWE-Gated NFT Media URI](https://github.com/ethereum/ERCs/pull/1801)
(**Draft**).

The draft adds a `private_media_uri` field to public ERC-721 or ERC-1155
metadata. A wallet requests that exact URI, signs the Sign-In with Ethereum
(SIWE) challenge returned by the resource server, and receives private metadata
only after the server rechecks token authorization or a server policy.

> [!IMPORTANT]
> ERC-8291 is a **Draft**. It is not an adopted Ethereum standard or
> production-grade private storage. Follow
> [PR #1801](https://github.com/ethereum/ERCs/pull/1801) and the
> [Magicians discussion](https://ethereum-magicians.org/t/erc-8291-siwe-gated-nft-media-uri/28708).

## Read by depth

- [Public wiki](https://github.com/Fairmint/eip-private-nft-media/wiki) provides
  the progressive protocol, implementation, security, and demo guide.
- [Docs index](docs/README.md) points at the official ERC-8291 draft (do not
  duplicate the ERC text in this repo).
- Spec draft: [ethereum/ERCs#1801](https://github.com/ethereum/ERCs/pull/1801)
- [Demo guide](demo/README.md) runs the browser-to-resource-server flow and
  explains the production boundary.
- [Ethereum Magicians discussion](https://ethereum-magicians.org/t/erc-8291-siwe-gated-nft-media-uri/28708)
  hosts public proposal feedback.

## Flow

1. Public token metadata advertises a safe preview and `private_media_uri`.
2. An unauthenticated request returns `401 Unauthorized` and a SIWE challenge
   URI.
3. The challenge binds the signer to one domain, chain, gating token or policy,
   account, and exact private resource.
4. The resource server verifies the proof, consumes the nonce once, and
   rechecks ownership, balance, approval, policy, or explicit delegation.
5. The authorized response returns private metadata whose `image` can replace
   the public preview.

The URI is a discovery pointer, not a secret. Clients that do not implement the
draft continue rendering ordinary public NFT metadata.

## Implementation map

- [`src/challenge.ts`](src/challenge.ts) constructs SIWE challenges.
- [`src/authorization-header.ts`](src/authorization-header.ts) encodes and
  parses `Authorization: SIWE` proofs.
- [`src/resource-binding.ts`](src/resource-binding.ts) owns exact-resource
  token-form and policy-form bindings.
- [`src/authorization.ts`](src/authorization.ts) verifies signatures and
  current NFT or policy authorization.
- [`src/nonce-store.ts`](src/nonce-store.ts) provides a development nonce-store
  adapter; production needs durable atomic consumption across instances.
- [`examples/resource-server.ts`](examples/resource-server.ts) is the minimal
  server integration.
- [`test/authorization.test.ts`](test/authorization.test.ts) contains executable
  success and failure cases.

The package intentionally leaves chain reads, delegation policy, protected
storage, caching, rate limiting, and audit behavior to the resource server.

## Install

Install an exact version from npm, next to `ethers` v6 (`siwe` uses it to
verify signatures):

```bash
npm install --save-exact @fairmint/eip-private-nft-media@<version> ethers@6
bun add --exact @fairmint/eip-private-nft-media@<version> ethers@6
```

Servers import the verifier from the package root. Browsers import the
`Authorization: SIWE` encoder from `@fairmint/eip-private-nft-media/client`,
which loads no server code.

```ts
import { verifyPrivateMediaAuthorization } from "@fairmint/eip-private-nft-media";
import { encodeAuthorizationProof } from "@fairmint/eip-private-nft-media/client";
```

Build output is not committed. To build from source, run
`npm ci && npm run build`; the library lands in `dist/`.

## Local development

This repository requires Node.js 24 and npm 11 or newer.

```bash
npm ci
npm run check
npm run format:check
```

Run the local demo in separate terminals with `npm run demo:api` and
`npm run demo:web`.

## Releasing

CI builds and publishes the package; nobody commits `dist/` or bumps the
version by hand. Once publishing is enabled, every push to `main` runs
[`.github/workflows/publish.yml`](.github/workflows/publish.yml): it builds,
runs the checks, picks the version with
[`scripts/prepare-release.mjs`](scripts/prepare-release.mjs) (the
`package.json` version if npm and the git tags do not have it yet, otherwise the
next free patch; a version unpublished from npm stays taken, as npm never reuses
one), publishes it with npm Trusted Publishing and provenance, and tags
`v<version>`. These are three jobs: `release` (install, build, checks and
version; read only, no OIDC token), `publish` (the only job with an OIDC token)
and `tag` (the only job that can push). The build happens once, in `release`,
which uploads `dist/` as a run artifact. `publish` installs nothing and runs no
package or dependency script: it downloads that `dist/`, checks that the entry
points are there and publishes that exact build with `--ignore-scripts`. A
re-run never publishes the same commit twice: a commit that already has a `v*`
tag, or whose SHA is the `gitHead` of a version on npm, publishes nothing, and in
the second case only the missing tag is pushed. To release a minor or major
version, raise the version in `package.json` in the pull request; a version
lower than npm's latest is refused.

Publishing stays off until a one-time bootstrap, because npm attaches a Trusted
Publisher only to a package that already exists:

1. A member of the `@fairmint` npm organization runs
   `npm ci && npm publish --access public` from a clean checkout of `main`
   (`prepack` builds `dist/`).
2. Tag that commit `v0.1.0` and push the tag.
3. On npmjs.com, attach a Trusted Publisher to the package: GitHub Actions,
   organization `Fairmint`, repository `eip-private-nft-media`, workflow
   filename `publish.yml`, environment empty.
4. Set the repository variable `NPM_PUBLISH=true` (Settings, Secrets and
   variables, Actions, Variables).

Until then the publish workflow runs the checks and publishes nothing.
