import {
  AuthorizationError,
  createPrivateMediaChallenge,
  formatPrivateMediaChallengeResponse,
  parseAuthorizationHeader,
  verifyPrivateMediaAuthorization,
  type AuthorizationResult,
  type DelegationVerifier,
  type NftAuthorizationReader,
  type NonceIssuer,
  type NonceStore,
  type PrivateMediaResource,
} from "../src/index.js";

type ProtectedRequest = {
  host: string;
  uri: string;
  authorizationHeader?: string;
};

type ChallengeRequest = {
  host: string;
  address: `0x${string}`;
  account?: `0x${string}`;
};

type ProtectedResponse = {
  status: number;
  headers: Record<string, string>;
  body: unknown;
};

type ResourceServerDependencies = {
  chainReader: NftAuthorizationReader;
  nonceStore: NonceStore & NonceIssuer;
  delegationVerifier?: DelegationVerifier;
  challengeUriFor(resource: PrivateMediaResource): string;
  loadProtectedBody(
    resource: PrivateMediaResource,
    authorization: AuthorizationResult,
  ): Promise<unknown>;
};

export function serveChallenge(
  request: ChallengeRequest,
  resource: PrivateMediaResource,
  dependencies: ResourceServerDependencies,
): ProtectedResponse {
  return {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
    body: formatPrivateMediaChallengeResponse(
      createPrivateMediaChallenge({
        address: request.address,
        domain: request.host,
        resource: {
          ...resource,
          account: request.account ?? request.address,
        },
        nonceIssuer: dependencies.nonceStore,
      }),
    ),
  };
}

export async function serveProtectedResource(
  request: ProtectedRequest,
  resource: PrivateMediaResource,
  dependencies: ResourceServerDependencies,
): Promise<ProtectedResponse> {
  const challengeUri = dependencies.challengeUriFor(resource);

  if (!request.authorizationHeader) {
    return siweChallenge(challengeUri);
  }

  let authorization: AuthorizationResult;
  try {
    authorization = await verifyPrivateMediaAuthorization({
      proof: parseAuthorizationHeader(request.authorizationHeader),
      resource,
      requestHost: request.host,
      requestUri: request.uri,
      chainReader: dependencies.chainReader,
      nonceStore: dependencies.nonceStore,
      ...(dependencies.delegationVerifier
        ? { authorizationPolicy: { allowDelegations: true } }
        : {}),
      ...(dependencies.delegationVerifier
        ? { delegationVerifier: dependencies.delegationVerifier }
        : {}),
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return siweChallenge(challengeUri);
    }
    throw error;
  }

  return {
    status: 200,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "application/json",
    },
    body: await dependencies.loadProtectedBody(resource, authorization),
  };
}

export const exampleManifest = {
  name: "Example NFT",
  description: "Private holder-only description.",
  image: "https://media.example.com/resource/private-image.png",
  private_resources: [
    {
      name: "Third-Party View",
      resource_uri: "https://media.example.com/resource/third-party-view.json",
      media_type: "application/json",
    },
  ],
};

function siweChallenge(challengeUri: string): ProtectedResponse {
  return {
    status: 401,
    headers: {
      "WWW-Authenticate": `SIWE realm="private-nft-media", challenge_uri="${challengeUri}"`,
    },
    body: {
      error: "authorization_required",
    },
  };
}
