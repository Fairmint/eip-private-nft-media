import { verifyProtectedRequest } from "../../../../lib/protected-resource.js";
import {
  json,
  requiredParam,
  type ApiRequest,
  type ApiResponse,
} from "../../../../lib/http.js";
import { routeResource, thirdPartyJsonUrl } from "../../../../lib/resources.js";

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
    allowDelegation: true,
    req,
    res,
    resourceUri: thirdPartyJsonUrl(req, route),
    route,
  });
  if (!authorization) return;

  json(res, 200, {
    token: `${route.contract}/${route.tokenId}`,
    scope: "third-party-view.json",
    summary:
      "This JSON document is delegated independently from the unlocked image.",
    viewed_by: authorization.subject,
  });
}
