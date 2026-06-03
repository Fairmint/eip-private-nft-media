import { isAddressEqual, type Address } from "viem";

import type {
  DelegationVerifier,
  PrivateMediaResource,
  TokenStandard,
} from "./types.js";

export type DelegationRecord = {
  delegator: Address;
  delegate: Address;
  chainId: number;
  contract: Address;
  standard: TokenStandard;
  tokenId: string;
  allowedResourceUris: readonly [string, ...string[]];
  expiresAt: Date;
  revokedAt?: Date;
  revocationId: string;
};

export class InMemoryDelegationVerifier implements DelegationVerifier {
  private records = new Map<string, DelegationRecord>();

  add(record: DelegationRecord): void {
    this.records.set(record.revocationId, record);
  }

  revoke(revocationId: string, revokedAt = new Date()): void {
    const record = this.records.get(revocationId);
    if (record) {
      this.records.set(revocationId, {
        ...record,
        revokedAt,
      });
    }
  }

  async verifyDelegation(input: {
    delegate: Address;
    delegator: Address;
    resource: PrivateMediaResource;
    now: Date;
  }): Promise<boolean> {
    for (const record of this.records.values()) {
      if (delegationMatches(record, input)) return true;
    }

    return false;
  }
}

function delegationMatches(
  record: DelegationRecord,
  input: {
    delegate: Address;
    delegator: Address;
    resource: PrivateMediaResource;
    now: Date;
  },
): boolean {
  if (record.revokedAt && record.revokedAt.getTime() <= input.now.getTime())
    return false;
  if (record.expiresAt.getTime() <= input.now.getTime()) return false;
  if (!isAddressEqual(record.delegate, input.delegate)) return false;
  if (!isAddressEqual(record.delegator, input.delegator)) return false;
  if (record.chainId !== input.resource.chainId) return false;
  if (record.standard !== input.resource.standard) return false;
  if (!isAddressEqual(record.contract, input.resource.contract)) return false;
  if (record.tokenId !== input.resource.tokenId) return false;

  return resourceUriAllowed(record, input.resource.privateMediaUri);
}

function resourceUriAllowed(
  record: DelegationRecord,
  privateMediaUri: string,
): boolean {
  return record.allowedResourceUris.includes(privateMediaUri);
}
