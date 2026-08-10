import { afterEach, describe, expect, it } from "vitest";
import { getAddress, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  challengeNonceScope,
  createPrivateMediaChallenge,
  createPrivateMediaResourceBinding,
  InMemoryNonceStore,
  verifyPrivateMediaAuthorization,
  type NftAuthorizationReader,
} from "../src/index.js";
import { demoPolicyConfig } from "../demo/api/lib/config.js";
import {
  advertisedTokenStandard,
  privateMediaResource,
} from "../demo/api/lib/resources.js";
import { demoContractAddress } from "../demo/shared/demo-nft.js";

const ACCOUNT = getAddress("0x1111111111111111111111111111111111111111");
const PRIVATE_MEDIA_URI =
  "https://media.example.com/api/private/84532/0xeeeE12600d717eB1e228963Ef58D1354de5236D9/1/metadata";

const owner = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f094538d9d2f14e083b50b6e6c1d7ad148a21811",
);

describe("demo advertised token standard", () => {
  it("treats standard=erc1155 as ERC-1155 and everything else as ERC-721", () => {
    expect(advertisedTokenStandard("erc1155")).toBe("erc1155");
    expect(advertisedTokenStandard("erc721")).toBe("erc721");
    expect(advertisedTokenStandard(undefined)).toBe("erc721");
    expect(advertisedTokenStandard(null)).toBe("erc721");
    expect(advertisedTokenStandard("erc20")).toBe("erc721");
  });
});

describe("demo challenge/verify standard alignment", () => {
  it("round-trips erc1155 advertised bindings between challenge and verify", async () => {
    const reader = holdingReader({ balance: 1n });
    const nonces = new InMemoryNonceStore();
    const route = {
      chainId: 84532,
      contract: demoContractAddress,
      tokenId: "1",
    };

    const challengeResource = await privateMediaResource({
      route,
      account: owner.address,
      privateMediaUri: PRIVATE_MEDIA_URI,
      standard: advertisedTokenStandard("erc1155"),
      chainReader: reader,
    });
    const verifyResource = await privateMediaResource({
      route,
      account: owner.address,
      privateMediaUri: PRIVATE_MEDIA_URI,
      standard: advertisedTokenStandard("erc1155"),
      chainReader: reader,
    });

    expect(challengeResource).toMatchObject({
      form: "token",
      standard: "erc1155",
      minAmount: "1",
    });
    expect(createPrivateMediaResourceBinding(challengeResource)).toBe(
      createPrivateMediaResourceBinding(verifyResource),
    );
    expect(challengeNonceScope(challengeResource)).toBe(
      challengeNonceScope(verifyResource),
    );

    const challenge = createPrivateMediaChallenge({
      address: owner.address,
      domain: "media.example.com",
      resource: challengeResource,
      nonceStore: nonces,
    });
    const signature = await owner.signMessage({
      message: challenge.message,
    });
    const result = await verifyPrivateMediaAuthorization({
      proof: { message: challenge.message, signature },
      resource: verifyResource,
      chainReader: reader,
      nonceStore: nonces,
    });
    expect(result.subject).toBe(owner.address);
  });

  it("would mismatch if verify omitted the challenge standard", async () => {
    const reader = holdingReader({
      balance: 1n,
      owner: ACCOUNT,
    });
    const route = {
      chainId: 84532,
      contract: demoContractAddress,
      tokenId: "1",
    };

    const challengeResource = await privateMediaResource({
      route,
      account: ACCOUNT,
      privateMediaUri: PRIVATE_MEDIA_URI,
      standard: advertisedTokenStandard("erc1155"),
      chainReader: reader,
    });
    const verifyWithoutStandard = await privateMediaResource({
      route,
      account: ACCOUNT,
      privateMediaUri: PRIVATE_MEDIA_URI,
      chainReader: reader,
    });

    expect(challengeResource).toMatchObject({ standard: "erc1155" });
    expect(verifyWithoutStandard).toMatchObject({ standard: "erc721" });
    expect(createPrivateMediaResourceBinding(challengeResource)).not.toBe(
      createPrivateMediaResourceBinding(verifyWithoutStandard),
    );
  });
});

describe("demoPolicyConfig", () => {
  afterEach(() => {
    delete process.env.DEMO_POLICY_ID;
    delete process.env.DEMO_POLICY_ACCOUNTS;
    delete process.env.DEMO_POLICY_CHAIN_ID;
  });

  it("returns null when DEMO_POLICY_ID is unset", () => {
    delete process.env.DEMO_POLICY_ID;
    expect(demoPolicyConfig()).toBeNull();
  });

  it("normalizes valid allowlisted accounts", () => {
    process.env.DEMO_POLICY_ID = "demo-policy";
    process.env.DEMO_POLICY_ACCOUNTS = `${ACCOUNT}, 0x2222222222222222222222222222222222222222`;

    const policy = demoPolicyConfig();
    expect(policy?.policyId).toBe("demo-policy");
    expect(policy?.accounts.has(ACCOUNT.toLowerCase())).toBe(true);
    expect(
      policy?.accounts.has("0x2222222222222222222222222222222222222222"),
    ).toBe(true);
  });

  it("fails fast on an invalid DEMO_POLICY_ACCOUNTS entry", () => {
    process.env.DEMO_POLICY_ID = "demo-policy";
    process.env.DEMO_POLICY_ACCOUNTS = `${ACCOUNT},not-an-address`;

    expect(() => demoPolicyConfig()).toThrow(
      /Invalid DEMO_POLICY_ACCOUNTS entry "not-an-address"/,
    );
  });
});

function holdingReader(input: {
  balance?: bigint;
  owner?: Address;
}): NftAuthorizationReader {
  return {
    async ownerOf() {
      return input.owner ?? owner.address;
    },
    async balanceOf() {
      return input.balance ?? 0n;
    },
    async isApprovedForAll() {
      return false;
    },
  };
}
