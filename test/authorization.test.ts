import { beforeEach, describe, expect, it } from "vitest";
import { getAddress, type Address } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";

import {
  AuthorizationError,
  createPrivateMediaChallenge,
  createPrivateMediaResourceBinding,
  encodeAuthorizationProof,
  InMemoryDelegationVerifier,
  InMemoryNonceStore,
  parseAuthorizationHeader,
  parsePrivateMediaResourceBinding,
  verifyPrivateMediaAuthorization,
  type AuthorizationProof,
  type NftAuthorizationReader,
  type PrivateMediaResource,
} from "../src/index.js";

const NOW = new Date("2026-06-03T12:00:00.000Z");
const EXPIRATION = new Date("2026-06-03T12:10:00.000Z");
const HOST = "media.example.com";
const CONTRACT = getAddress("0xabc0000000000000000000000000000000000000");
const CONTRACT_ACCOUNT = getAddress(
  "0xcccc000000000000000000000000000000000000",
);

const owner = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f094538d9d2f14e083b50b6e6c1d7ad148a21811",
);
const operator = privateKeyToAccount(
  "0x5de4111a691a56960f0c7f0ab47a9b97ee5f93b1f050a7f87aaf8d7f567a0882",
);
const delegate = privateKeyToAccount(
  "0x7c8521182947d6dd6c0ed7dc32d8a84f540b8e53b4aa1538bc761a6d6de7e5d1",
);
const stranger = privateKeyToAccount(
  "0x47c99a5c3b7c2df1b4cf3f70c596d130fb4c9c7c3911f1fc8d2c02fca3d8a4d7",
);

