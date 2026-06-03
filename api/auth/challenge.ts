import { getAddress } from "viem";

import {
  createPrivateMediaChallenge,
  formatPrivateMediaChallengeResponse,
} from "../../src/index.js";
import {
  applyCors,
  json,
  methodNotAllowed,
  optionalParam,
  requiredParam,
  type ApiRequest,
  type ApiResponse,
} from "../lib/http.js";
import { nonceStore } from "../lib/nonce-store.js";
import { privateMediaResource, routeResource } from "../lib/resources.js";

export default function handler(req: ApiRequest, res: ApiResponse): void {
  if (applyCors(req, res)) return;
  if (req.method !== "GET") return methodNotAllowed(res);

  const address = getAddress(requiredParam(req, "address"));
  const account = getAddress(optionalParam(req, "account") ?? address);
  const resource = privateMediaResource({
    route: routeResource({
      chainId: requiredParam(req, "chainId"),
      contract: requiredParam(req, "contract"),
      tokenId: requiredParam(req, "tokenId"),
    }),
    account,
    privateMediaUri: requiredParam(req, "resource"),
    standard:
      optionalParam(req, "standard") === "erc1155" ? "erc1155" : "erc721",
  });

  const challenge = createPrivateMediaChallenge({
    address,
    domain: new URL(resource.privateMediaUri).host,
    resource,
    nonceIssuer: nonceStore,
  });

  res.setHeader("Cache-Control", "no-store");
  json(res, 200, formatPrivateMediaChallengeResponse(challenge));
}
