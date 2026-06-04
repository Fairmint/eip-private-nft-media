import { createHmac, timingSafeEqual } from "node:crypto";

import { demoSecret } from "./config.js";

type ResourceTokenGrant = {
  expiresAt: string;
  resourceUri: string;
  version: 1;
};

export function signedResourceUrl(
  resourceUri: string,
  now = new Date(),
): string {
  const url = new URL(resourceUri);
  const grant: ResourceTokenGrant = {
    expiresAt: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
    resourceUri,
    version: 1,
  };
  url.searchParams.set("access_token", createResourceToken(grant));
  return url.toString();
}

export function verifyResourceToken(
  token: string | undefined,
  resourceUri: string,
  now = new Date(),
): boolean {
  if (!token) return false;
  const grant = parseResourceToken(token);
  return (
    !!grant &&
    grant.resourceUri === resourceUri &&
    new Date(grant.expiresAt).getTime() > now.getTime()
  );
}

function createResourceToken(grant: ResourceTokenGrant): string {
  const payload = encode(JSON.stringify(grant));
  return `${payload}.${sign(payload)}`;
}

function parseResourceToken(token: string): ResourceTokenGrant | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !verify(payload, signature)) return null;

  let parsed: Partial<ResourceTokenGrant>;
  try {
    parsed = JSON.parse(decode(payload)) as Partial<ResourceTokenGrant>;
  } catch {
    return null;
  }

  if (
    parsed.version !== 1 ||
    typeof parsed.expiresAt !== "string" ||
    typeof parsed.resourceUri !== "string"
  ) {
    return null;
  }

  return {
    expiresAt: parsed.expiresAt,
    resourceUri: parsed.resourceUri,
    version: 1,
  };
}

function sign(payload: string): string {
  return createHmac("sha256", demoSecret("DEMO_DELEGATION_SECRET"))
    .update(payload)
    .digest("base64url");
}

function verify(payload: string, signature: string): boolean {
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}
