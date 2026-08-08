import { Window } from "happy-dom";
import { describe, expect, it, vi } from "vitest";
import { CAPTURE_STABILITY_MS } from "../constants";
import {
  extractRawMessages,
  roleFromElement,
  selectCompletedCandidates,
} from "./adapter";
import type { StabilityTracker } from "./completion";
import { GENERATED_IMAGE_TEXT, IMAGE_ATTACHMENT_TEXT } from "./completion";
import {
  FIXTURE_ASSISTANT_DATA_TURN_CAPTION_IMAGE,
  FIXTURE_ASSISTANT_DATA_TURN_IMAGE_NO_ROLE,
  FIXTURE_ASSISTANT_DATA_TURN_IMAGE_STREAMING,
  FIXTURE_ASSISTANT_SCREENSHOT_CONTENT_ONLY,
  FIXTURE_COMPLETED_FOUR_TURNS,
  FIXTURE_TOOL_CARD_SKIPPED,
  FIXTURE_TOOL_ONLY_TEXT,
  FIXTURE_USER_UPLOAD_SECTION_DATA_TURN_SIBLING,
} from "./fixtures";
import { turnHasImageAttachment } from "./images";
import {
  createChatgptObserver,
  type CaptureArtifactPayload,
  type CaptureEnqueuePayload,
  type EnqueueSendResult,
} from "./observe";

function loadFixture(html: string): Document {
  const window = new Window({ url: "https://chatgpt.com/c/conv-root" });
  window.document.body.innerHTML = html;
  return window.document as unknown as Document;
}

function pngResponse(): Response {
  const bytes = new Uint8Array(256);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  return new Response(new Blob([bytes]), {
    status: 200,
    headers: { "content-type": "image/png" },
  });
}

function observerTimers() {
  return {
    setTimeout: ((fn: () => void) => {
      fn();
      return 0;
    }) as unknown as typeof setTimeout,
    clearTimeout: () => undefined,
    setInterval: (() => 0) as unknown as typeof setInterval,
    clearInterval: () => undefined,
  };
}

describe("message-root / role resolution for generated images", () => {
  it("extracts assistant section[data-turn] + image with no author-role", () => {
    const document = loadFixture(FIXTURE_ASSISTANT_DATA_TURN_IMAGE_NO_ROLE);
    const raw = extractRawMessages(document);
    expect(raw).toHaveLength(1);
    expect(raw[0]!.speaker).toBe("assistant");
    expect(raw[0]!.element?.tagName).toBe("SECTION");
    expect(raw[0]!.element?.getAttribute("data-turn")).toBe("assistant");
    expect(raw[0]!.element?.hasAttribute("data-message-author-role")).toBe(
      false,
    );
    expect(turnHasImageAttachment(raw[0]!.element!)).toBe(true);

    const tracker: StabilityTracker = new Map();
    selectCompletedCandidates(raw, tracker, 0, CAPTURE_STABILITY_MS);
    const done = selectCompletedCandidates(
      raw,
      tracker,
      CAPTURE_STABILITY_MS,
      CAPTURE_STABILITY_MS,
    );
    expect(done).toHaveLength(1);
    expect(done[0]!.text).toBe(GENERATED_IMAGE_TEXT);
    expect(done[0]!.element?.tagName).toBe("SECTION");
  });

  it("prefers nested author-role when caption exists on data-turn section", () => {
    const document = loadFixture(FIXTURE_ASSISTANT_DATA_TURN_CAPTION_IMAGE);
    const raw = extractRawMessages(document);
    expect(raw).toHaveLength(1);
    expect(raw[0]!.speaker).toBe("assistant");
    expect(raw[0]!.sourceProvidedId).toBe("msg-data-turn-cap");
    expect(raw[0]!.text).toBe("Here is your duck");
    expect(raw[0]!.element?.getAttribute("data-message-author-role")).toBe(
      "assistant",
    );
    expect(turnHasImageAttachment(raw[0]!.element!)).toBe(true);
  });

  it("accepts standalone screenshot-content hosted image as assistant", () => {
    const document = loadFixture(FIXTURE_ASSISTANT_SCREENSHOT_CONTENT_ONLY);
    const host = document.querySelector(
      "[data-conversation-screenshot-content]",
    );
    expect(host).toBeTruthy();
    expect(roleFromElement(host!)).toBe("assistant");

    const raw = extractRawMessages(document);
    expect(raw).toHaveLength(1);
    expect(raw[0]!.speaker).toBe("assistant");
    expect(raw[0]!.element?.hasAttribute("data-conversation-screenshot-content")).toBe(
      true,
    );
  });

  it("associates screenshot-content with enclosing data-turn root", () => {
    const document = loadFixture(FIXTURE_ASSISTANT_DATA_TURN_IMAGE_NO_ROLE);
    const raw = extractRawMessages(document);
    expect(raw).toHaveLength(1);
    expect(raw[0]!.element?.tagName).toBe("SECTION");
    expect(
      raw[0]!.element?.querySelector("[data-conversation-screenshot-content]"),
    ).toBeTruthy();
  });

  it("leaves user-upload section[data-turn] capture unchanged", () => {
    const document = loadFixture(FIXTURE_USER_UPLOAD_SECTION_DATA_TURN_SIBLING);
    const raw = extractRawMessages(document);
    expect(raw).toHaveLength(1);
    expect(raw[0]!.speaker).toBe("user");
    expect(turnHasImageAttachment(raw[0]!.element!)).toBe(true);
    const tracker: StabilityTracker = new Map();
    const done = selectCompletedCandidates(
      raw,
      tracker,
      Date.now(),
      CAPTURE_STABILITY_MS,
    );
    expect(done[0]!.text).toBe(IMAGE_ATTACHMENT_TEXT);
  });

  it("leaves ordinary assistant text unchanged", () => {
    const document = loadFixture(FIXTURE_COMPLETED_FOUR_TURNS);
    const raw = extractRawMessages(document);
    const assistants = raw.filter((m) => m.speaker === "assistant");
    expect(assistants.length).toBe(2);
    for (const a of assistants) {
      expect(a.text.length).toBeGreaterThan(0);
      expect(a.text).not.toBe(GENERATED_IMAGE_TEXT);
    }
  });

  it("excludes tool-only text cards", () => {
    const document = loadFixture(FIXTURE_TOOL_ONLY_TEXT);
    const raw = extractRawMessages(document);
    expect(raw.every((m) => m.speaker !== "assistant" || m.text !== "tool output text only")).toBe(
      true,
    );
    expect(raw.filter((m) => m.speaker === "user")).toHaveLength(1);
    expect(
      raw.some((m) => m.sourceProvidedId === "msg-tool-only"),
    ).toBe(false);

    const skipped = loadFixture(FIXTURE_TOOL_CARD_SKIPPED);
    const msgs = extractRawMessages(skipped);
    expect(msgs.map((m) => m.speaker)).toEqual(["user", "assistant"]);
    expect(msgs.some((m) => m.sourceProvidedId === "msg-tool")).toBe(false);
  });

  it("does not complete streaming data-turn assistant image early", () => {
    const document = loadFixture(FIXTURE_ASSISTANT_DATA_TURN_IMAGE_STREAMING);
    const raw = extractRawMessages(document);
    expect(raw).toHaveLength(1);
    expect(raw[0]!.flags.hasStreamingMarker).toBe(true);
    const tracker: StabilityTracker = new Map();
    const done = selectCompletedCandidates(
      raw,
      tracker,
      10_000,
      CAPTURE_STABILITY_MS,
    );
    expect(done).toHaveLength(0);
  });
});

