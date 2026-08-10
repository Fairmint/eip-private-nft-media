import { generateNonce } from "siwe";

import { AuthorizationError, type NonceStore } from "./types.js";

type StoredNonce = {
  expiresAt: Date;
};

export class InMemoryNonceStore implements NonceStore {
  private nonces = new Map<string, StoredNonce>();

  issueNonce(input: {
    domain: string;
    expiresAt: Date;
    nonce?: string;
    scope?: string;
  }): string {
    const nonce = input.nonce ?? generateNonce();
    const nonceKey = key(input.domain, nonce, input.scope);
    if (this.nonces.has(nonceKey)) {
      throw new AuthorizationError(
        "nonce_invalid",
        "nonce has already been issued",
      );
    }

    this.nonces.set(nonceKey, {
      expiresAt: input.expiresAt,
    });
    return nonce;
  }

  async consumeNonce(input: {
    domain: string;
    nonce: string;
    now: Date;
    scope?: string;
  }): Promise<void> {
    const nonceKey = key(input.domain, input.nonce, input.scope);
    const stored = this.nonces.get(nonceKey);

    if (!stored) {
      throw new AuthorizationError(
        "nonce_invalid",
        "nonce was not issued by this resource server",
      );
    }

    if (stored.expiresAt.getTime() <= input.now.getTime()) {
      this.nonces.delete(nonceKey);
      throw new AuthorizationError("nonce_invalid", "nonce has expired");
    }

    this.nonces.delete(nonceKey);
  }
}

function key(domain: string, nonce: string, scope?: string): string {
  return `${domain.toLowerCase()}:${scope ?? ""}:${nonce}`;
}
