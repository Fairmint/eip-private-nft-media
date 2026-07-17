# eip-private-nft-media

Reference implementation of the proposed SIWE-gated private NFT media flow.

## Documentation

- [Private NFT media overview](https://github.com/Fairmint/dev-docs/blob/main/docs/onchain/standards/private-nft-media.md)
- [Protocol requirements](https://github.com/Fairmint/dev-docs/blob/main/docs/onchain/standards/private-nft-media-protocol.md)
- [Demo and production boundary](https://github.com/Fairmint/dev-docs/blob/main/docs/development/testing/private-nft-media-demo.md)

For exact behavior, read the current implementation in [`src`](src), the
minimal server in [`examples/resource-server.ts`](examples/resource-server.ts),
and the executable cases in [`test`](test).

## Local checks

```bash
npm ci
npm run check
npm run format:check
```

Run the local demo with `npm run demo:api` and `npm run demo:web`.
