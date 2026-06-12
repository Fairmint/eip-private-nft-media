import type { Context } from "hono";
import { getAddress, type Address } from "viem";

import {
  AuthorizationError,
  parseAuthorizationHeader,
  verifyPrivateMediaAuthorization,
  type AuthorizationResult,
} from "../../../src/index.js";
import { createDemoChainReader } from "./chain-reader.js";
import { createTokenDelegationVerifier } from "./delegation-token.js";
import { nonceStore } from "./nonce-store.js";
import {
  challengeUri,
  privateMediaResource,
  type DemoRouteResource,
} from "./resources.js";

export async function verifyProtectedRequest(input: {
  allowDelegation?: boolean;
  c: Context;
  resourceUri: string;
  route: DemoRouteResource;
}): Promise<AuthorizationResult | Response> {
  const authorization = input.c.req.header("authorization");
  if (!authorization) {
    return challengeResponse(input);
  }

  const account = accountFromRequest(input.c);
  if (!account) {
    return challengeResponse(input);
  }

  const resource = privateMediaResource({
    route: input.route,
    account,
    privateMediaUri: input.resourceUri,
  });

  try {
    return await verifyPrivateMediaAuthorization({
      proof: parseAuthorizationHeader(authorization),
      resource,
      chainReader: createDemoChainReader(),
      nonceStore,
      ...(input.allowDelegation
        ? {
            delegationVerifier: createTokenDelegationVerifier(
              input.c.req.header("x-demo-delegation"),
            ),
          }
        : {}),
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return challengeResponse(input);
    }
    throw error;
  }
}

export function accountFromRequest(c: Context): Address | null {
  const account = c.req.header("x-demo-account") ?? c.req.query("account");
  if (!account) return null;

  try {
    return getAddress(account);
  } catch {
    return null;
  }
}

function challengeResponse(input: {
  c: Context;
  resourceUri: string;
  route: DemoRouteResource;
}): Response {
  const account = accountFromRequest(input.c);
  const uri = challengeUri({
    c: input.c,
    route: input.route,
    resourceUri: input.resourceUri,
    ...(account ? { account } : {}),
  });

  input.c.header(
    "WWW-Authenticate",
    `SIWE realm="private-nft-media", challenge_uri="${uri}"`,
  );
  return input.c.json({ error: "authorization_required" }, 401);
}
