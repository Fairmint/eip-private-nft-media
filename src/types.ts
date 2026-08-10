import type { Address, Hex } from "viem";

export type TokenStandard = "erc721" | "erc1155" | "erc20";

export type Erc721PrivateMediaResource = {
  form: "token";
  chainId: number;
  standard: "erc721";
  contract: Address;
  /** Unsigned base-10 integer without leading zeros (except `0`). */
  tokenId: string;
  /** `erc721` bindings must not carry `minAmount`; ownership gates access. */
  minAmount?: never;
  account: Address;
  privateMediaUri: string;
};

export type Erc1155PrivateMediaResource = {
  form: "token";
  chainId: number;
  standard: "erc1155";
  contract: Address;
  /** Unsigned base-10 integer without leading zeros (except `0`). */
  tokenId: string;
  /**
   * Minimum gating balance in base units; required (including when the
   * threshold is `1`). Unsigned base-10 integer >= 1 without leading zeros.
   */
  minAmount: string;
  account: Address;
  privateMediaUri: string;
};

export type Erc20PrivateMediaResource = {
  form: "token";
  chainId: number;
  standard: "erc20";
  contract: Address;
  /** `erc20` bindings must not carry a token id segment. */
  tokenId?: never;
  /**
   * Minimum gating balance in base units; required (including when the
   * threshold is `1`). Unsigned base-10 integer >= 1 without leading zeros.
   */
  minAmount: string;
  account: Address;
  privateMediaUri: string;
};

export type TokenPrivateMediaResource =
  | Erc721PrivateMediaResource
  | Erc1155PrivateMediaResource
  | Erc20PrivateMediaResource;

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
