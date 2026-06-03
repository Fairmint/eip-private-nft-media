import {
  requiredParam,
  text,
  type ApiRequest,
  type ApiResponse,
} from "../../../../lib/http.js";
import { routeResource } from "../../../../lib/resources.js";
import { previewSvg } from "../../../../lib/svg.js";

export default function handler(req: ApiRequest, res: ApiResponse): void {
  const route = routeResource({
    chainId: requiredParam(req, "chainId"),
    contract: requiredParam(req, "contract"),
    tokenId: requiredParam(req, "tokenId"),
  });
  text(res, 200, previewSvg(route.tokenId), "image/svg+xml; charset=utf-8");
}
