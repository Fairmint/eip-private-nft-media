import {
  AuthorizationError,
  createPrivateMediaChallenge,
  expectedTokenBinding,
  formatPrivateMediaChallengeResponse,
  parseAuthorizationHeader,
  verifyPrivateMediaAuthorization,
  type AuthorizationResult,
  type NftAuthorizationReader,
  type NonceStore,
  type PolicyEvaluator,
  type PrivateMediaResource,
} from "../src/index.js";

type ProtectedRequest = {
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
  nonceStore: NonceStore;
  /**
   * Resolve the expected binding for this URI + account.
   * Token-form `gating` MAY differ from the advertised token in the URI path.
   * For advertised-token owners/holders, prefer an advertised-token binding
   * (ERC-8291 owner floor) or another binding that account satisfies.
   * Policy-form bindings need a `policyEvaluator` on verify.
   */
  resolveExpectedBinding(input: {
    privateMediaUri: string;
    account: `0x${string}`;
  }): PrivateMediaResource;
  challengeUriFor(resource: PrivateMediaResource): string;
  loadProtectedBody(
    resource: PrivateMediaResource,
    authorization: AuthorizationResult,
  ): Promise<unknown>;
  policyEvaluator?: PolicyEvaluator;
};

export function serveChallenge(
  request: ChallengeRequest,
  privateMediaUri: string,
  dependencies: ResourceServerDependencies,
): ProtectedResponse {
  const account = request.account ?? request.address;
  const resource = dependencies.resolveExpectedBinding({
    privateMediaUri,
    account,
  });

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
        resource,
        nonceStore: dependencies.nonceStore,
        statement:
          resource.form === "policy"
            ? `Unlock private NFT media under policy ${resource.policyId}.`
            : `Unlock private NFT media gated by ${resource.standard} ${resource.contract}/${resource.tokenId}.`,
      }),
    ),
  };
}

export async function serveProtectedResource(
  request: ProtectedRequest,
  privateMediaUri: string,
  account: `0x${string}`,
  dependencies: ResourceServerDependencies,
): Promise<ProtectedResponse> {
  const resource = dependencies.resolveExpectedBinding({
    privateMediaUri,
    account,
  });
  const challengeUri = dependencies.challengeUriFor(resource);

  if (!request.authorizationHeader) {
    return siweChallenge(challengeUri);
  }

  let authorization: AuthorizationResult;
  try {
    authorization = await verifyPrivateMediaAuthorization({
      proof: parseAuthorizationHeader(request.authorizationHeader),
      resource,
      chainReader: dependencies.chainReader,
      nonceStore: dependencies.nonceStore,
      ...(dependencies.policyEvaluator
        ? { policyEvaluator: dependencies.policyEvaluator }
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

/** Example: advertised URI path token equals gating token. */
export function sameTokenBinding(input: {
  chainId: number;
  contract: `0x${string}`;
  tokenId: string;
  account: `0x${string}`;
  privateMediaUri: string;
}): PrivateMediaResource {
  return expectedTokenBinding({
    privateMediaUri: input.privateMediaUri,
    account: input.account,
    gating: {
      chainId: input.chainId,
      standard: "erc721",
      contract: input.contract,
      tokenId: input.tokenId,
    },
  });
}

export const exampleManifest = {
  name: "Example NFT",
  description: "Private holder-only description.",
  image: "https://media.example.com/resource/private-image.png",
};

function siweChallenge(challengeUri: string): ProtectedResponse {
  return {
    status: 401,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
      "WWW-Authenticate": `SIWE realm="private-nft-media", challenge_uri="${challengeUri}"`,
    },
    body: {
      error: "authorization_required",
    },
  };
}
