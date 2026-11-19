import { AuthorizationError } from "./types.js";
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
function encodeBase64Url(value) {
    if (typeof Buffer !== "undefined") {
        return Buffer.from(value, "utf8").toString("base64url");
    }
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    for (const byte of bytes)
        binary += String.fromCharCode(byte);
    return btoa(binary)
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replace(/=+$/u, "");
}
function decodeBase64Url(value) {
    if (typeof Buffer !== "undefined") {
        return Buffer.from(value, "base64url").toString("utf8");
    }
    const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
    const base64 = padded.replaceAll("-", "+").replaceAll("_", "/");
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return new TextDecoder().decode(bytes);
}
//# sourceMappingURL=authorization-header.js.map