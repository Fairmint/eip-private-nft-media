// Buffer-free base64url so the library works with browser Buffer polyfills
// that lack the "base64url" encoding (e.g. buffer@5.7.1) and in runtimes
// without Buffer. Uses only TextEncoder/TextDecoder and btoa/atob.
const CHUNK_SIZE = 0x8000;
export function bytesToBase64Url(bytes) {
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK_SIZE));
    }
    return btoa(binary)
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replace(/=+$/u, "");
}
export function base64UrlToBytes(value) {
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}
export function encodeBase64Url(value) {
    return bytesToBase64Url(new TextEncoder().encode(value));
}
export function decodeBase64Url(value) {
    return new TextDecoder().decode(base64UrlToBytes(value));
}
//# sourceMappingURL=base64url.js.map