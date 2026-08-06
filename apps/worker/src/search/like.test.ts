import { describe, expect, it } from "vitest";
import { escapeLikeLiteral, likeContainsPattern } from "./like";

describe("escapeLikeLiteral", () => {
  it("escapes %, _, and backslash", () => {
    expect(escapeLikeLiteral("a%b_c\\d")).toBe("a\\%b\\_c\\\\d");
  });

  it("builds contains pattern with escapes", () => {
    expect(likeContainsPattern("100%_done")).toBe("%100\\%\\_done%");
  });
});
