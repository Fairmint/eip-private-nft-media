import { verifyProtectedRequest } from "../../../../lib/protected-resource.js";
import {
  requiredParam,
  requestUrl,
  type ApiRequest,
  type ApiResponse,
} from "../../../../lib/http.js";
import {
  privateImageUrl,
  routeResource,
  thirdPartyJsonUrl,
} from "../../../../lib/resources.js";
import { signedResourceUrl } from "../../../../lib/resource-token.js";

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

  res.status(200).json({
    name: `Unlocked Private Media Demo #${route.tokenId}`,
    description:
      "Private metadata returned after SIWE authorization for the exact private_media_uri.",
    image: signedResourceUrl(privateImageUrl(req, route)),
    private_resources: [
      {
        name: "Third-Party View",
        resource_uri: thirdPartyJsonUrl(req, route),
        media_type: "application/json",
      },
    ],
    unlocked_by: authorization.subject,
  });
}
