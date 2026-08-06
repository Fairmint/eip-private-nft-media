# Documentation

This repository is the **reference implementation** for
[ERC-8291: SIWE-Gated NFT Media URI](https://github.com/ethereum/ERCs/pull/1801)
(**Draft**).

Do not duplicate the ERC text here. Use the official draft:

- Spec draft (PR): https://github.com/ethereum/ERCs/pull/1801
- Rendered file on PR branch:
  https://github.com/HardlyDifficult/ERCs/blob/codex/siwe-gated-nft-media-uri/ERCS/erc-8291.md
- Magicians discussion:
  https://ethereum-magicians.org/t/erc-8291-siwe-gated-nft-media-uri/28708

## Implementation notes

- Token-form and policy-form resource bindings are supported in `src/`.
- The gating token named in a token-form binding MAY differ from the advertised
  token whose metadata exposed `private_media_uri`. Use
  `expectedTokenBinding` / `expectedPolicyBinding` to construct the expected
  binding for `(privateMediaUri, account)`.
- **Owner floor (resource-server MUST):** for every advertised token, the
  current ERC-721 owner (or any ERC-1155 holder with positive balance) MUST be
  authorizable for that URI. The library verifies whatever expected binding the
  server supplies; servers must issue an advertised-token binding (or another
  binding that account satisfies) for those owners/holders. The demo resolves
  bindings in that order before alternate gating or policy grants.
- Challenges optionally accept a SIWE `statement` and bind issued nonces to a
  challenge-parameter `scope` (account + binding) via `NonceStore`.
- Full production nonce stores should keep that scope binding durable across
  instances; the in-memory adapter is for tests and local demos only.
