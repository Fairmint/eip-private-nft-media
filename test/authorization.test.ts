import { beforeEach, describe, expect, it } from "vitest";
import { getAddress, isAddressEqual, type Address } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { SiweMessage } from "siwe";

import {
  AuthorizationError,
  challengeNonceScope,
  createPrivateMediaChallenge,
  createPrivateMediaResourceBinding,
  encodeAuthorizationProof,
  encodeRfc3986Component,
  expectedPolicyBinding,
  expectedTokenBinding,
  formatPrivateMediaChallengeResponse,
  InMemoryNonceStore,
  parseAuthorizationHeader,
  parsePrivateMediaResourceBinding,
  verifyPrivateMediaAuthorization,
  type AuthorizationProof,
  type NftAuthorizationReader,
  type PolicyEvaluator,
  type PrivateMediaResource,
  type TokenPrivateMediaResource,
} from "../src/index.js";

const NOW = new Date("2026-06-03T12:00:00.000Z");
const EXPIRATION = new Date("2026-06-03T12:10:00.000Z");
const HOST = "media.example.com";
const CONTRACT = getAddress("0xabc0000000000000000000000000000000000000");
const GATING_CONTRACT = getAddress(
  "0xdef0000000000000000000000000000000000000",
);
const ERC20_CONTRACT = getAddress("0xfed0000000000000000000000000000000000000");
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

