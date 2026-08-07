import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { getAddress } from "viem";

import {
  AuthorizationError,
  createPrivateMediaChallenge,
  formatPrivateMediaChallengeResponse,
  parseAuthorizationHeader,
  verifyPrivateMediaAuthorization,
} from "../../src/index.js";
import { createDemoChainReader } from "./lib/chain-reader.js";
import {
  createDelegationToken,
  delegationGrantFromResource,
} from "./lib/delegation-token.js";
import { nonceStore } from "./lib/nonce-store.js";
import {
  demoPolicyEvaluator,
  verifyProtectedRequest,
} from "./lib/protected-resource.js";
import {
  signedResourceUrl,
  verifyResourceToken,
} from "./lib/resource-token.js";
import {
  metadataUrl,
  privateImageUrl,
  privateMediaResource,
  privateMetadataUrl,
  publicImageUrl,
  routeResource,
  thirdPartyJsonUrl,
} from "./lib/resources.js";
import { previewSvg, privateSvg } from "./lib/svg.js";

type DelegationRequestBody = {
  account?: string;
  chainId?: string;
  contract?: string;
  delegate?: string;
  expiresInSeconds?: number;
  resourceUri?: string;
  tokenId?: string;
};

const app = new Hono();

app.use(
  "/api/*",
  cors({
    allowHeaders: [
      "Authorization",
      "Content-Type",
      "X-Demo-Account",
      "X-Demo-Delegation",
    ],
    allowMethods: ["GET", "POST", "OPTIONS"],
    exposeHeaders: ["WWW-Authenticate"],
  }),
);

app.get("/api/metadata/:chainId/:contract/:tokenId", (c) => {
  const route = routeFromParams(c);

  return c.json({
    name: `Private Media Demo #${route.tokenId}`,
    description:
      "Public metadata with a fallback image and a private_media_uri unlock path.",
    external_url: metadataUrl(c, route),
    image: publicImageUrl(c, route),
    private_media_uri: privateMetadataUrl(c, route),
  });
});

app.get("/api/public/:chainId/:contract/:tokenId/image.svg", (c) => {
  const route = routeFromParams(c);
  return svg(c, previewSvg(route.tokenId));
});

app.get("/api/auth/challenge", async (c) => {
  const address = getAddress(requiredQuery(c, "address"));
  const account = getAddress(c.req.query("account") ?? address);
  const route = routeResource({
    chainId: requiredQuery(c, "chainId"),
    contract: requiredQuery(c, "contract"),
    tokenId: requiredQuery(c, "tokenId"),
  });
  const resource = await privateMediaResource({
    route,
    account,
    privateMediaUri: requiredQuery(c, "resource"),
    standard: c.req.query("standard") === "erc1155" ? "erc1155" : "erc721",
  });

  const challenge = createPrivateMediaChallenge({
    address,
    domain: new URL(resource.privateMediaUri).host,
    resource,
    nonceStore,
    statement:
      resource.form === "policy"
        ? `Unlock private NFT media under policy ${resource.policyId}.`
        : resource.standard === "erc20"
          ? `Unlock private NFT media gated by erc20 ${resource.contract} (minAmount ${resource.minAmount}).`
          : `Unlock private NFT media gated by ${resource.standard} ${resource.contract}/${resource.tokenId}.`,
  });

  c.header("Cache-Control", "no-store");
  return c.json(formatPrivateMediaChallengeResponse(challenge));
});

app.get("/api/private/:chainId/:contract/:tokenId/metadata", async (c) => {
  const route = routeFromParams(c);
  const authorization = await verifyProtectedRequest({
    c,
    resourceUri: privateMetadataUrl(c, route),
    route,
  });
  if (authorization instanceof Response) return authorization;

  return c.json({
    name: `Unlocked Private Media Demo #${route.tokenId}`,
    description:
      "Private metadata returned after SIWE authorization for the exact private_media_uri.",
    image: await signedResourceUrl(privateImageUrl(c, route)),
    documents: [
      {
        name: "Third-Party View",
        media_type: "application/json",
        uri: thirdPartyJsonUrl(c, route),
      },
    ],
    unlocked_by: authorization.subject,
  });
});

