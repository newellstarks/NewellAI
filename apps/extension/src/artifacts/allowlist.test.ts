import { describe, expect, it } from "vitest";
import { validateEstuaryContentUrl } from "./allowlist";

describe("estuary download allowlist", () => {
  it("accepts chatgpt.com estuary content URLs with id (signed params optional)", () => {
    const full =
      "https://chatgpt.com/backend-api/estuary/content?id=file_abc&ts=1&p=2&cid=3&sig=4&v=5";
    const min =
      "https://chatgpt.com/backend-api/estuary/content?id=file_abc";
    const trailing =
      "https://chatgpt.com/backend-api/estuary/content/?id=file_abc&ts=1";
    for (const raw of [full, min, trailing]) {
      const result = validateEstuaryContentUrl(raw);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.fileId).toBe("file_abc");
    }
  });

  it("rejects blob, other hosts, wrong path, missing id", () => {
    expect(validateEstuaryContentUrl("blob:https://chatgpt.com/x").ok).toBe(
      false,
    );
    expect(
      validateEstuaryContentUrl(
        "https://files.oaiusercontent.com/file?id=1&ts=1&p=2&cid=3&sig=4&v=5",
      ).ok,
    ).toBe(false);
    expect(
      validateEstuaryContentUrl(
        "https://chatgpt.com/backend-api/other?id=1&ts=1&p=2&cid=3&sig=4&v=5",
      ).ok,
    ).toBe(false);
    expect(
      validateEstuaryContentUrl(
        "https://chatgpt.com/backend-api/estuary/content?ts=1&p=2&cid=3&sig=4&v=5",
      ).ok,
    ).toBe(false);
  });
});
