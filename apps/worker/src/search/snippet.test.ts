import { describe, expect, it } from "vitest";
import { makeSnippet, SNIPPET_MAX_CHARS } from "./snippet";

describe("makeSnippet", () => {
  it("returns bounded excerpt around first match", () => {
    const text = `${"x".repeat(100)}FINDME${"y".repeat(100)}`;
    const snip = makeSnippet(text, "FINDME", 10);
    expect(snip.startsWith("…")).toBe(true);
    expect(snip.endsWith("…")).toBe(true);
    expect(snip).toContain("FINDME");
    expect(snip.length).toBeLessThan(text.length);
    expect(snip.length).toBeLessThanOrEqual(SNIPPET_MAX_CHARS + 1);
  });

  it("is case-insensitive for locating the match", () => {
    expect(makeSnippet("Hello World", "world")).toBe("Hello World");
  });
});
