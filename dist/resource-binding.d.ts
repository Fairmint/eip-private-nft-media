import { type Address } from "viem";
import type { ParsedPrivateMediaResource, PolicyPrivateMediaResource, PrivateMediaResource, TokenPrivateMediaResource, TokenStandard } from "./types.js";
/**
 * Builds the expected token-form binding for a private media URI + account.
 * `gating` identifies the gating token and MAY differ from the advertised token
 * whose metadata exposed `privateMediaUri`. `minAmount` is required for
 * `erc1155` and `erc20` gating tokens and forbidden for `erc721`.
 */
export declare function expectedTokenBinding(input: {
    privateMediaUri: string;
    account: Address;
    gating: {
        chainId: number;
        standard: TokenStandard;
        contract: Address;
        tokenId?: string;
        minAmount?: string;
    };
}): TokenPrivateMediaResource;
/**
 * Builds the expected policy-form binding for a private media URI + account.
 * `chainId` is the SIWE chain-id the server selected for this challenge.
 */
export declare function expectedPolicyBinding(input: {
    privateMediaUri: string;
    account: Address;
    policyId: string;
    chainId: number;
}): PolicyPrivateMediaResource;
export declare function createPrivateMediaResourceBinding(resource: PrivateMediaResource): string;
export declare function parsePrivateMediaResourceBinding(binding: string): ParsedPrivateMediaResource | null;
export declare function resourceBindingMatches(binding: string, expected: PrivateMediaResource): boolean;
/**
 * ERC-8291 requires exactly one SIWE `resources` entry matching the expected binding.
 */
export declare function resourcesMatchExpectedBinding(resources: readonly string[] | undefined, expected: PrivateMediaResource): boolean;
export declare function challengeNonceScope(resource: PrivateMediaResource): string;
export declare function assertHttpsPrivateMediaUri(privateMediaUri: string): void;
export declare function isTokenPrivateMediaResource(resource: PrivateMediaResource): resource is TokenPrivateMediaResource;
export declare function isPolicyPrivateMediaResource(resource: PrivateMediaResource): resource is PolicyPrivateMediaResource;
/**
 * Percent-encode so all RFC 3986 reserved characters are encoded.
 * `encodeURIComponent` alone leaves `!'()*` unescaped.
 */
export declare function encodeRfc3986Component(value: string): string;
//# sourceMappingURL=resource-binding.d.ts.map