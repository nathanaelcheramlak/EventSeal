import { describe, expect, it } from "vitest";
import { signQrToken, verifyQrToken } from "./qr-token.js";

describe("QR token signing", () => {
  const secret = "test-secret-with-at-least-32-characters";
  const payload = {
    id: "2ef47ea7-8280-4d48-bbde-40c98b138a19",
    exp: 2_000_000_000
  };

  it("round-trips a signed payload", () => {
    const token = signQrToken(payload, secret);
    expect(verifyQrToken(token, secret)).toEqual(payload);
  });

  it("rejects modified tokens", () => {
    const token = signQrToken(payload, secret);
    const modified = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
    expect(() => verifyQrToken(modified, secret)).toThrow();
  });
});
