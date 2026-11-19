import { generateNonce } from "siwe";
import { AuthorizationError } from "./types.js";
export class InMemoryNonceStore {
    nonces = new Map();
    issueNonce(input) {
        const nonce = input.nonce ?? generateNonce();
        const nonceKey = key(input.domain, nonce, input.scope);
        if (this.nonces.has(nonceKey)) {
            throw new AuthorizationError("nonce_invalid", "nonce has already been issued");
        }
        this.nonces.set(nonceKey, {
            expiresAt: input.expiresAt,
        });
        return nonce;
    }
    async consumeNonce(input) {
        const nonceKey = key(input.domain, input.nonce, input.scope);
        const stored = this.nonces.get(nonceKey);
        if (!stored) {
            throw new AuthorizationError("nonce_invalid", "nonce was not issued by this resource server");
        }
        if (stored.expiresAt.getTime() <= input.now.getTime()) {
            this.nonces.delete(nonceKey);
            throw new AuthorizationError("nonce_invalid", "nonce has expired");
        }
        this.nonces.delete(nonceKey);
    }
}
function key(domain, nonce, scope) {
    return `${domain.toLowerCase()}:${scope ?? ""}:${nonce}`;
}
//# sourceMappingURL=nonce-store.js.map