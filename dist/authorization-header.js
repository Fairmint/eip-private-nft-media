import { AuthorizationError } from "./types.js";
import { decodeBase64Url, encodeBase64Url } from "./base64url.js";
const SCHEME = "SIWE ";
export function encodeAuthorizationProof(proof) {
    const payload = encodeBase64Url(JSON.stringify(proof));
    return `${SCHEME}${payload}`;
}
export function parseAuthorizationHeader(header) {
    if (!header?.startsWith(SCHEME)) {
        throw new AuthorizationError("invalid_authorization_header", "authorization header must use the SIWE scheme");
    }
    try {
        const decoded = decodeBase64Url(header.slice(SCHEME.length));
        const parsed = JSON.parse(decoded);
        if (typeof parsed.message !== "string" ||
            typeof parsed.signature !== "string") {
            throw new Error("missing proof fields");
        }
        if (!parsed.signature.startsWith("0x")) {
            throw new Error("signature must be hex");
        }
        return {
            message: parsed.message,
            signature: parsed.signature,
        };
    }
    catch (error) {
        throw new AuthorizationError("invalid_authorization_header", error instanceof Error
            ? error.message
            : "invalid SIWE authorization payload");
    }
}
//# sourceMappingURL=authorization-header.js.map