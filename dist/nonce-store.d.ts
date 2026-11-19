import { type NonceStore } from "./types.js";
export declare class InMemoryNonceStore implements NonceStore {
    private nonces;
    issueNonce(input: {
        domain: string;
        expiresAt: Date;
        nonce?: string;
        scope?: string;
    }): string;
    consumeNonce(input: {
        domain: string;
        nonce: string;
        now: Date;
        scope?: string;
    }): Promise<void>;
}
//# sourceMappingURL=nonce-store.d.ts.map