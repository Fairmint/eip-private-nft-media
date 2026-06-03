import {
  applyCors,
  json,
  type ApiRequest,
  type ApiResponse,
} from "../lib/http.js";
import { demoConfig } from "../lib/config.js";

export default function handler(req: ApiRequest, res: ApiResponse): void {
  if (applyCors(req, res)) return;
  json(res, 200, demoConfig());
}
