import { requireDemoContract } from "../../../lib/config.js";
import {
  applyCors,
  json,
  requiredParam,
  type ApiRequest,
  type ApiResponse,
} from "../../../lib/http.js";
import {
  metadataUrl,
  privateMetadataUrl,
  publicImageUrl,
  routeResource,
} from "../../../lib/resources.js";

export default function handler(req: ApiRequest, res: ApiResponse): void {
  if (applyCors(req, res)) return;

  const route = routeResource({
    chainId: requiredParam(req, "chainId"),
    contract: requiredParam(req, "contract"),
    tokenId: requiredParam(req, "tokenId"),
  });
  requireDemoContract();

  json(res, 200, {
    name: `Private Media Demo #${route.tokenId}`,
    description:
      "Public metadata with a fallback image and a private_media_uri unlock path.",
    external_url: metadataUrl(req, route),
    image: publicImageUrl(req, route),
    private_media_uri: privateMetadataUrl(req, route),
  });
}
