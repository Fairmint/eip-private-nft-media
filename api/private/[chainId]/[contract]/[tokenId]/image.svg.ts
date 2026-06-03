import { verifyProtectedRequest } from "../../../../lib/protected-resource.js";
import {
  optionalParam,
  requiredParam,
  requestUrl,
  text,
  type ApiRequest,
  type ApiResponse,
} from "../../../../lib/http.js";
import { verifyResourceToken } from "../../../../lib/resource-token.js";
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
  const unsignedResourceUri = unsignedRequestUrl(req);
  if (
    verifyResourceToken(optionalParam(req, "access_token"), unsignedResourceUri)
  ) {
    text(res, 200, privateSvg(route.tokenId), "image/svg+xml; charset=utf-8");
    return;
  }

  const authorization = await verifyProtectedRequest({
    req,
    res,
    resourceUri: unsignedResourceUri,
    route,
  });
  if (!authorization) return;

  text(res, 200, privateSvg(route.tokenId), "image/svg+xml; charset=utf-8");
}

function unsignedRequestUrl(req: ApiRequest): string {
  const url = new URL(requestUrl(req));
  url.searchParams.delete("access_token");
  return url.toString();
}
