import type { Hex } from "viem";

import { AuthorizationError, type AuthorizationProof } from "./types.js";

const SCHEME = "SIWE ";

export function encodeAuthorizationProof(proof: AuthorizationProof): string {
  const payload = Buffer.from(JSON.stringify(proof), "utf8").toString(
    "base64url",
  );
  return `${SCHEME}${payload}`;
}

export function parseAuthorizationHeader(
  header: string | null | undefined,
): AuthorizationProof {
  if (!header?.startsWith(SCHEME)) {
    throw new AuthorizationError(
      "invalid_authorization_header",
      "authorization header must use the SIWE scheme",
    );
  }

  try {
    const decoded = Buffer.from(
      header.slice(SCHEME.length),
      "base64url",
    ).toString("utf8");
    const parsed = JSON.parse(decoded) as Partial<AuthorizationProof>;

    if (
      typeof parsed.message !== "string" ||
      typeof parsed.signature !== "string"
    ) {
      throw new Error("missing proof fields");
    }

    if (!parsed.signature.startsWith("0x")) {
      throw new Error("signature must be hex");
    }

    return {
      message: parsed.message,
      signature: parsed.signature as Hex,
    };
  } catch (error) {
    throw new AuthorizationError(
      "invalid_authorization_header",
      error instanceof Error
        ? error.message
        : "invalid SIWE authorization payload",
    );
  }
}
