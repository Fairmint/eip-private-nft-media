import { Buffer as BufferPolyfill } from "buffer/";
import { afterEach, describe, expect, it } from "vitest";

import { decodeBase64Url, encodeBase64Url } from "../src/base64url.js";
import {
  encodeAuthorizationProof,
  parseAuthorizationHeader,
} from "../src/index.js";
import { encodeAuthorizationProof as clientEncode } from "../src/client.js";

const nodeEncode = (value: string): string =>
  Buffer.from(value, "utf8").toString("base64url");

const samples: Record<string, string> = {
  empty: "",
  ascii: "example.com wants you to sign in with your Ethereum account:",
  one: "a",
  two: "ab",
  three: "abc",
  multibyte: "héllo wörld ✓ 日本語 🎨 \u0000 ￿",
  newlines: "line1\nline2\r\nline3",
  long: "Ünïcode 🎨 message. ".repeat(20_000),
  allBytesLike: Array.from({ length: 512 }, (_, i) =>
    String.fromCharCode(i),
  ).join(""),
};

describe("base64url", () => {
  for (const [name, value] of Object.entries(samples)) {
    it(`matches Node Buffer base64url: ${name}`, () => {
      const encoded = encodeBase64Url(value);
      expect(encoded).toBe(nodeEncode(value));
      expect(encoded).not.toMatch(/[+/=]/u);
      expect(decodeBase64Url(encoded)).toBe(value);
      expect(decodeBase64Url(nodeEncode(value))).toBe(value);
    });
  }

  it("round-trips pseudo-random strings identically to Buffer", () => {
    let seed = 12345;
    const next = (): number => {
      seed = (seed * 1664525 + 1013904223) % 2 ** 32;
      return seed;
    };
    for (let i = 0; i < 200; i += 1) {
      const length = next() % 300;
      let value = "";
      for (let j = 0; j < length; j += 1) {
        const choice = next() % 4;
        value +=
          choice === 0
            ? String.fromCharCode(32 + (next() % 95))
            : choice === 1
              ? String.fromCharCode(0xa0 + (next() % 0x700))
              : choice === 2
                ? String.fromCharCode(0x4e00 + (next() % 0x1000))
                : String.fromCodePoint(0x1f300 + (next() % 0x200));
      }
      expect(encodeBase64Url(value)).toBe(nodeEncode(value));
      expect(decodeBase64Url(nodeEncode(value))).toBe(value);
    }
  });
});

describe("proof compatibility with the previous Buffer encoder", () => {
  const proof = {
    message: "media.example.com wants you to sign in — ✓ 日本語 🎨\nNonce: abc",
    signature: `0x${"ab".repeat(65)}`,
  } as const;

  it("produces the same header as the old Buffer-based encoder", () => {
    const old = `SIWE ${Buffer.from(JSON.stringify(proof), "utf8").toString("base64url")}`;
    expect(encodeAuthorizationProof(proof)).toBe(old);
    expect(clientEncode(proof)).toBe(old);
  });

  it("parses a header produced by the old encoder", () => {
    const old = `SIWE ${Buffer.from(JSON.stringify(proof), "utf8").toString("base64url")}`;
    expect(parseAuthorizationHeader(old)).toEqual(proof);
  });
});

describe("without a usable Buffer", () => {
  const original = globalThis.Buffer;
  afterEach(() => {
    globalThis.Buffer = original;
  });

  const proof = {
    message: "héllo ✓ 🎨",
    signature: `0x${"cd".repeat(65)}`,
  } as const;

  it("works with the buffer@5.7.1 polyfill installed", () => {
    const expected = `SIWE ${original.from(JSON.stringify(proof), "utf8").toString("base64url")}`;
    globalThis.Buffer = BufferPolyfill as unknown as typeof Buffer;
    expect(() => BufferPolyfill.from("a").toString("base64url")).toThrow();
    expect(clientEncode(proof)).toBe(expected);
    expect(parseAuthorizationHeader(expected)).toEqual(proof);
  });

  it("works with Buffer removed entirely", () => {
    const expected = `SIWE ${original.from(JSON.stringify(proof), "utf8").toString("base64url")}`;
    // @ts-expect-error simulate a runtime with no Buffer
    delete globalThis.Buffer;
    expect(typeof globalThis.Buffer).toBe("undefined");
    expect(clientEncode(proof)).toBe(expected);
    expect(parseAuthorizationHeader(expected)).toEqual(proof);
  });
});