describe("private NFT media authorization", () => {
  let reader: MockNftAuthorizationReader;
  let nonces: InMemoryNonceStore;
  let delegations: InMemoryDelegationVerifier;

  beforeEach(() => {
    reader = new MockNftAuthorizationReader();
    nonces = new InMemoryNonceStore();
    delegations = new InMemoryDelegationVerifier();
  });

  it("round-trips the deterministic SIWE resource binding", () => {
    const resource = erc721Resource("/asset/42");
    const binding = createPrivateMediaResourceBinding(resource);

    expect(parsePrivateMediaResourceBinding(binding)).toEqual(resource);
  });

  it("round-trips the SIWE authorization header", async () => {
    const resource = erc721Resource("/asset/42");
    const proof = await signProof(owner, resource, "header-nonce");

    expect(parseAuthorizationHeader(encodeAuthorizationProof(proof))).toEqual(
      proof,
    );
  });

  it("creates a signable SIWE challenge for a private media URI", async () => {
    const resource = erc721Resource("/asset/42");
    reader.setOwner(resource, owner.address);

    const challenge = createPrivateMediaChallenge({
      address: owner.address,
      domain: HOST,
      resource,
      nonceIssuer: nonces,
      issuedAt: NOW,
      expiresAt: EXPIRATION,
    });
    const proof = {
      message: challenge.message,
      signature: await owner.signMessage({ message: challenge.message }),
    };

    await expect(
      verifyPrivateMediaAuthorization({
        proof,
        resource,
        requestHost: HOST,
        requestUri: resource.privateMediaUri,
        chainReader: reader,
        nonceStore: nonces,
        now: NOW,
      }),
    ).resolves.toMatchObject({ authorizedBy: "owner" });
  });

  it("authorizes the current ERC-721 owner", async () => {
    const resource = erc721Resource("/asset/42");
    reader.setOwner(resource, owner.address);

    const proof = await signProof(owner, resource, "owner-nonce");
    const result = await verifyPrivateMediaAuthorization({
      proof,
      resource,
      requestHost: HOST,
      requestUri: resource.privateMediaUri,
      chainReader: reader,
      nonceStore: nonces,
      delegationVerifier: delegations,
      now: NOW,
    });

    expect(result.authorizedBy).toBe("owner");
    expect(result.subject).toBe(owner.address);
  });

  it("authorizes an ERC-721 approved operator", async () => {
    const resource = erc721Resource("/asset/42");
    reader.setOwner(resource, owner.address);
    reader.approveOperator(resource, owner.address, operator.address);

    const proof = await signProof(operator, resource, "operator-nonce");
    const result = await verifyPrivateMediaAuthorization({
      proof,
      resource,
      requestHost: HOST,
      requestUri: resource.privateMediaUri,
      chainReader: reader,
      nonceStore: nonces,
      now: NOW,
    });

    expect(result.authorizedBy).toBe("operator");
  });

  it("authorizes an ERC-721 token-approved address", async () => {
    const resource = erc721Resource("/asset/42");
    reader.setOwner(resource, owner.address);
    reader.approveToken(resource, operator.address);

    const proof = await signProof(operator, resource, "approved-nonce");
    const result = await verifyPrivateMediaAuthorization({
      proof,
      resource,
      requestHost: HOST,
      requestUri: resource.privateMediaUri,
      chainReader: reader,
      nonceStore: nonces,
      now: NOW,
    });

    expect(result.authorizedBy).toBe("tokenApproval");
  });

  it("authorizes an EIP-1271 contract-account signature hook", async () => {
    const resource = erc721Resource("/asset/42");
    reader.setOwner(resource, CONTRACT_ACCOUNT);
    reader.acceptContractSignature(CONTRACT_ACCOUNT);

    const proof = await signProof(
      owner,
      {
        ...resource,
        account: CONTRACT_ACCOUNT,
      },
      "eip1271nonce",
      resource.privateMediaUri,
      CONTRACT_ACCOUNT,
    );

    const result = await verifyPrivateMediaAuthorization({
      proof,
      resource: {
        ...resource,
        account: CONTRACT_ACCOUNT,
      },
      requestHost: HOST,
      requestUri: resource.privateMediaUri,
      chainReader: reader,
      nonceStore: nonces,
      now: NOW,
    });

    expect(result.authorizedBy).toBe("owner");
    expect(result.subject).toBe(CONTRACT_ACCOUNT);
  });

  it("rejects a SIWE proof bound to a different private resource URI", async () => {
    const resource = erc721Resource("/asset/42");
    const sibling = erc721Resource("/asset/42/sibling");
    reader.setOwner(resource, owner.address);

    const proof = await signProof(
      owner,
      resource,
      "wrong-resource-nonce",
      sibling.privateMediaUri,
    );

    await expect(
      verifyPrivateMediaAuthorization({
        proof,
        resource: sibling,
        requestHost: HOST,
        requestUri: sibling.privateMediaUri,
        chainReader: reader,
        nonceStore: nonces,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "resource_binding_mismatch" });
  });

  it("rejects non-HTTPS private media URIs", async () => {
    const resource = {
      ...erc721Resource("/asset/42"),
      privateMediaUri: "http://media.example.com/asset/42",
    };

    await expect(
      verifyPrivateMediaAuthorization({
        proof: {
          message: "invalid",
          signature: "0x",
        },
        resource,
        requestHost: HOST,
        requestUri: resource.privateMediaUri,
        chainReader: reader,
        nonceStore: nonces,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "invalid_private_media_uri" });
  });

  it("treats malformed resource bindings as authorization errors", async () => {
    const resource = erc721Resource("/asset/42");
    reader.setOwner(resource, owner.address);
    nonces.issueNonce({
      domain: HOST,
      nonce: "malformednonce",
      expiresAt: EXPIRATION,
    });

    const message = createSiweMessage({
      address: owner.address,
      chainId: resource.chainId,
      domain: HOST,
      expirationTime: EXPIRATION,
      issuedAt: NOW,
      nonce: "malformednonce",
      resources: [
        "eip155:8453/erc721:not-an-address/42?account=0x1230000000000000000000000000000000000000&resource=https%3A%2F%2Fmedia.example.com%2Fasset%2F42",
      ],
      uri: resource.privateMediaUri,
      version: "1",
    });

    await expect(
      verifyPrivateMediaAuthorization({
        proof: {
          message,
          signature: await owner.signMessage({ message }),
        },
        resource,
        requestHost: HOST,
        requestUri: resource.privateMediaUri,
        chainReader: reader,
        nonceStore: nonces,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "resource_binding_mismatch" });
  });

  it("rejects nonce replay after a successful verification", async () => {
    const resource = erc721Resource("/asset/42");
    reader.setOwner(resource, owner.address);

    const proof = await signProof(owner, resource, "replay-nonce");
    const request = {
      proof,
      resource,
      requestHost: HOST,
      requestUri: resource.privateMediaUri,
      chainReader: reader,
      nonceStore: nonces,
      now: NOW,
    };

    await expect(
      verifyPrivateMediaAuthorization(request),
    ).resolves.toMatchObject({
      authorizedBy: "owner",
    });
    await expect(
      verifyPrivateMediaAuthorization(request),
    ).rejects.toMatchObject({
      code: "nonce_invalid",
    });
  });

  it("requires positive ERC-1155 balance for the bound account", async () => {
    const resource = erc1155Resource("/asset/7");
    const proof = await signProof(owner, resource, "zero-balance-nonce");

    await expect(
      verifyPrivateMediaAuthorization({
        proof,
        resource,
        requestHost: HOST,
        requestUri: resource.privateMediaUri,
        chainReader: reader,
        nonceStore: nonces,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "erc1155_zero_balance" });
  });

  it("authorizes an ERC-1155 holder with positive balance", async () => {
    const resource = erc1155Resource("/asset/7");
    reader.setBalance(resource, owner.address, 1n);

    const proof = await signProof(owner, resource, "holder-nonce");
    const result = await verifyPrivateMediaAuthorization({
      proof,
      resource,
      requestHost: HOST,
      requestUri: resource.privateMediaUri,
      chainReader: reader,
      nonceStore: nonces,
      now: NOW,
    });

    expect(result.authorizedBy).toBe("holder");
  });

  it("authorizes an ERC-1155 approved operator", async () => {
    const resource = erc1155Resource("/asset/7");
    reader.setBalance(resource, owner.address, 1n);
    reader.approveOperator(resource, owner.address, operator.address);

    const proof = await signProof(operator, resource, "erc1155operator");
    const result = await verifyPrivateMediaAuthorization({
      proof,
      resource,
      requestHost: HOST,
      requestUri: resource.privateMediaUri,
      chainReader: reader,
      nonceStore: nonces,
      now: NOW,
    });

    expect(result.authorizedBy).toBe("operator");
  });

  it("limits delegated access to a selected JSON resource", async () => {
    const privateImage = erc721Resource("/resource/private-image.png");
    const thirdPartyJson = erc721Resource("/resource/third-party-view.json");
    reader.setOwner(thirdPartyJson, owner.address);

    delegations.add({
      delegator: owner.address,
      delegate: delegate.address,
      chainId: thirdPartyJson.chainId,
      contract: thirdPartyJson.contract,
      standard: thirdPartyJson.standard,
      tokenId: thirdPartyJson.tokenId,
      allowedResourceUris: [thirdPartyJson.privateMediaUri],
      expiresAt: EXPIRATION,
      revocationId: "share-third-party-json-only",
    });

    const jsonProof = await signProof(
      delegate,
      thirdPartyJson,
      "delegate-json-nonce",
    );
    await expect(
      verifyPrivateMediaAuthorization({
        proof: jsonProof,
        resource: thirdPartyJson,
        requestHost: HOST,
        requestUri: thirdPartyJson.privateMediaUri,
        chainReader: reader,
        nonceStore: nonces,
        delegationVerifier: delegations,
        now: NOW,
      }),
    ).resolves.toMatchObject({ authorizedBy: "delegation" });

    const imageProof = await signProof(
      delegate,
      privateImage,
      "delegate-image-nonce",
    );
    await expect(
      verifyPrivateMediaAuthorization({
        proof: imageProof,
        resource: privateImage,
        requestHost: HOST,
        requestUri: privateImage.privateMediaUri,
        chainReader: reader,
        nonceStore: nonces,
        delegationVerifier: delegations,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("surfaces typed authorization errors", async () => {
    const resource = erc721Resource("/asset/42");
    reader.setOwner(resource, owner.address);

    const proof = await signProof(stranger, resource, "stranger-nonce");
    await expect(
      verifyPrivateMediaAuthorization({
        proof,
        resource,
        requestHost: HOST,
        requestUri: resource.privateMediaUri,
        chainReader: reader,
        nonceStore: nonces,
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  async function signProof(
    account: PrivateKeyAccount,
    resource: PrivateMediaResource,
    nonce: string,
    uri = resource.privateMediaUri,
    subject = account.address,
  ): Promise<AuthorizationProof> {
    const siweNonce = nonce.replace(/[^a-zA-Z0-9]/gu, "");

    nonces.issueNonce({
      domain: HOST,
      nonce: siweNonce,
      expiresAt: EXPIRATION,
    });

    const message = createSiweMessage({
      address: subject,
      chainId: resource.chainId,
      domain: HOST,
      expirationTime: EXPIRATION,
      issuedAt: NOW,
      nonce: siweNonce,
      resources: [createPrivateMediaResourceBinding(resource)],
      uri,
      version: "1",
    });

    return {
      message,
      signature: await account.signMessage({ message }),
    };
  }
});

function erc721Resource(path: string): PrivateMediaResource {
  return {
    chainId: 8453,
    standard: "erc721",
    contract: CONTRACT,
    tokenId: "42",
    account: owner.address,
    privateMediaUri: `https://${HOST}${path}`,
  };
}

function erc1155Resource(path: string): PrivateMediaResource {
  return {
    chainId: 8453,
    standard: "erc1155",
    contract: CONTRACT,
    tokenId: "7",
    account: owner.address,
    privateMediaUri: `https://${HOST}${path}`,
  };
}

class MockNftAuthorizationReader implements NftAuthorizationReader {
  private owners = new Map<string, Address>();
  private approvals = new Map<string, Address>();
  private operators = new Set<string>();
  private balances = new Map<string, bigint>();
  private contractSignatures = new Set<string>();

  setOwner(resource: PrivateMediaResource, account: Address): void {
    this.owners.set(tokenKey(resource), account);
  }

  approveOperator(
    resource: PrivateMediaResource,
    account: Address,
    operator: Address,
  ): void {
    this.operators.add(operatorKey(resource, account, operator));
  }

  approveToken(resource: PrivateMediaResource, account: Address): void {
    this.approvals.set(tokenKey(resource), account);
  }

  acceptContractSignature(account: Address): void {
    this.contractSignatures.add(account.toLowerCase());
  }

  setBalance(
    resource: PrivateMediaResource,
    account: Address,
    balance: bigint,
  ): void {
    this.balances.set(balanceKey(resource, account), balance);
  }

  async ownerOf(input: {
    chainId: number;
    contract: Address;
    tokenId: string;
  }): Promise<Address> {
    const ownerAddress = this.owners.get(
      key(input.chainId, input.contract, input.tokenId),
    );
    if (!ownerAddress) throw new Error("owner not configured");
    return ownerAddress;
  }

  async getApproved(input: {
    chainId: number;
    contract: Address;
    tokenId: string;
  }): Promise<Address | null> {
    return (
      this.approvals.get(key(input.chainId, input.contract, input.tokenId)) ??
      null
    );
  }

  async balanceOf(input: {
    chainId: number;
    contract: Address;
    tokenId: string;
    account: Address;
  }): Promise<bigint> {
    return (
      this.balances.get(
        key(input.chainId, input.contract, input.tokenId, input.account),
      ) ?? 0n
    );
  }

  async isApprovedForAll(input: {
    chainId: number;
    contract: Address;
    account: Address;
    operator: Address;
  }): Promise<boolean> {
    return this.operators.has(
      key(input.chainId, input.contract, input.account, input.operator),
    );
  }

  async isValidEip1271Signature(input: { address: Address }): Promise<boolean> {
    return this.contractSignatures.has(input.address.toLowerCase());
  }
}

function tokenKey(resource: PrivateMediaResource): string {
  return key(resource.chainId, resource.contract, resource.tokenId);
}

function balanceKey(resource: PrivateMediaResource, account: Address): string {
  return key(resource.chainId, resource.contract, resource.tokenId, account);
}

function operatorKey(
  resource: PrivateMediaResource,
  account: Address,
  operator: Address,
): string {
  return key(resource.chainId, resource.contract, account, operator);
}

function key(...parts: readonly (string | number)[]): string {
  return parts.map((part) => String(part).toLowerCase()).join(":");
}
