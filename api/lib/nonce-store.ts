import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import {
  AuthorizationError,
  type NonceIssuer,
  type NonceStore,
} from "../../src/index.js";

class DemoNonceStore implements NonceIssuer, NonceStore {
  private consumed = new Set<string>();

  issueNonce(input: { domain: string; expiresAt: Date }): string {
    const random = randomBytes(16).toString("hex");
    const expires = Math.floor(input.expiresAt.getTime() / 1000)
      .toString(36)
      .padStart(8, "0");
    return `${random}${expires}${sign(input.domain, random, expires)}`;
  }

  async consumeNonce(input: {
    domain: string;
    nonce: string;
    now: Date;
  }): Promise<void> {
    const parsed = parseNonce(input.nonce);
    if (
      !parsed ||
      !verifySignature(
        parsed.signature,
        sign(input.domain, parsed.random, parsed.expires),
      )
    ) {
      throw new AuthorizationError("nonce_invalid", "invalid demo nonce");
    }

    if (parseInt(parsed.expires, 36) * 1000 <= input.now.getTime()) {
      throw new AuthorizationError("nonce_invalid", "nonce has expired");
    }

    if (this.consumed.has(input.nonce)) {
      throw new AuthorizationError(
        "nonce_invalid",
        "nonce has already been consumed",
      );
    }

    this.consumed.add(input.nonce);
  }
}

export const nonceStore = new DemoNonceStore();

function parseNonce(
  nonce: string,
): { expires: string; random: string; signature: string } | null {
  if (!/^[a-zA-Z0-9]{104}$/u.test(nonce)) return null;
  return {
    random: nonce.slice(0, 32),
    expires: nonce.slice(32, 40),
    signature: nonce.slice(40),
  };
}

function sign(domain: string, random: string, expires: string): string {
  return createHmac("sha256", nonceSecret())
    .update(`${domain}:${random}:${expires}`)
    .digest("hex");
}

function verifySignature(
  actualSignature: string,
  expectedSignature: string,
): boolean {
  const expected = Buffer.from(expectedSignature);
  const actual = Buffer.from(actualSignature);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function nonceSecret(): string {
  return (
    process.env.DEMO_NONCE_SECRET ??
    process.env.DEMO_DELEGATION_SECRET ??
    "local-demo-secret-change-me"
  );
}
