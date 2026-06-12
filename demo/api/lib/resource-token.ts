import { sign, verify } from "hono/jwt";

import { demoSecret } from "./config.js";

type ResourceTokenGrant = {
  exp: number;
  resourceUri: string;
  version: 1;
};

export async function signedResourceUrl(
  resourceUri: string,
  now = new Date(),
): Promise<string> {
  const url = new URL(resourceUri);
  const grant: ResourceTokenGrant = {
    exp: Math.floor((now.getTime() + 5 * 60 * 1000) / 1000),
    resourceUri,
    version: 1,
  };
  url.searchParams.set("access_token", await createResourceToken(grant));
  return url.toString();
}

export async function verifyResourceToken(
  token: string | undefined,
  resourceUri: string,
  now = new Date(),
): Promise<boolean> {
  if (!token) return false;
  const grant = await parseResourceToken(token);
  return (
    !!grant &&
    grant.resourceUri === resourceUri &&
    grant.exp * 1000 > now.getTime()
  );
}

function createResourceToken(grant: ResourceTokenGrant): Promise<string> {
  return sign(grant, demoSecret("DEMO_DELEGATION_SECRET"), "HS256");
}

async function parseResourceToken(
  token: string,
): Promise<ResourceTokenGrant | null> {
  let parsed: Record<string, unknown>;
  try {
    parsed = (await verify(
      token,
      demoSecret("DEMO_DELEGATION_SECRET"),
      "HS256",
    )) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (
    parsed.version !== 1 ||
    typeof parsed.exp !== "number" ||
    typeof parsed.resourceUri !== "string"
  ) {
    return null;
  }

  return {
    exp: parsed.exp,
    resourceUri: parsed.resourceUri,
    version: 1,
  };
}
