import type { Address, Hex } from "viem";

export type TokenStandard = "erc721" | "erc1155";

export type PrivateMediaResource = {
  chainId: number;
  standard: TokenStandard;
  contract: Address;
  tokenId: string;
  account: Address;
  privateMediaUri: string;
};

export type AuthorizationProof = {
  message: string;
  signature: Hex;
};

export type AuthorizationResult = {
  subject: Address;
  resource: PrivateMediaResource;
};

export type NftAuthorizationReader = {
  ownerOf(input: {
    chainId: number;
    contract: Address;
    tokenId: string;
  }): Promise<Address>;
  getApproved?(input: {
    chainId: number;
    contract: Address;
    tokenId: string;
  }): Promise<Address | null>;
  balanceOf(input: {
    chainId: number;
    contract: Address;
    tokenId: string;
    account: Address;
  }): Promise<bigint>;
  isApprovedForAll?(input: {
    chainId: number;
    contract: Address;
    account: Address;
    operator: Address;
  }): Promise<boolean>;
  isValidEip1271Signature?(input: {
    chainId: number;
    address: Address;
    message: string;
    signature: Hex;
  }): Promise<boolean>;
};

export type NonceStore = {
  issueNonce(input: {
    domain: string;
    expiresAt: Date;
    nonce?: string;
  }): string;
  consumeNonce(input: {
    domain: string;
    nonce: string;
    now: Date;
  }): Promise<void>;
};

export type DelegationVerifier = {
  verifyDelegation(input: {
    delegate: Address;
    delegator: Address;
    resource: PrivateMediaResource;
    now: Date;
  }): Promise<boolean>;
};

export type VerificationRequest = {
  proof: AuthorizationProof;
  resource: PrivateMediaResource;
  chainReader: NftAuthorizationReader;
  nonceStore: NonceStore;
  delegationVerifier?: DelegationVerifier;
  now?: Date;
};

export type AuthorizationErrorCode =
  | "invalid_authorization_header"
  | "invalid_siwe_message"
  | "invalid_signature"
  | "domain_mismatch"
  | "uri_mismatch"
  | "chain_mismatch"
  | "missing_expiration"
  | "expired_message"
  | "not_before"
  | "resource_binding_mismatch"
  | "invalid_private_media_uri"
  | "nonce_invalid"
  | "erc721_account_mismatch"
  | "erc1155_zero_balance"
  | "unauthorized";

export class AuthorizationError extends Error {
  code: AuthorizationErrorCode;

  constructor(code: AuthorizationErrorCode, message: string) {
    super(message);
    this.name = "AuthorizationError";
    this.code = code;
  }
}
