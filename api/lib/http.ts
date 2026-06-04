import type {
  IncomingHttpHeaders,
  IncomingMessage,
  ServerResponse,
} from "node:http";

import { configuredPublicBaseUrl } from "./config.js";

export type ApiRequest = IncomingMessage & {
  body?: unknown;
  query?: Record<string, string | string[]>;
};

export type ApiResponse = ServerResponse & {
  json(body: unknown): void;
  status(code: number): ApiResponse;
};

export function applyCors(req: ApiRequest, res: ApiResponse): boolean {
  const origin = req.headers.origin;
  const allowedOrigin = process.env.DEMO_WEB_ORIGIN ?? origin ?? "*";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization,Content-Type,X-Demo-Account,X-Demo-Delegation",
  );
  res.setHeader("Access-Control-Expose-Headers", "WWW-Authenticate");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }

  return false;
}

export function json(res: ApiResponse, status: number, body: unknown): void {
  res.status(status);
  res.setHeader("Content-Type", "application/json");
  res.json(body);
}

export function text(
  res: ApiResponse,
  status: number,
  body: string,
  contentType = "text/plain; charset=utf-8",
): void {
  res.status(status);
  res.setHeader("Content-Type", contentType);
  res.end(body);
}

export function methodNotAllowed(res: ApiResponse): void {
  json(res, 405, { error: "method_not_allowed" });
}

export function requiredParam(req: ApiRequest, name: string): string {
  const value = req.query?.[name];
  const textValue = Array.isArray(value) ? value[0] : value;
  if (!textValue) throw new Error(`Missing ${name}`);
  return textValue;
}

export function optionalParam(
  req: ApiRequest,
  name: string,
): string | undefined {
  const value = req.query?.[name];
  return Array.isArray(value) ? value[0] : value;
}

export function requestBaseUrl(req: ApiRequest): string {
  return (
    publicBaseUrlOrLocalFallback() ??
    `${requestProtocol(req)}://${rawRequestHost(req)}`
  ).replace(/\/$/u, "");
}

function publicBaseUrlOrLocalFallback(): string | undefined {
  const configured = configuredPublicBaseUrl();
  if (configured) return configured;
  if (process.env.VERCEL === "1" || process.env.NODE_ENV === "production") {
    throw new Error("Set DEMO_PUBLIC_BASE_URL before deploying the demo API.");
  }
  return undefined;
}

function rawRequestHost(req: ApiRequest): string {
  return (
    headerValue(req.headers, "x-forwarded-host") ??
    headerValue(req.headers, "host") ??
    "localhost"
  );
}

export function requestUrl(req: ApiRequest): string {
  return new URL(req.url ?? "/", requestBaseUrl(req)).toString();
}

export function bearerHeader(req: ApiRequest): string | undefined {
  return headerValue(req.headers, "authorization");
}

export function headerValue(
  headers: IncomingHttpHeaders,
  name: string,
): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function requestProtocol(req: ApiRequest): string {
  return headerValue(req.headers, "x-forwarded-proto") ?? "http";
}
