import { describe, expect, it } from "vitest";
import { parseBearerToken } from "./auth";

describe("parseBearerToken", () => {
  it("accepts Bearer with normal spacing", () => {
    expect(parseBearerToken("Bearer secret")).toBe("secret");
  });

  it("AUTH-11: scheme is case-insensitive", () => {
    expect(parseBearerToken("bearer secret")).toBe("secret");
    expect(parseBearerToken("BEARER secret")).toBe("secret");
    expect(parseBearerToken("BeArEr secret")).toBe("secret");
  });

  it("AUTH-12: allows extra spaces after scheme and trims header edges", () => {
    expect(parseBearerToken("Bearer    secret")).toBe("secret");
    expect(parseBearerToken("  Bearer secret  ")).toBe("secret");
    expect(parseBearerToken("Bearer secret\t")).toBe("secret");
  });

  it("AUTH-13: rejects empty token", () => {
    expect(parseBearerToken("Bearer")).toBeNull();
    expect(parseBearerToken("Bearer ")).toBeNull();
    expect(parseBearerToken("Bearer   ")).toBeNull();
    expect(parseBearerToken("bearer\t")).toBeNull();
  });

  it("AUTH-14: rejects unsupported schemes", () => {
    expect(parseBearerToken("Basic dXNlcjpwYXNz")).toBeNull();
    expect(parseBearerToken("Token secret")).toBeNull();
    expect(parseBearerToken("Digest secret")).toBeNull();
  });

  it("AUTH-15: rejects combined / multi-value Authorization", () => {
    expect(parseBearerToken("Bearer a, Bearer b")).toBeNull();
    expect(parseBearerToken("Bearer secret,")).toBeNull();
  });

  it("does not normalize the token beyond format trimming", () => {
    expect(parseBearerToken("Bearer  SeCrEt-Value_1")).toBe("SeCrEt-Value_1");
  });
});
