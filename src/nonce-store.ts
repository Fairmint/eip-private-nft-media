import { randomBytes } from "node:crypto";

import { AuthorizationError, type NonceStore } from "./types.js";

type StoredNonce = {
  expiresAt: Date;
  consumed: boolean;
};

export class InMemoryNonceStore implements NonceStore {
  private nonces = new Map<string, StoredNonce>();

  issueNonce(input: {
    domain: string;
    expiresAt: Date;
    nonce?: string;
  }): string {
    const nonce = input.nonce ?? randomBytes(16).toString("hex");
    this.nonces.set(key(input.domain, nonce), {
      expiresAt: input.expiresAt,
      consumed: false,
    });
    return nonce;
  }

  async consumeNonce(input: {
    domain: string;
    nonce: string;
    now: Date;
  }): Promise<void> {
    const nonceKey = key(input.domain, input.nonce);
    const stored = this.nonces.get(nonceKey);

    if (!stored) {
      throw new AuthorizationError(
        "nonce_invalid",
        "nonce was not issued by this resource server",
      );
    }

    if (stored.consumed) {
      throw new AuthorizationError(
        "nonce_invalid",
        "nonce has already been consumed",
      );
    }

    if (stored.expiresAt.getTime() <= input.now.getTime()) {
      throw new AuthorizationError("nonce_invalid", "nonce has expired");
    }

    stored.consumed = true;
  }
}

function key(domain: string, nonce: string): string {
  return `${domain}:${nonce}`;
}
