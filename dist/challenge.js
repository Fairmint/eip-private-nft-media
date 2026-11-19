import { SiweMessage } from "siwe";
import { challengeNonceScope, createPrivateMediaResourceBinding, } from "./resource-binding.js";
export function createPrivateMediaChallenge(input) {
    const issuedAt = input.issuedAt ?? new Date();
    const expiresAt = input.expiresAt ?? new Date(issuedAt.getTime() + 5 * 60 * 1000);
    const domain = input.domain.toLowerCase();
    const nonce = input.nonceStore.issueNonce({
        domain,
        expiresAt,
        // Always match verifyPrivateMediaAuthorization's consumeNonce scope.
        scope: challengeNonceScope(input.resource),
    });
    return {
        message: new SiweMessage({
            address: input.address,
            chainId: input.resource.chainId,
            domain,
            expirationTime: expiresAt.toISOString(),
            issuedAt: issuedAt.toISOString(),
            nonce,
            resources: [createPrivateMediaResourceBinding(input.resource)],
            ...(input.statement ? { statement: input.statement } : {}),
            uri: input.resource.privateMediaUri,
            version: "1",
        }).prepareMessage(),
        nonce,
        expiresAt,
    };
}
export function formatPrivateMediaChallengeResponse(challenge) {
    return {
        message: challenge.message,
        expires_at: challenge.expiresAt.toISOString(),
    };
}
//# sourceMappingURL=challenge.js.map