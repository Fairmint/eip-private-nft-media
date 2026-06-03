import { getAddress } from "viem";

import {
  AuthorizationError,
  parseAuthorizationHeader,
  verifyPrivateMediaAuthorization,
} from "../src/index.js";
import { createDemoChainReader } from "./lib/chain-reader.js";
import {
  createDelegationToken,
  delegationGrantFromResource,
} from "./lib/delegation-token.js";
import {
  applyCors,
  bearerHeader,
  json,
  methodNotAllowed,
  requestHost,
  type ApiRequest,
  type ApiResponse,
} from "./lib/http.js";
import { nonceStore } from "./lib/nonce-store.js";
import { privateMediaResource, routeResource } from "./lib/resources.js";

type DelegationRequestBody = {
  account?: string;
  chainId?: string;
  contract?: string;
  delegate?: string;
  expiresInSeconds?: number;
  resourceUri?: string;
  tokenId?: string;
};

export default async function handler(
  req: ApiRequest,
  res: ApiResponse,
): Promise<void> {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return methodNotAllowed(res);

  const authorization = bearerHeader(req);
  if (!authorization) {
    return json(res, 401, { error: "authorization_required" });
  }

  const body = req.body as DelegationRequestBody;
  if (
    !body.account ||
    !body.chainId ||
    !body.contract ||
    !body.delegate ||
    !body.resourceUri ||
    !body.tokenId
  ) {
    return json(res, 400, { error: "invalid_delegation_request" });
  }

  const resource = privateMediaResource({
    route: routeResource({
      chainId: body.chainId,
      contract: body.contract,
      tokenId: body.tokenId,
    }),
    account: getAddress(body.account),
    privateMediaUri: body.resourceUri,
  });

  try {
    await verifyPrivateMediaAuthorization({
      proof: parseAuthorizationHeader(authorization),
      resource,
      requestHost: requestHost(req),
      requestUri: body.resourceUri,
      chainReader: createDemoChainReader(),
      nonceStore,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return json(res, 401, { error: error.code });
    }
    throw error;
  }

  const expiresAt = new Date(
    Date.now() + Math.min(body.expiresInSeconds ?? 1800, 86_400) * 1000,
  );
  const token = createDelegationToken(
    delegationGrantFromResource({
      delegate: getAddress(body.delegate),
      expiresAt,
      resource,
    }),
  );

  json(res, 200, {
    delegation_token: token,
    expires_at: expiresAt.toISOString(),
    resource_uri: resource.privateMediaUri,
  });
}
