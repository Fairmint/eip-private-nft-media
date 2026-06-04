import { getAddress, type Address } from "viem";

import {
  AuthorizationError,
  parseAuthorizationHeader,
  verifyPrivateMediaAuthorization,
  type AuthorizationResult,
} from "../../src/index.js";
import { createDemoChainReader } from "./chain-reader.js";
import { createTokenDelegationVerifier } from "./delegation-token.js";
import {
  applyCors,
  bearerHeader,
  headerValue,
  json,
  type ApiRequest,
  type ApiResponse,
} from "./http.js";
import { nonceStore } from "./nonce-store.js";
import {
  challengeUri,
  privateMediaResource,
  type DemoRouteResource,
} from "./resources.js";

export async function verifyProtectedRequest(input: {
  allowDelegation?: boolean;
  req: ApiRequest;
  res: ApiResponse;
  resourceUri: string;
  route: DemoRouteResource;
}): Promise<AuthorizationResult | null> {
  if (applyCors(input.req, input.res)) return null;

  const authorization = bearerHeader(input.req);
  if (!authorization) {
    sendChallenge(input);
    return null;
  }

  const account = accountFromRequest(input.req);
  if (!account) {
    sendChallenge(input);
    return null;
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
              headerValue(input.req.headers, "x-demo-delegation"),
            ),
          }
        : {}),
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      sendChallenge(input);
      return null;
    }
    throw error;
  }
}

export function accountFromRequest(req: ApiRequest): Address | null {
  const queryValue = req.query?.account;
  const account =
    headerValue(req.headers, "x-demo-account") ??
    (Array.isArray(queryValue) ? queryValue[0] : queryValue);
  if (!account) return null;

  try {
    return getAddress(account);
  } catch {
    return null;
  }
}

function sendChallenge(input: {
  req: ApiRequest;
  res: ApiResponse;
  resourceUri: string;
  route: DemoRouteResource;
}): void {
  const account = accountFromRequest(input.req);
  const uri = challengeUri({
    req: input.req,
    route: input.route,
    resourceUri: input.resourceUri,
    ...(account ? { account } : {}),
  });

  input.res.setHeader(
    "WWW-Authenticate",
    `SIWE realm="private-nft-media", challenge_uri="${uri}"`,
  );
  json(input.res, 401, { error: "authorization_required" });
}
