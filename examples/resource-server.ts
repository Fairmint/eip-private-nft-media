import {
  parseAuthorizationHeader,
  verifyPrivateMediaAuthorization,
  type AuthorizationResult,
  type DelegationVerifier,
  type NftAuthorizationReader,
  type NonceStore,
  type PrivateMediaResource,
} from "../src/index.js";

type ProtectedRequest = {
  host: string;
  uri: string;
  authorizationHeader?: string;
};

type ProtectedResponse = {
  status: number;
  headers: Record<string, string>;
  body: unknown;
};

type ResourceServerDependencies = {
  chainReader: NftAuthorizationReader;
  nonceStore: NonceStore;
  delegationVerifier?: DelegationVerifier;
  challengeUriFor(resource: PrivateMediaResource): string;
  loadProtectedBody(
    resource: PrivateMediaResource,
    authorization: AuthorizationResult,
  ): Promise<unknown>;
};

export async function serveProtectedResource(
  request: ProtectedRequest,
  resource: PrivateMediaResource,
  dependencies: ResourceServerDependencies,
): Promise<ProtectedResponse> {
  const issuedChallengeUri = dependencies.challengeUriFor(resource);

  if (!request.authorizationHeader) {
    return siweChallenge(issuedChallengeUri);
  }

  const authorization = await verifyPrivateMediaAuthorization({
    proof: parseAuthorizationHeader(request.authorizationHeader),
    resource,
    requestHost: request.host,
    requestUri: request.uri,
    issuedChallengeUri,
    chainReader: dependencies.chainReader,
    nonceStore: dependencies.nonceStore,
    ...(dependencies.delegationVerifier
      ? { delegationVerifier: dependencies.delegationVerifier }
      : {}),
  });

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
  image: "https://media.example.com/resource/image.png",
  private_resources: [
    {
      name: "Subscription Agreement",
      resource_uri:
        "https://media.example.com/resource/subscription-agreement.pdf",
      media_type: "application/pdf",
    },
    {
      name: "Cap Table Snapshot",
      resource_uri: "https://media.example.com/resource/cap-table-snapshot.csv",
      media_type: "text/csv",
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