describe("data-turn generated image artifact identity", () => {
  it("artifact client_turn_id equals assistant turn source_key", async () => {
    const window = new Window({ url: "https://chatgpt.com/c/conv-dt" });
    window.document.body.innerHTML = FIXTURE_ASSISTANT_DATA_TURN_IMAGE_NO_ROLE;

    const turns: CaptureEnqueuePayload[] = [];
    const artifacts: CaptureArtifactPayload[] = [];
    let now = 0;

    const observer = createChatgptObserver({
      document: window.document as unknown as Document,
      getHref: () => "https://chatgpt.com/c/conv-dt",
      isCaptureEnabled: () => true,
      sendEnqueue: async (p): Promise<EnqueueSendResult> => {
        turns.push(p);
        return { client_turn_id: p.source_key };
      },
      sendArtifactEnqueue: async (p) => {
        artifacts.push(p);
        return { ok: true, status: "accepted" };
      },
      fetchFn: vi.fn(async () => pngResponse()) as unknown as typeof fetch,
      now: () => now,
      ...observerTimers(),
    });

    await observer.rescan();
    now = CAPTURE_STABILITY_MS;
    await observer.rescan();

    const asst = turns.find((t) => t.speaker === "assistant");
    expect(asst).toBeDefined();
    expect(asst!.text).toBe(GENERATED_IMAGE_TEXT);
    expect(artifacts.length).toBeGreaterThanOrEqual(1);
    for (const art of artifacts) {
      expect(art.direction).toBe("assistant_generated");
      expect(art.client_turn_id).toBe(asst!.source_key);
      expect(art.source_key).toBe("file_data_turn_norole");
    }
  });

  it("rescan remains idempotent for data-turn generated image", async () => {
    const window = new Window({ url: "https://chatgpt.com/c/conv-dt-idem" });
    window.document.body.innerHTML = FIXTURE_ASSISTANT_DATA_TURN_IMAGE_NO_ROLE;

    const turns: CaptureEnqueuePayload[] = [];
    const artifacts: CaptureArtifactPayload[] = [];
    let now = 0;

    const observer = createChatgptObserver({
      document: window.document as unknown as Document,
      getHref: () => "https://chatgpt.com/c/conv-dt-idem",
      isCaptureEnabled: () => true,
      sendEnqueue: async (p): Promise<EnqueueSendResult> => {
        turns.push(p);
        return { client_turn_id: p.source_key };
      },
      sendArtifactEnqueue: async (p) => {
        artifacts.push(p);
        return { ok: true, status: "accepted" };
      },
      fetchFn: vi.fn(async () => pngResponse()) as unknown as typeof fetch,
      now: () => now,
      ...observerTimers(),
    });

    await observer.rescan();
    now = CAPTURE_STABILITY_MS;
    await observer.rescan();
    const key = artifacts[0]?.client_turn_id;
    expect(key).toBeTruthy();

    await observer.rescan();
    await observer.rescan();
    expect(new Set(artifacts.map((a) => a.client_turn_id))).toEqual(
      new Set([key]),
    );
    expect(
      turns.filter((t) => t.speaker === "assistant").every(
        (t) => t.source_key === key,
      ),
    ).toBe(true);
  });
});
