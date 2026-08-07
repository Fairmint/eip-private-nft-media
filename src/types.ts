import type { Address, Hex } from "viem";

export type TokenStandard = "erc721" | "erc1155" | "erc20";

export type TokenPrivateMediaResource = {
  form: "token";
  chainId: number;
  standard: TokenStandard;
  contract: Address;
  /**
   * Present for `erc721` and `erc1155`; absent for `erc20`.
   * Unsigned base-10 integer without leading zeros (except `0`).
   */
  tokenId?: string;
  /**
   * Minimum gating amount in base units.
   * Required for `erc20` (including when the threshold is `1`).
   * Optional for `erc1155` when greater than `1`; absent form means `1`.
   * Must not be present for `erc721`.
   */
  minAmount?: string;
  account: Address;
  privateMediaUri: string;
};

export type PolicyPrivateMediaResource = {
  form: "policy";
  /** Server-defined policy id; compared by exact string match without percent-decoding. */
  policyId: string;
  account: Address;
  privateMediaUri: string;
  /** SIWE chain-id selected by the resource server when issuing the challenge. */
  chainId: number;
};

export type PrivateMediaResource =
  | TokenPrivateMediaResource
  | PolicyPrivateMediaResource;

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
  /**
   * ERC-1155: `balanceOf(account, id)` when `tokenId` is set.
   * ERC-20: `balanceOf(account)` when `tokenId` is omitted.
   */
  balanceOf(input: {
    chainId: number;
    contract: Address;
    tokenId?: string;
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
    /** Optional challenge-parameter binding (account, binding, resource). */
    scope?: string;
  }): string;
  consumeNonce(input: {
    domain: string;
    nonce: string;
    now: Date;
    scope?: string;
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

export type PolicyEvaluator = {
  evaluatePolicy(input: {
    policyId: string;
    account: Address;
    privateMediaUri: string;
    now: Date;
  }): Promise<boolean>;
};

export type VerificationRequest = {
  proof: AuthorizationProof;
  /** Expected binding the server determined for this URI + account. */
  resource: PrivateMediaResource;
  chainReader: NftAuthorizationReader;
  nonceStore: NonceStore;
  delegationVerifier?: DelegationVerifier;
  /** Required when `resource.form` is `"policy"`. */
  policyEvaluator?: PolicyEvaluator;
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
  | "erc1155_insufficient_balance"
  | "erc20_insufficient_balance"
  | "policy_denied"
  | "unauthorized";

export class AuthorizationError extends Error {
  code: AuthorizationErrorCode;

  constructor(code: AuthorizationErrorCode, message: string) {
    super(message);
    this.name = "AuthorizationError";
    this.code = code;
  }
}