app.get("/api/private/:chainId/:contract/:tokenId/image.svg", async (c) => {
  const route = routeFromParams(c);
  const unsignedResourceUri = privateImageUrl(c, route);
  if (
    await verifyResourceToken(c.req.query("access_token"), unsignedResourceUri)
  ) {
    return svg(c, privateSvg(route.tokenId));
  }

  const authorization = await verifyProtectedRequest({
    c,
    resourceUri: unsignedResourceUri,
    route,
  });
  if (authorization instanceof Response) return authorization;

  return svg(c, privateSvg(route.tokenId));
});

app.get(
  "/api/private/:chainId/:contract/:tokenId/third-party-view.json",
  async (c) => {
    const route = routeFromParams(c);
    const authorization = await verifyProtectedRequest({
      allowDelegation: true,
      c,
      resourceUri: thirdPartyJsonUrl(c, route),
      route,
    });
    if (authorization instanceof Response) return authorization;

    return c.json({
      token: `${route.contract}/${route.tokenId}`,
      scope: "third-party-view.json",
      summary:
        "This JSON document is delegated independently from the unlocked image.",
      requested_by: authorization.subject,
      token_account: authorization.resource.account,
      viewed_by: authorization.subject,
    });
  },
);

app.post("/api/delegations", async (c) => {
  const authorization = c.req.header("authorization");
  if (!authorization) return c.json({ error: "authorization_required" }, 401);

  const body = await readDelegationBody(c);
  if (
    !body?.account ||
    !body.chainId ||
    !body.contract ||
    !body.delegate ||
    !body.resourceUri ||
    !body.tokenId
  ) {
    return c.json({ error: "invalid_delegation_request" }, 400);
  }

  const chainReader = createDemoChainReader();
  const resource = await privateMediaResource({
    route: routeResource({
      chainId: body.chainId,
      contract: body.contract,
      tokenId: body.tokenId,
    }),
    account: getAddress(body.account),
    privateMediaUri: body.resourceUri,
    chainReader,
  });

  try {
    const policyEvaluator = demoPolicyEvaluator();
    await verifyPrivateMediaAuthorization({
      proof: parseAuthorizationHeader(authorization),
      resource,
      chainReader,
      nonceStore,
      ...(policyEvaluator ? { policyEvaluator } : {}),
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return c.json({ error: error.code }, 401);
    }
    throw error;
  }

  const expiresAt = new Date(
    Date.now() + Math.min(body.expiresInSeconds ?? 1800, 86_400) * 1000,
  );
  const token = await createDelegationToken(
    delegationGrantFromResource({
      delegate: getAddress(body.delegate),
      expiresAt,
      resource,
    }),
  );

  return c.json({
    delegation_token: token,
    expires_at: expiresAt.toISOString(),
    resource_uri: resource.privateMediaUri,
  });
});

app.notFound((c) => c.json({ error: "not_found" }, 404));

app.onError((error, c) => {
  if (error instanceof AuthorizationError) {
    return c.json({ error: error.code }, 400);
  }

  return c.json(
    { error: error instanceof Error ? error.message : "internal_error" },
    500,
  );
});

function routeFromParams(c: Context) {
  return routeResource({
    chainId: requiredParam(c, "chainId"),
    contract: requiredParam(c, "contract"),
    tokenId: requiredParam(c, "tokenId"),
  });
}

function requiredParam(c: Context, name: string): string {
  const value = c.req.param(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function requiredQuery(c: Context, name: string): string {
  const value = c.req.query(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function readDelegationBody(
  c: Context,
): Promise<DelegationRequestBody | null> {
  try {
    return (await c.req.json()) as DelegationRequestBody;
  } catch {
    return null;
  }
}

function svg(c: Context, body: string): Response {
  return c.body(body, 200, {
    "Content-Type": "image/svg+xml; charset=utf-8",
  });
}

export default app;
