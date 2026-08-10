import type { Context } from "hono";
import { getAddress, type Address } from "viem";

import {
  AuthorizationError,
  parseAuthorizationHeader,
  verifyPrivateMediaAuthorization,
  type AuthorizationResult,
  type PolicyEvaluator,
  type TokenStandard,
} from "../../../src/index.js";
import { createDemoChainReader } from "./chain-reader.js";
import { demoPolicyConfig } from "./config.js";
import { createTokenDelegationVerifier } from "./delegation-token.js";
import { nonceStore } from "./nonce-store.js";
import {
  advertisedTokenStandard,
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
  const standard = advertisedTokenStandard(input.c.req.query("standard"));
  const authorization = input.c.req.header("authorization");
  if (!authorization) {
    return challengeResponse(input, standard);
  }

  const account = accountFromRequest(input.c);
  if (!account) {
    return challengeResponse(input, standard);
  }

  const chainReader = createDemoChainReader();
  const resource = await privateMediaResource({
    route: input.route,
    account,
    privateMediaUri: input.resourceUri,
    standard,
    chainReader,
  });

  try {
    const policyEvaluator = demoPolicyEvaluator();
    return await verifyPrivateMediaAuthorization({
      proof: parseAuthorizationHeader(authorization),
      resource,
      chainReader,
      nonceStore,
      ...(policyEvaluator ? { policyEvaluator } : {}),
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
      return challengeResponse(input, standard);
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

export function demoPolicyEvaluator(): PolicyEvaluator | undefined {
  const policy = demoPolicyConfig();
  if (!policy) return undefined;

  return {
    async evaluatePolicy(input) {
      if (input.policyId !== policy.policyId) return false;
      return policy.accounts.has(input.account.toLowerCase());
    },
  };
}

function challengeResponse(
  input: {
    c: Context;
    resourceUri: string;
    route: DemoRouteResource;
  },
  standard: TokenStandard,
): Response {
  const account = accountFromRequest(input.c);
  const uri = challengeUri({
    c: input.c,
    route: input.route,
    resourceUri: input.resourceUri,
    standard,
    ...(account ? { account } : {}),
  });

  input.c.header(
    "WWW-Authenticate",
    `SIWE realm="private-nft-media", challenge_uri="${uri}"`,
  );
  return input.c.json({ error: "authorization_required" }, 401);
}
