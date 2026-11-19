/**
 * Browser-safe entry point for wallets and apps that request a
 * `private_media_uri`. It loads no SIWE verifier, nonce store, or chain-read
 * code, so a client bundle can import it without server dependencies.
 */
export { encodeAuthorizationProof } from "./authorization-header.js";
export type { PrivateMediaChallengeResponse } from "./challenge.js";
export type { AuthorizationProof } from "./types.js";
//# sourceMappingURL=client.d.ts.map