describe("private NFT media authorization", () => {
  let reader: MockNftAuthorizationReader;
  let nonces: InMemoryNonceStore;
  let delegations: TestDelegationVerifier;
  let policies: TestPolicyEvaluator;

  beforeEach(() => {
    reader = new MockNftAuthorizationReader();
    nonces = new InMemoryNonceStore();
    delegations = new TestDelegationVerifier();
    policies = new TestPolicyEvaluator();
  });

  it("round-trips the deterministic SIWE resource binding", () => {
    const resource = erc721Resource("/asset/42");
    const binding = createPrivateMediaResourceBinding(resource);

    expect(parsePrivateMediaResourceBinding(binding)).toEqual(resource);
  });

  it("percent-encodes all RFC 3986 reserved characters in the resource query", () => {
    const privateMediaUri = `https://${HOST}/a!b'c(d)*e`;
    const resource = erc721Resource("/ignored");
    resource.privateMediaUri = privateMediaUri;
    const binding = createPrivateMediaResourceBinding(resource);

    expect(binding).toContain(
      `resource=${encodeRfc3986Component(privateMediaUri)}`,
    );
    expect(binding).not.toContain("resource=https://");
    expect(parsePrivateMediaResourceBinding(binding)?.privateMediaUri).toBe(
      privateMediaUri,
    );
  });

  it("matches the ERC token-form encoding example", () => {
    const privateMediaUri = `https://${HOST}/eip-private-nft-media/8453/${CONTRACT}/42`;
    const resource = expectedTokenBinding({
      privateMediaUri,
      account: getAddress("0x1230000000000000000000000000000000000000"),
      gating: {
        chainId: 8453,
        standard: "erc721",
        contract: CONTRACT,
        tokenId: "42",
      },
    });

    expect(createPrivateMediaResourceBinding(resource)).toBe(
      `eip155:8453/erc721:${CONTRACT}/42?account=${getAddress("0x1230000000000000000000000000000000000000")}&resource=${encodeRfc3986Component(privateMediaUri)}`,
    );
  });

  it("matches the ERC erc20 and erc1155 minAmount encoding examples", () => {
    const privateMediaUri = `https://${HOST}/eip-private-nft-media/8453/${CONTRACT}/42`;
    const account = getAddress("0x1230000000000000000000000000000000000000");

    const erc1155 = expectedTokenBinding({
      privateMediaUri,
      account,
      gating: {
        chainId: 1,
        standard: "erc1155",
        contract: GATING_CONTRACT,
        tokenId: "7",
        minAmount: "3",
      },
    });
    expect(createPrivateMediaResourceBinding(erc1155)).toBe(
      `eip155:1/erc1155:${GATING_CONTRACT}/7?account=${account}&minAmount=3&resource=${encodeRfc3986Component(privateMediaUri)}`,
    );

    const erc20 = expectedTokenBinding({
      privateMediaUri,
      account,
      gating: {
        chainId: 1,
        standard: "erc20",
        contract: ERC20_CONTRACT,
        minAmount: "1000000000000000000",
      },
    });
    expect(createPrivateMediaResourceBinding(erc20)).toBe(
      `eip155:1/erc20:${ERC20_CONTRACT}?account=${account}&minAmount=1000000000000000000&resource=${encodeRfc3986Component(privateMediaUri)}`,
    );
  });

  it("rejects invalid minAmount and path-segment shapes", () => {
    expect(
      parsePrivateMediaResourceBinding(
        `eip155:1/erc20:${ERC20_CONTRACT}/7?account=${owner.address}&minAmount=1&resource=https%3A%2F%2Fmedia.example.com%2Fa`,
      ),
    ).toBeNull();
    expect(
      parsePrivateMediaResourceBinding(
        `eip155:1/erc721:${CONTRACT}?account=${owner.address}&resource=https%3A%2F%2Fmedia.example.com%2Fa`,
      ),
    ).toBeNull();
    expect(
      parsePrivateMediaResourceBinding(
        `eip155:1/erc1155:${CONTRACT}/7?account=${owner.address}&minAmount=1&resource=https%3A%2F%2Fmedia.example.com%2Fa`,
      ),
    ).toBeNull();
    expect(
      parsePrivateMediaResourceBinding(
        `eip155:1/erc20:${ERC20_CONTRACT}?account=${owner.address}&resource=https%3A%2F%2Fmedia.example.com%2Fa`,
      ),
    ).toBeNull();
    expect(
      parsePrivateMediaResourceBinding(
        `eip155:1/erc721:${CONTRACT}/42?account=${owner.address}&minAmount=1&resource=https%3A%2F%2Fmedia.example.com%2Fa`,
      ),
    ).toBeNull();
    expect(
      parsePrivateMediaResourceBinding(
        `eip155:1/erc1155:${CONTRACT}/7?minAmount=3&account=${owner.address}&resource=https%3A%2F%2Fmedia.example.com%2Fa`,
      ),
    ).toBeNull();
    expect(
      parsePrivateMediaResourceBinding(
        `eip155:1/erc721:${CONTRACT}/42?account=${owner.address}&account=${owner.address}&resource=https%3A%2F%2Fmedia.example.com%2Fa`,
      ),
    ).toBeNull();

    expect(() =>
      expectedTokenBinding({
        privateMediaUri: `https://${HOST}/a`,
        account: owner.address,
        gating: {
          chainId: 1,
          standard: "erc721",
          contract: CONTRACT,
          tokenId: "42",
          minAmount: "1",
        },
      }),
    ).toThrow(AuthorizationError);

    expect(() =>
      expectedTokenBinding({
        privateMediaUri: `https://${HOST}/a`,
        account: owner.address,
        gating: {
          chainId: 1,
          standard: "erc1155",
          contract: CONTRACT,
          tokenId: "7",
          minAmount: "1",
        },
      }),
    ).toThrow(AuthorizationError);

    expect(() =>
      expectedTokenBinding({
        privateMediaUri: `https://${HOST}/a`,
        account: owner.address,
        gating: {
          chainId: 1,
          standard: "erc20",
          contract: ERC20_CONTRACT,
        },
      }),
    ).toThrow(AuthorizationError);
  });

  it("authorizes an erc20 binding when balance meets minAmount", async () => {
    const resource = erc20Resource("/asset/erc20", "1000");
    reader.setBalance(resource, owner.address, 1000n);

    const proof = await signProof(owner, resource, "erc20oknonce");
    await expect(
      verifyPrivateMediaAuthorization({
        proof,
        resource,
        chainReader: reader,
        nonceStore: nonces,
        now: NOW,
      }),
    ).resolves.toMatchObject({ subject: owner.address, resource });
  });

  it("rejects an erc20 binding when balance is below minAmount", async () => {
    const resource = erc20Resource("/asset/erc20-low", "1000");
    reader.setBalance(resource, owner.address, 999n);

    const proof = await signProof(owner, resource, "erc20lownonce");
    await expect(
      verifyPrivateMediaAuthorization({
        proof,
        resource,
        chainReader: reader,
        nonceStore: nonces,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "erc20_insufficient_balance" });
  });

  it("rejects erc20 signer≠account without explicit delegation (not allowance)", async () => {
    const resource = erc20Resource("/asset/erc20-signer", "1");
    reader.setBalance(resource, owner.address, 1n);

    const proof = await signProof(operator, resource, "erc20signernonce");
    await expect(
      verifyPrivateMediaAuthorization({
        proof,
        resource,
        chainReader: reader,
        nonceStore: nonces,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("rejects erc1155 below an explicit minAmount greater than 1", async () => {
    const resource = expectedTokenBinding({
      privateMediaUri: `https://${HOST}/asset/1155-min`,
      account: owner.address,
      gating: {
        chainId: 8453,
        standard: "erc1155",
        contract: CONTRACT,
        tokenId: "7",
        minAmount: "3",
      },
    });
    reader.setBalance(resource, owner.address, 2n);

    const proof = await signProof(owner, resource, "erc1155belownonce");
    await expect(
      verifyPrivateMediaAuthorization({
        proof,
        resource,
        chainReader: reader,
        nonceStore: nonces,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "erc1155_insufficient_balance" });
  });

  it("round-trips policy-form bindings without decoding policyId", () => {
    const resource = policyResource("press-preview");
    const binding = createPrivateMediaResourceBinding(resource);
    const parsed = parsePrivateMediaResourceBinding(binding);

    expect(binding.startsWith("policy:press-preview?")).toBe(true);
    expect(parsed).toMatchObject({
      form: "policy",
      policyId: "press-preview",
      account: resource.account,
      privateMediaUri: resource.privateMediaUri,
    });
  });

  it("rejects neither-form and malformed policy bindings", () => {
    expect(parsePrivateMediaResourceBinding("not-a-binding")).toBeNull();
    expect(
      parsePrivateMediaResourceBinding(
        "policy:?account=0x1230000000000000000000000000000000000000&resource=https%3A%2F%2Fmedia.example.com%2Fa",
      ),
    ).toBeNull();
    expect(
      parsePrivateMediaResourceBinding(
        "policy:bad policy?account=0x1230000000000000000000000000000000000000&resource=https%3A%2F%2Fmedia.example.com%2Fa",
      ),
    ).toBeNull();
    expect(() =>
      createPrivateMediaResourceBinding({
        form: "policy",
        policyId: "",
        account: owner.address,
        privateMediaUri: `https://${HOST}/asset/42`,
        chainId: 8453,
      }),
    ).toThrow(AuthorizationError);
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
      nonceStore: nonces,
      issuedAt: NOW,
      expiresAt: EXPIRATION,
      statement: "Unlock private NFT media for demo token 42.",
    });
    expect(challenge.message).toContain(
      "Unlock private NFT media for demo token 42.",
    );
    expect(formatPrivateMediaChallengeResponse(challenge)).toEqual({
      message: challenge.message,
      expires_at: EXPIRATION.toISOString(),
    });
    const proof = {
      message: challenge.message,
      signature: await owner.signMessage({ message: challenge.message }),
    };

    await expect(
      verifyPrivateMediaAuthorization({
        proof,
        resource,
        chainReader: reader,
        nonceStore: nonces,
        now: NOW,
      }),
    ).resolves.toMatchObject({ subject: owner.address, resource });
  });

  it("authorizes the current ERC-721 owner", async () => {
    const resource = erc721Resource("/asset/42");
    reader.setOwner(resource, owner.address);

    const proof = await signProof(owner, resource, "owner-nonce");
    const result = await verifyPrivateMediaAuthorization({
      proof,
      resource,
      chainReader: reader,
      nonceStore: nonces,
      now: NOW,
    });

    expect(result.subject).toBe(owner.address);
    expect(result.resource).toEqual(resource);
  });

  it("rejects an ERC-721 signer that claims someone else's account", async () => {
    const resource = erc721Resource("/asset/42");
    reader.setOwner(resource, owner.address);

    const proof = await signProof(
      operator,
      resource,
      "unapproved-signer-nonce",
    );

    await expect(
      verifyPrivateMediaAuthorization({
        proof,
        resource,
        chainReader: reader,
        nonceStore: nonces,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("rejects erc721_account_mismatch even when getApproved would match the signer", async () => {
    const resource = erc721Resource("/asset/42");
    // Bound account is operator, but ownerOf returns owner.
    resource.account = operator.address;
    reader.setOwner(resource, owner.address);
    reader.approveToken(resource, operator.address);

    const proof = await signProof(operator, resource, "acctmismatch");

    await expect(
      verifyPrivateMediaAuthorization({
        proof,
        resource,
        chainReader: reader,
        nonceStore: nonces,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "erc721_account_mismatch" });
  });

  it("authorizes a gating token different from the advertised URI path token", async () => {
    const advertisedUri = `https://${HOST}/eip-private-nft-media/8453/${CONTRACT}/42`;
    const resource = expectedTokenBinding({
      privateMediaUri: advertisedUri,
      account: owner.address,
      gating: {
        chainId: 1,
        standard: "erc1155",
        contract: GATING_CONTRACT,
        tokenId: "7",
      },
    });
    reader.setBalance(resource, owner.address, 1n);

    const proof = await signProof(owner, resource, "gatingdiff");
    await expect(
      verifyPrivateMediaAuthorization({
        proof,
        resource,
        chainReader: reader,
        nonceStore: nonces,
        now: NOW,
      }),
    ).resolves.toMatchObject({ subject: owner.address, resource });
  });

  it("authorizes an advertised-token owner without the alternate gating token", async () => {
    const advertisedUri = `https://${HOST}/eip-private-nft-media/8453/${CONTRACT}/42`;
    // Server-selected expected binding names the advertised token (owner floor),
    // not the alternate gating token the account does not hold.
    const resource = expectedTokenBinding({
      privateMediaUri: advertisedUri,
      account: owner.address,
      gating: {
        chainId: 8453,
        standard: "erc721",
        contract: CONTRACT,
        tokenId: "42",
      },
    });
    reader.setOwner(resource, owner.address);

    const proof = await signProof(owner, resource, "advertisedfloor");
    await expect(
      verifyPrivateMediaAuthorization({
        proof,
        resource,
        chainReader: reader,
        nonceStore: nonces,
        now: NOW,
      }),
    ).resolves.toMatchObject({ subject: owner.address, resource });
  });

  it("compares policyId by exact string without percent-decoding", () => {
    const encodedId = "press%2Dpreview";
    const resource = expectedPolicyBinding({
      privateMediaUri: `https://${HOST}/eip-private-nft-media/8453/${CONTRACT}/42`,
      account: owner.address,
      policyId: encodedId,
      chainId: 8453,
    });
    const binding = createPrivateMediaResourceBinding(resource);
    const parsed = parsePrivateMediaResourceBinding(binding);

    expect(binding.startsWith(`policy:${encodedId}?`)).toBe(true);
    expect(parsed?.form).toBe("policy");
    if (parsed?.form === "policy") {
      expect(parsed.policyId).toBe(encodedId);
      expect(parsed.policyId).not.toBe("press-preview");
    }
  });

  it("authorizes a policy-form binding when the evaluator allows it", async () => {
    const resource = policyResource("press-preview");
    policies.allow("press-preview", owner.address);

    const proof = await signProof(owner, resource, "policysuccess");
    await expect(
      verifyPrivateMediaAuthorization({
        proof,
        resource,
        chainReader: reader,
        nonceStore: nonces,
        policyEvaluator: policies,
        now: NOW,
      }),
    ).resolves.toMatchObject({ subject: owner.address, resource });
  });

  it("rejects policy-form access when the evaluator denies it", async () => {
    const resource = policyResource("press-preview");

    const proof = await signProof(owner, resource, "policydenied");
    await expect(
      verifyPrivateMediaAuthorization({
        proof,
        resource,
        chainReader: reader,
        nonceStore: nonces,
        policyEvaluator: policies,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "policy_denied" });
  });

  it("rejects a wrong policy id against the expected binding", async () => {
    const expected = policyResource("press-preview");
    const wrong = policyResource("other-policy");
    policies.allow("press-preview", owner.address);
    policies.allow("other-policy", owner.address);

    const proof = await signProof(owner, wrong, "wrongpolicy");
    await expect(
      verifyPrivateMediaAuthorization({
        proof,
        resource: expected,
        chainReader: reader,
        nonceStore: nonces,
        policyEvaluator: policies,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "resource_binding_mismatch" });
  });

  it("rejects SIWE messages with more than one resources entry", async () => {
    const resource = erc721Resource("/asset/42");
    reader.setOwner(resource, owner.address);
    const sibling = erc721Resource("/asset/43");

    nonces.issueNonce({
      domain: HOST,
      nonce: "tworesources",
      expiresAt: EXPIRATION,
      scope: challengeNonceScope(resource),
    });

    const message = new SiweMessage({
      address: owner.address,
      chainId: resource.chainId,
      domain: HOST,
      expirationTime: EXPIRATION.toISOString(),
      issuedAt: NOW.toISOString(),
      nonce: "tworesources",
      resources: [
        createPrivateMediaResourceBinding(resource),
        createPrivateMediaResourceBinding(sibling),
      ],
      uri: resource.privateMediaUri,
      version: "1",
    }).prepareMessage();

    await expect(
      verifyPrivateMediaAuthorization({
        proof: {
          message,
          signature: await owner.signMessage({ message }),
        },
        resource,
        chainReader: reader,
        nonceStore: nonces,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "resource_binding_mismatch" });
  });

  it("rejects SIWE chain-id mismatch for token-form bindings", async () => {
    const resource = erc721Resource("/asset/42");
    reader.setOwner(resource, owner.address);

    nonces.issueNonce({
      domain: HOST,
      nonce: "wrongchain",
      expiresAt: EXPIRATION,
      scope: challengeNonceScope(resource),
    });

    const message = new SiweMessage({
      address: owner.address,
      chainId: 1,
      domain: HOST,
      expirationTime: EXPIRATION.toISOString(),
      issuedAt: NOW.toISOString(),
      nonce: "wrongchain",
      resources: [createPrivateMediaResourceBinding(resource)],
      uri: resource.privateMediaUri,
      version: "1",
    }).prepareMessage();

    await expect(
      verifyPrivateMediaAuthorization({
        proof: {
          message,
          signature: await owner.signMessage({ message }),
        },
        resource,
        chainReader: reader,
        nonceStore: nonces,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "chain_mismatch" });
  });

  it("rejects SIWE chain-id mismatch for policy-form bindings", async () => {
    const resource = policyResource("press-preview");
    policies.allow("press-preview", owner.address);

    nonces.issueNonce({
      domain: HOST,
      nonce: "policychain",
      expiresAt: EXPIRATION,
      scope: challengeNonceScope(resource),
    });

    const message = new SiweMessage({
      address: owner.address,
      chainId: 1,
      domain: HOST,
      expirationTime: EXPIRATION.toISOString(),
      issuedAt: NOW.toISOString(),
      nonce: "policychain",
      resources: [createPrivateMediaResourceBinding(resource)],
      uri: resource.privateMediaUri,
      version: "1",
    }).prepareMessage();

    await expect(
      verifyPrivateMediaAuthorization({
        proof: {
          message,
          signature: await owner.signMessage({ message }),
        },
        resource,
        chainReader: reader,
        nonceStore: nonces,
        policyEvaluator: policies,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "chain_mismatch" });
  });

  it("authorizes an ERC-721 approved operator when the reader exposes the hook", async () => {
    const resource = erc721Resource("/asset/42");
    reader.setOwner(resource, owner.address);
    reader.approveOperator(resource, owner.address, operator.address);

    const proof = await signProof(operator, resource, "operator-nonce");
    const result = await verifyPrivateMediaAuthorization({
      proof,
      resource,
      chainReader: reader,
      nonceStore: nonces,
      now: NOW,
    });

    expect(result.subject).toBe(operator.address);
  });

  it("authorizes an ERC-721 token-approved address when the reader exposes the hook", async () => {
    const resource = erc721Resource("/asset/42");
    reader.setOwner(resource, owner.address);
    reader.approveToken(resource, operator.address);

    const proof = await signProof(operator, resource, "approved-nonce");
    const result = await verifyPrivateMediaAuthorization({
      proof,
      resource,
      chainReader: reader,
      nonceStore: nonces,
      now: NOW,
    });

    expect(result.subject).toBe(operator.address);
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
      chainReader: reader,
      nonceStore: nonces,
      now: NOW,
    });

    expect(result.subject).toBe(CONTRACT_ACCOUNT);
  });

  it("treats EIP-1271 hook failures as invalid signatures", async () => {
    const resource = erc721Resource("/asset/42");
    reader.setOwner(resource, CONTRACT_ACCOUNT);
    reader.failContractSignature(CONTRACT_ACCOUNT);

    const proof = await signProof(
      owner,
      {
        ...resource,
        account: CONTRACT_ACCOUNT,
      },
      "eip1271failure",
      resource.privateMediaUri,
      CONTRACT_ACCOUNT,
    );

    await expect(
      verifyPrivateMediaAuthorization({
        proof,
        resource: {
          ...resource,
          account: CONTRACT_ACCOUNT,
        },
        chainReader: reader,
        nonceStore: nonces,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "invalid_signature" });
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
        chainReader: reader,
        nonceStore: nonces,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "resource_binding_mismatch" });
  });

  it("compares SIWE domains case-insensitively", async () => {
    const resource = {
      ...erc721Resource("/asset/42"),
      privateMediaUri: `https://Media.Example.com/asset/42`,
    };
    reader.setOwner(resource, owner.address);

    await expect(
      verifyPrivateMediaAuthorization({
        proof: await signProof(owner, resource, "mixed-case-host"),
        resource,
        chainReader: reader,
        nonceStore: nonces,
        now: NOW,
      }),
    ).resolves.toMatchObject({ subject: owner.address });
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
        chainReader: reader,
        nonceStore: nonces,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "invalid_private_media_uri" });
  });

  it("rejects private media URIs with fragments or embedded userinfo", () => {
    expect(() =>
      createPrivateMediaResourceBinding({
        ...erc721Resource("/asset/42"),
        privateMediaUri: `https://${HOST}/asset/42#fragment`,
      }),
    ).toThrow(AuthorizationError);

    expect(() =>
      createPrivateMediaResourceBinding({
        ...erc721Resource("/asset/42"),
        privateMediaUri: `https://user:pass@${HOST}/asset/42`,
      }),
    ).toThrow(AuthorizationError);
  });

  it("treats malformed resource bindings as authorization errors", async () => {
    const resource = erc721Resource("/asset/42");
    reader.setOwner(resource, owner.address);
    nonces.issueNonce({
      domain: HOST,
      nonce: "malformednonce",
      expiresAt: EXPIRATION,
      scope: challengeNonceScope(resource),
    });

    const message = new SiweMessage({
      address: owner.address,
      chainId: resource.chainId,
      domain: HOST,
      expirationTime: EXPIRATION.toISOString(),
      issuedAt: NOW.toISOString(),
      nonce: "malformednonce",
      resources: [
        "eip155:8453/erc721:not-an-address/42?account=0x1230000000000000000000000000000000000000&resource=https%3A%2F%2Fmedia.example.com%2Fasset%2F42",
      ],
      uri: resource.privateMediaUri,
      version: "1",
    }).prepareMessage();

    await expect(
      verifyPrivateMediaAuthorization({
        proof: {
          message,
          signature: await owner.signMessage({ message }),
        },
        resource,
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
      chainReader: reader,
      nonceStore: nonces,
      now: NOW,
    };

    await expect(
      verifyPrivateMediaAuthorization(request),
    ).resolves.toMatchObject({
      subject: owner.address,
    });
    await expect(
      verifyPrivateMediaAuthorization(request),
    ).rejects.toMatchObject({
      code: "nonce_invalid",
    });
  });

  it("rejects duplicate nonce issuance", () => {
    nonces.issueNonce({
      domain: HOST,
      nonce: "duplicatenonce",
      expiresAt: EXPIRATION,
    });

    expect(() =>
      nonces.issueNonce({
        domain: HOST,
        nonce: "duplicatenonce",
        expiresAt: EXPIRATION,
      }),
    ).toThrow(AuthorizationError);
  });

  it("requires positive ERC-1155 balance for the bound account", async () => {
    const resource = erc1155Resource("/asset/7");
    const proof = await signProof(owner, resource, "zero-balance-nonce");

    await expect(
      verifyPrivateMediaAuthorization({
        proof,
        resource,
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
      chainReader: reader,
      nonceStore: nonces,
      now: NOW,
    });

    expect(result.subject).toBe(owner.address);
  });

  it("rejects an ERC-1155 signer that claims someone else's account", async () => {
    const resource = erc1155Resource("/asset/7");
    reader.setBalance(resource, owner.address, 1n);

    const proof = await signProof(operator, resource, "erc1155unapproved");

    await expect(
      verifyPrivateMediaAuthorization({
        proof,
        resource,
        chainReader: reader,
        nonceStore: nonces,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("authorizes an ERC-1155 approved operator when the reader exposes the hook", async () => {
    const resource = erc1155Resource("/asset/7");
    reader.setBalance(resource, owner.address, 1n);
    reader.approveOperator(resource, owner.address, operator.address);

    const proof = await signProof(operator, resource, "erc1155operator");
    const result = await verifyPrivateMediaAuthorization({
      proof,
      resource,
      chainReader: reader,
      nonceStore: nonces,
      now: NOW,
    });

    expect(result.subject).toBe(operator.address);
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
      tokenId: thirdPartyJson.tokenId!,
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
        chainReader: reader,
        nonceStore: nonces,
        delegationVerifier: delegations,
        now: NOW,
      }),
    ).resolves.toMatchObject({ subject: delegate.address });

    const imageProof = await signProof(
      delegate,
      privateImage,
      "delegate-image-nonce",
    );
    await expect(
      verifyPrivateMediaAuthorization({
        proof: imageProof,
        resource: privateImage,
        chainReader: reader,
        nonceStore: nonces,
        delegationVerifier: delegations,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("does not consume a delegated proof when it is tried against another resource", async () => {
    const privateImage = erc721Resource("/resource/private-image.png");
    const thirdPartyJson = erc721Resource("/resource/third-party-view.json");
    reader.setOwner(thirdPartyJson, owner.address);

    delegations.add({
      delegator: owner.address,
      delegate: delegate.address,
      chainId: thirdPartyJson.chainId,
      contract: thirdPartyJson.contract,
      standard: thirdPartyJson.standard,
      tokenId: thirdPartyJson.tokenId!,
      allowedResourceUris: [thirdPartyJson.privateMediaUri],
      expiresAt: EXPIRATION,
    });

    const jsonProof = await signProof(
      delegate,
      thirdPartyJson,
      "single-delegate-json-read",
    );

    await expect(
      verifyPrivateMediaAuthorization({
        proof: jsonProof,
        resource: privateImage,
        chainReader: reader,
        nonceStore: nonces,
        delegationVerifier: delegations,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "uri_mismatch" });

    await expect(
      verifyPrivateMediaAuthorization({
        proof: jsonProof,
        resource: thirdPartyJson,
        chainReader: reader,
        nonceStore: nonces,
        delegationVerifier: delegations,
        now: NOW,
      }),
    ).resolves.toMatchObject({ subject: delegate.address });
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
      scope: challengeNonceScope(resource),
    });

    const message = new SiweMessage({
      address: subject,
      chainId: resource.chainId,
      domain: HOST,
      expirationTime: EXPIRATION.toISOString(),
      issuedAt: NOW.toISOString(),
      nonce: siweNonce,
      resources: [createPrivateMediaResourceBinding(resource)],
      uri,
      version: "1",
    }).prepareMessage();

    return {
      message,
      signature: await account.signMessage({ message }),
    };
  }
});

function erc721Resource(path: string): TokenPrivateMediaResource {
  return expectedTokenBinding({
    privateMediaUri: `https://${HOST}${path}`,
    account: owner.address,
    gating: {
      chainId: 8453,
      standard: "erc721",
      contract: CONTRACT,
      tokenId: "42",
    },
  });
}

function erc1155Resource(path: string): TokenPrivateMediaResource {
  return expectedTokenBinding({
    privateMediaUri: `https://${HOST}${path}`,
    account: owner.address,
    gating: {
      chainId: 8453,
      standard: "erc1155",
      contract: CONTRACT,
      tokenId: "7",
    },
  });
}

function erc20Resource(
  path: string,
  minAmount: string,
): TokenPrivateMediaResource {
  return expectedTokenBinding({
    privateMediaUri: `https://${HOST}${path}`,
    account: owner.address,
    gating: {
      chainId: 8453,
      standard: "erc20",
      contract: ERC20_CONTRACT,
      minAmount,
    },
  });
}

function policyResource(policyId: string): PrivateMediaResource {
  return expectedPolicyBinding({
    privateMediaUri: `https://${HOST}/eip-private-nft-media/8453/${CONTRACT}/42`,
    account: owner.address,
    policyId,
    chainId: 8453,
  });
}

class MockNftAuthorizationReader implements NftAuthorizationReader {
  private owners = new Map<string, Address>();
  private approvals = new Map<string, Address>();
  private operators = new Set<string>();
  private balances = new Map<string, bigint>();
  private contractSignatures = new Set<string>();
  private failedContractSignatures = new Set<string>();

  setOwner(resource: TokenPrivateMediaResource, account: Address): void {
    this.owners.set(tokenKey(resource), account);
  }

  approveOperator(
    resource: TokenPrivateMediaResource,
    account: Address,
    operator: Address,
  ): void {
    this.operators.add(operatorKey(resource, account, operator));
  }

  approveToken(resource: TokenPrivateMediaResource, account: Address): void {
    this.approvals.set(tokenKey(resource), account);
  }

  acceptContractSignature(account: Address): void {
    this.contractSignatures.add(account.toLowerCase());
  }

  failContractSignature(account: Address): void {
    this.failedContractSignatures.add(account.toLowerCase());
  }

  setBalance(
    resource: TokenPrivateMediaResource,
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
    tokenId?: string;
    account: Address;
  }): Promise<bigint> {
    return (
      this.balances.get(
        key(
          input.chainId,
          input.contract,
          input.tokenId ?? "",
          input.account,
        ),
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
    if (this.failedContractSignatures.has(input.address.toLowerCase())) {
      throw new Error("EIP-1271 verifier failed");
    }
    return this.contractSignatures.has(input.address.toLowerCase());
  }
}

type TestDelegation = {
  delegator: Address;
  delegate: Address;
  chainId: number;
  contract: Address;
  standard: TokenPrivateMediaResource["standard"];
  tokenId?: string;
  minAmount?: string;
  allowedResourceUris: readonly string[];
  expiresAt: Date;
  revocationId?: string;
};

class TestDelegationVerifier {
  private records: TestDelegation[] = [];

  add(record: TestDelegation): void {
    this.records.push(record);
  }

  async verifyDelegation(input: {
    delegate: Address;
    delegator: Address;
    resource: PrivateMediaResource;
    now: Date;
  }): Promise<boolean> {
    if (input.resource.form !== "token") return false;
    const resource = input.resource;
    return this.records.some(
      (record) =>
        isAddressEqual(record.delegate, input.delegate) &&
        isAddressEqual(record.delegator, input.delegator) &&
        record.chainId === resource.chainId &&
        isAddressEqual(record.contract, resource.contract) &&
        record.standard === resource.standard &&
        record.tokenId === resource.tokenId &&
        record.minAmount === resource.minAmount &&
        record.expiresAt.getTime() > input.now.getTime() &&
        record.allowedResourceUris.includes(resource.privateMediaUri),
    );
  }
}

class TestPolicyEvaluator implements PolicyEvaluator {
  private allowed = new Set<string>();

  allow(policyId: string, account: Address): void {
    this.allowed.add(`${policyId}:${account.toLowerCase()}`);
  }

  async evaluatePolicy(input: {
    policyId: string;
    account: Address;
    privateMediaUri: string;
    now: Date;
  }): Promise<boolean> {
    return this.allowed.has(`${input.policyId}:${input.account.toLowerCase()}`);
  }
}

function tokenKey(resource: TokenPrivateMediaResource): string {
  return key(resource.chainId, resource.contract, resource.tokenId ?? "");
}

function balanceKey(
  resource: TokenPrivateMediaResource,
  account: Address,
): string {
  return key(
    resource.chainId,
    resource.contract,
    resource.tokenId ?? "",
    account,
  );
}

function operatorKey(
  resource: TokenPrivateMediaResource,
  account: Address,
  operator: Address,
): string {
  return key(resource.chainId, resource.contract, account, operator);
}

function key(...parts: readonly (string | number)[]): string {
  return parts.map((part) => String(part).toLowerCase()).join(":");
}
