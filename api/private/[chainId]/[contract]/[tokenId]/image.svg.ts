import { verifyProtectedRequest } from "../../../../lib/protected-resource.js";
import {
  requiredParam,
  requestUrl,
  text,
  type ApiRequest,
  type ApiResponse,
} from "../../../../lib/http.js";
import { routeResource } from "../../../../lib/resources.js";
import { privateSvg } from "../../../../lib/svg.js";

export default async function handler(
  req: ApiRequest,
  res: ApiResponse,
): Promise<void> {
  const route = routeResource({
    chainId: requiredParam(req, "chainId"),
    contract: requiredParam(req, "contract"),
    tokenId: requiredParam(req, "tokenId"),
  });
  const authorization = await verifyProtectedRequest({
    req,
    res,
    resourceUri: requestUrl(req),
    route,
  });
  if (!authorization) return;

  text(res, 200, privateSvg(route.tokenId), "image/svg+xml; charset=utf-8");
}
