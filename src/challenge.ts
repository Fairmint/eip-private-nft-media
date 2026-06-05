import type { Address } from "viem";
import { SiweMessage } from "siwe";

import { createPrivateMediaResourceBinding } from "./resource-binding.js";
import type { NonceStore, PrivateMediaResource } from "./types.js";

export type PrivateMediaChallenge = {
  message: string;
  nonce: string;
  expiresAt: Date;
};

export type PrivateMediaChallengeResponse = {
  message: string;
  expires_at: string;
};

export type CreatePrivateMediaChallengeInput = {
  address: Address;
  domain: string;
  resource: PrivateMediaResource;
  nonceStore: NonceStore;
  issuedAt?: Date;
  expiresAt?: Date;
};

export function createPrivateMediaChallenge(
  input: CreatePrivateMediaChallengeInput,
): PrivateMediaChallenge {
  const issuedAt = input.issuedAt ?? new Date();
  const expiresAt =
    input.expiresAt ?? new Date(issuedAt.getTime() + 5 * 60 * 1000);
  const domain = input.domain.toLowerCase();
  const nonce = input.nonceStore.issueNonce({
    domain,
    expiresAt,
  });

  return {
    message: new SiweMessage({
      address: input.address,
      chainId: input.resource.chainId,
      domain,
      expirationTime: expiresAt.toISOString(),
      issuedAt: issuedAt.toISOString(),
      nonce,
      resources: [createPrivateMediaResourceBinding(input.resource)],
      uri: input.resource.privateMediaUri,
      version: "1",
    }).prepareMessage(),
    nonce,
    expiresAt,
  };
}

export function formatPrivateMediaChallengeResponse(
  challenge: PrivateMediaChallenge,
): PrivateMediaChallengeResponse {
  return {
    message: challenge.message,
    expires_at: challenge.expiresAt.toISOString(),
  };
}
