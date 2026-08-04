import { Window } from "happy-dom";
import { beforeEach, describe, expect, it } from "vitest";
import {
  conversationIdFromUrl,
  extractRawMessages,
  selectCompletedCandidates,
} from "./adapter";
import type { StabilityTracker } from "./completion";
import {
  FIXTURE_ARTICLE_FALLBACK,
  FIXTURE_COMPLETED_FOUR_TURNS,
  FIXTURE_FALLBACK_NO_IDS,
  FIXTURE_STREAMING_ASSISTANT,
  FIXTURE_TOOL_CARD_SKIPPED,
} from "./fixtures";
import { assignSourceKeys, buildSyntheticSourceKey } from "./identity";
import { normalizePlainText } from "./normalize";
import { CAPTURE_STABILITY_MS } from "../constants";

function loadFixture(html: string): Document {
  const window = new Window({ url: "https://chatgpt.com/c/conv-abc" });
  window.document.body.innerHTML = html;
  return window.document as unknown as Document;
}

describe("normalizePlainText", () => {
  it("strips NBSP and collapses whitespace", () => {
    expect(normalizePlainText("  hello\u00a0\n\n\nworld  ")).toBe("hello\n\nworld");
  });
});

describe("conversationIdFromUrl", () => {
  it("extracts /c/<id>", () => {
    expect(conversationIdFromUrl("https://chatgpt.com/c/abc-123")).toBe("abc-123");
    expect(conversationIdFromUrl("https://chat.openai.com/c/xyz")).toBe("xyz");
    expect(conversationIdFromUrl("https://chatgpt.com/")).toBeNull();
  });
});

describe("extractRawMessages", () => {
  it("reads four completed turns with source ids", () => {
    const doc = loadFixture(FIXTURE_COMPLETED_FOUR_TURNS);
    const msgs = extractRawMessages(doc);
    expect(msgs).toHaveLength(4);
    expect(msgs.map((m) => m.speaker)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(msgs[0]?.sourceProvidedId).toBe("msg-user-1");
    expect(msgs[0]?.text).toContain("alpha");
    expect(msgs[1]?.text).toContain("beta");
  });

  it("marks streaming assistant incomplete via flags", () => {
    const doc = loadFixture(FIXTURE_STREAMING_ASSISTANT);
    const msgs = extractRawMessages(doc);
    const asst = msgs.find((m) => m.speaker === "assistant");
    expect(asst?.flags.hasStreamingMarker).toBe(true);
    expect(asst?.flags.hasStopAffordance).toBe(true);
  });

  it("uses article fallback without double-counting wrappers", () => {
    const doc = loadFixture(FIXTURE_ARTICLE_FALLBACK);
    const msgs = extractRawMessages(doc);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]?.text).toBe("Article user");
    expect(msgs[1]?.text).toBe("Article assistant");
  });

  it("skips tool role nodes", () => {
    const doc = loadFixture(FIXTURE_TOOL_CARD_SKIPPED);
    const msgs = extractRawMessages(doc);
    expect(msgs.map((m) => m.speaker)).toEqual(["user", "assistant"]);
    expect(msgs.some((m) => m.text.includes("tool output"))).toBe(false);
  });
});

describe("completion + stability", () => {
  it("requires 1s stability for assistant; user completes immediately", () => {
    const doc = loadFixture(FIXTURE_COMPLETED_FOUR_TURNS);
    const msgs = extractRawMessages(doc);
    const tracker: StabilityTracker = new Map();

    const t0 = selectCompletedCandidates(msgs, tracker, 0, CAPTURE_STABILITY_MS);
    expect(t0.filter((c) => c.speaker === "user")).toHaveLength(2);
    expect(t0.filter((c) => c.speaker === "assistant")).toHaveLength(0);

    const t1 = selectCompletedCandidates(
      msgs,
      tracker,
      CAPTURE_STABILITY_MS - 1,
      CAPTURE_STABILITY_MS,
    );
    expect(t1.filter((c) => c.speaker === "assistant")).toHaveLength(0);

    const t2 = selectCompletedCandidates(
      msgs,
      tracker,
      CAPTURE_STABILITY_MS,
      CAPTURE_STABILITY_MS,
    );
    expect(t2.filter((c) => c.speaker === "assistant")).toHaveLength(2);
  });

  it("does not complete streaming assistant even after 1s", () => {
    const doc = loadFixture(FIXTURE_STREAMING_ASSISTANT);
    const msgs = extractRawMessages(doc);
    const tracker: StabilityTracker = new Map();
    const done = selectCompletedCandidates(
      msgs,
      tracker,
      5_000,
      CAPTURE_STABILITY_MS,
    );
    expect(done.filter((c) => c.speaker === "assistant")).toHaveLength(0);
    expect(done.filter((c) => c.speaker === "user")).toHaveLength(1);
  });
});

describe("identity", () => {
  it("prefers source-provided ids", async () => {
    const keyed = await assignSourceKeys("conv-1", [
      { speaker: "user", text: "hi", sourceProvidedId: "msg-1" },
      { speaker: "assistant", text: "yo", sourceProvidedId: "msg-2" },
    ]);
    expect(keyed.map((k) => k.source_key)).toEqual(["msg-1", "msg-2"]);
  });

  it("uses occurrence index among same speaker+text (0-based)", async () => {
    const doc = loadFixture(FIXTURE_FALLBACK_NO_IDS);
    const msgs = extractRawMessages(doc);
    const tracker: StabilityTracker = new Map();
    selectCompletedCandidates(msgs, tracker, 0, CAPTURE_STABILITY_MS);
    const done = selectCompletedCandidates(
      msgs,
      tracker,
      CAPTURE_STABILITY_MS,
      CAPTURE_STABILITY_MS,
    );
    const keyed = await assignSourceKeys("conv-x", done);
    const userKeys = keyed
      .filter((k) => k.speaker === "user")
      .map((k) => k.source_key);
    expect(userKeys[0]).toBe("conv-x|user|Same text twice|0");
    expect(userKeys[1]).toBe("conv-x|user|Same text twice|1");
    expect(userKeys[0]).not.toBe(userKeys[1]);
  });

  it("hashes long text to stay within 128-char source_key bound", async () => {
    const long = "x".repeat(200);
    const key = await buildSyntheticSourceKey("conv-1", "user", long, 0);
    expect(key.length).toBeLessThanOrEqual(128);
    expect(key).toContain("h:");
    const again = await buildSyntheticSourceKey("conv-1", "user", long, 0);
    expect(again).toBe(key);
  });
});
