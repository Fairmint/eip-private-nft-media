import type { Address } from "viem";
import type { NonceStore, PrivateMediaResource } from "./types.js";
export type PrivateMediaChallenge = {
    message: string;
    nonce: string;
    expiresAt: Date;
};
export type PrivateMediaChallengeResponse = {
    message: string;
    expires_at: string;
};
export type CreatePrivateMediaChallengeInput = {
    address: Address;
    domain: string;
    resource: PrivateMediaResource;
    nonceStore: NonceStore;
    issuedAt?: Date;
    expiresAt?: Date;
    /** Human-readable statement identifying the resource and entitlement. */
    statement?: string;
};
export declare function createPrivateMediaChallenge(input: CreatePrivateMediaChallengeInput): PrivateMediaChallenge;
export declare function formatPrivateMediaChallengeResponse(challenge: PrivateMediaChallenge): PrivateMediaChallengeResponse;
//# sourceMappingURL=challenge.d.ts.map