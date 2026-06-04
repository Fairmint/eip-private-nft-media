import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import challenge from "../api/auth/challenge.js";
import delegations from "../api/delegations.js";
import config from "../api/demo/config.js";
import metadata from "../api/metadata/[chainId]/[contract]/[tokenId].js";
import privateImage from "../api/private/[chainId]/[contract]/[tokenId]/image.svg.js";
import privateMetadata from "../api/private/[chainId]/[contract]/[tokenId]/metadata.js";
import thirdPartyView from "../api/private/[chainId]/[contract]/[tokenId]/third-party-view.json.js";
import publicImage from "../api/public/[chainId]/[contract]/[tokenId]/image.svg.js";
import type { ApiRequest, ApiResponse } from "../api/lib/http.js";

type Handler = (req: ApiRequest, res: ApiResponse) => unknown;

const port = Number(process.env.PORT ?? "3000");
const routes: {
  handler: Handler;
  pattern: RegExp;
  query?: (match: RegExpMatchArray) => Record<string, string>;
}[] = [
  { pattern: /^\/api\/auth\/challenge$/u, handler: challenge },
  { pattern: /^\/api\/delegations$/u, handler: delegations },
  { pattern: /^\/api\/demo\/config$/u, handler: config },
  {
    pattern: /^\/api\/metadata\/([^/]+)\/([^/]+)\/([^/]+)$/u,
    handler: metadata,
    query: routeQuery,
  },
  {
    pattern: /^\/api\/public\/([^/]+)\/([^/]+)\/([^/]+)\/image\.svg$/u,
    handler: publicImage,
    query: routeQuery,
  },
  {
    pattern: /^\/api\/private\/([^/]+)\/([^/]+)\/([^/]+)\/metadata$/u,
    handler: privateMetadata,
    query: routeQuery,
  },
  {
    pattern: /^\/api\/private\/([^/]+)\/([^/]+)\/([^/]+)\/image\.svg$/u,
    handler: privateImage,
    query: routeQuery,
  },
  {
    pattern:
      /^\/api\/private\/([^/]+)\/([^/]+)\/([^/]+)\/third-party-view\.json$/u,
    handler: thirdPartyView,
    query: routeQuery,
  },
];

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const route = routes.find((candidate) =>
      candidate.pattern.test(url.pathname),
    );
    if (!route) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not_found" }));
      return;
    }

    const match = url.pathname.match(route.pattern);
    const apiReq = await requestWithBody(req, {
      ...Object.fromEntries(url.searchParams.entries()),
      ...(match && route.query ? route.query(match) : {}),
    });
    const apiRes = responseWithHelpers(res);
    await route.handler(apiReq, apiRes);
  } catch (error) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : "internal_error",
      }),
    );
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Demo API listening on http://127.0.0.1:${port}`);
});

function routeQuery(match: RegExpMatchArray): Record<string, string> {
  return {
    chainId: match[1] ?? "",
    contract: match[2] ?? "",
    tokenId: match[3] ?? "",
  };
}

async function requestWithBody(
  req: IncomingMessage,
  query: Record<string, string>,
): Promise<ApiRequest> {
  const body = await readBody(req);
  return Object.assign(req, {
    body,
    query,
  }) as ApiRequest;
}

function responseWithHelpers(res: ServerResponse): ApiResponse {
  const response = res as ApiResponse;
  response.status = (code: number) => {
    res.statusCode = code;
    return response;
  };
  response.json = (body: unknown) => {
    if (!res.hasHeader("Content-Type")) {
      res.setHeader("Content-Type", "application/json");
    }
    res.end(JSON.stringify(body));
  };
  return response;
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  if (req.method !== "POST" && req.method !== "PUT" && req.method !== "PATCH") {
    return undefined;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return undefined;
  return JSON.parse(raw);
}
