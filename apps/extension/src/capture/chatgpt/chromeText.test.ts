import { describe, expect, it } from "vitest";
import {
  isAssistantChromeOnlyText,
  stripAssistantChromeText,
} from "./chromeText";

describe("stripAssistantChromeText", () => {
  it("strips ChatGPT said: label leaving a real caption", () => {
    expect(stripAssistantChromeText("ChatGPT said:\nHere is a red apple")).toBe(
      "Here is a red apple",
    );
  });

  it("treats ChatGPT said: alone as empty", () => {
    expect(stripAssistantChromeText("ChatGPT said:")).toBe("");
    expect(stripAssistantChromeText("ChatGPT said:  ")).toBe("");
    expect(isAssistantChromeOnlyText("ChatGPT said:")).toBe(true);
  });

  it("strips Worked for Ns timing chrome", () => {
    expect(stripAssistantChromeText("ChatGPT said:Worked for 37s")).toBe("");
    expect(stripAssistantChromeText("Worked for 37s")).toBe("");
    expect(
      stripAssistantChromeText("ChatGPT said:\nWorked for 2 seconds"),
    ).toBe("");
  });

  it("keeps caption after removing timing chrome", () => {
    expect(
      stripAssistantChromeText(
        "ChatGPT said:\nWorked for 12s\nAn orange rubber duck",
      ),
    ).toBe("An orange rubber duck");
  });

  it("strips Thinking for Ns chrome", () => {
    expect(stripAssistantChromeText("Thinking for 3s")).toBe("");
  });
});
