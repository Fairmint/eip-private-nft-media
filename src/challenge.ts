import type { Address } from "viem";
import { createSiweMessage } from "viem/siwe";

import { createPrivateMediaResourceBinding } from "./resource-binding.js";
import type { NonceIssuer, PrivateMediaResource } from "./types.js";

export type PrivateMediaChallenge = {
  message: string;
  nonce: string;
  expiresAt: Date;
};

export type CreatePrivateMediaChallengeInput = {
  address: Address;
  domain: string;
  uri: string;
  resource: PrivateMediaResource;
  nonceIssuer: NonceIssuer;
  issuedAt?: Date;
  expiresAt?: Date;
};

export function createPrivateMediaChallenge(
  input: CreatePrivateMediaChallengeInput,
): PrivateMediaChallenge {
  const issuedAt = input.issuedAt ?? new Date();
  const expiresAt =
    input.expiresAt ?? new Date(issuedAt.getTime() + 5 * 60 * 1000);
  const nonce = input.nonceIssuer.issueNonce({
    domain: input.domain,
    expiresAt,
  });

  return {
    message: createSiweMessage({
      address: input.address,
      chainId: input.resource.chainId,
      domain: input.domain,
      expirationTime: expiresAt,
      issuedAt,
      nonce,
      resources: [createPrivateMediaResourceBinding(input.resource)],
      uri: input.uri,
      version: "1",
    }),
    nonce,
    expiresAt,
  };
}
