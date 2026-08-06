import { Window } from "happy-dom";
import { describe, expect, it, vi } from "vitest";
import { CAPTURE_STABILITY_MS } from "../constants";
import {
  extractRawMessages,
  selectCompletedCandidates,
} from "./adapter";
import type { StabilityTracker } from "./completion";
import { IMAGE_ATTACHMENT_TEXT } from "./completion";
import {
  FIXTURE_ASSISTANT_IMAGE_ONLY,
  FIXTURE_ASSISTANT_IMAGE_STREAMING,
  FIXTURE_ASSISTANT_TEXT_AND_IMAGE,
  FIXTURE_COMPLETED_FOUR_TURNS,
  FIXTURE_USER_UPLOAD_IMAGE_SIBLING,
} from "./fixtures";
import {
  createChatgptObserver,
  type CaptureArtifactPayload,
  type CaptureEnqueuePayload,
  type EnqueueSendResult,
} from "./observe";

function loadFixture(html: string): Document {
  const window = new Window({ url: "https://chatgpt.com/c/conv-fixture" });
  window.document.body.innerHTML = html;
  return window.document as unknown as Document;
}

function pngResponse(): Response {
  const bytes = new Uint8Array(256);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  return new Response(bytes, {
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

describe("assistant image-only completion", () => {
  it("does not complete empty assistant image turn before stability", () => {
    const document = loadFixture(FIXTURE_ASSISTANT_IMAGE_ONLY);
    const raw = extractRawMessages(document);
    expect(raw).toHaveLength(1);
    expect(raw[0]!.speaker).toBe("assistant");
    expect(raw[0]!.text).toBe("");
    const tracker: StabilityTracker = new Map();
    const early = selectCompletedCandidates(raw, tracker, 0, CAPTURE_STABILITY_MS);
    expect(early.filter((c) => c.speaker === "assistant")).toHaveLength(0);
  });

  it("completes assistant image-only turn after stability with marker text", () => {
    const document = loadFixture(FIXTURE_ASSISTANT_IMAGE_ONLY);
    const raw = extractRawMessages(document);
    const tracker: StabilityTracker = new Map();
    selectCompletedCandidates(raw, tracker, 0, CAPTURE_STABILITY_MS);
    const done = selectCompletedCandidates(
      raw,
      tracker,
      CAPTURE_STABILITY_MS,
      CAPTURE_STABILITY_MS,
    );
    expect(done).toHaveLength(1);
    expect(done[0]!.speaker).toBe("assistant");
    expect(done[0]!.text).toBe(IMAGE_ATTACHMENT_TEXT);
    expect(done[0]!.sourceProvidedId).toBe("msg-asst-img-only");
  });

  it("completes assistant text + image on caption text after stability", () => {
    const document = loadFixture(FIXTURE_ASSISTANT_TEXT_AND_IMAGE);
    const raw = extractRawMessages(document);
    expect(raw[0]!.text).toBe("Here is your duck");
    const tracker: StabilityTracker = new Map();
    selectCompletedCandidates(raw, tracker, 0, CAPTURE_STABILITY_MS);
    const done = selectCompletedCandidates(
      raw,
      tracker,
      CAPTURE_STABILITY_MS,
      CAPTURE_STABILITY_MS,
    );
    expect(done).toHaveLength(1);
    expect(done[0]!.text).toBe("Here is your duck");
    expect(done[0]!.text).not.toBe(IMAGE_ATTACHMENT_TEXT);
  });

  it("does not complete streaming assistant image turn early", () => {
    const document = loadFixture(FIXTURE_ASSISTANT_IMAGE_STREAMING);
    const raw = extractRawMessages(document);
    expect(raw[0]!.flags.hasStreamingMarker).toBe(true);
    const tracker: StabilityTracker = new Map();
    const done = selectCompletedCandidates(
      raw,
      tracker,
      10_000,
      CAPTURE_STABILITY_MS,
    );
    expect(done.filter((c) => c.speaker === "assistant")).toHaveLength(0);
  });

  it("leaves normal text-assistant completion unchanged", () => {
    const document = loadFixture(FIXTURE_COMPLETED_FOUR_TURNS);
    const raw = extractRawMessages(document);
    const tracker: StabilityTracker = new Map();
    selectCompletedCandidates(raw, tracker, 0, CAPTURE_STABILITY_MS);
    const done = selectCompletedCandidates(
      raw,
      tracker,
      CAPTURE_STABILITY_MS,
      CAPTURE_STABILITY_MS,
    );
    const assistants = done.filter((c) => c.speaker === "assistant");
    expect(assistants.length).toBeGreaterThanOrEqual(1);
    for (const a of assistants) {
      expect(a.text.length).toBeGreaterThan(0);
      expect(a.text).not.toBe(IMAGE_ATTACHMENT_TEXT);
    }
  });

  it("leaves user-upload image-only path unchanged", () => {
    const document = loadFixture(FIXTURE_USER_UPLOAD_IMAGE_SIBLING);
    const raw = extractRawMessages(document);
    const tracker: StabilityTracker = new Map();
    const completed = selectCompletedCandidates(
      raw,
      tracker,
      Date.now(),
      CAPTURE_STABILITY_MS,
    );
    expect(completed).toHaveLength(1);
    expect(completed[0]!.speaker).toBe("user");
    expect(completed[0]!.text).toBe(IMAGE_ATTACHMENT_TEXT);
  });
});

describe("assistant generated image artifact identity", () => {
  it("uses exact assistant client_turn_id for generated image artifact", async () => {
    const window = new Window({ url: "https://chatgpt.com/c/conv-asst-img" });
    window.document.body.innerHTML = FIXTURE_ASSISTANT_IMAGE_ONLY;

    const turns: CaptureEnqueuePayload[] = [];
    const artifacts: CaptureArtifactPayload[] = [];
    let now = 0;

    const observer = createChatgptObserver({
      document: window.document as unknown as Document,
      getHref: () => "https://chatgpt.com/c/conv-asst-img",
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
    expect(asst!.text).toBe(IMAGE_ATTACHMENT_TEXT);
    expect(asst!.source_key).toBe("msg-asst-img-only");
    expect(artifacts.length).toBeGreaterThanOrEqual(1);
    for (const art of artifacts) {
      expect(art.direction).toBe("assistant_generated");
      expect(art.client_turn_id).toBe(asst!.source_key);
      expect(art.client_turn_id).toBe("msg-asst-img-only");
      expect(art.source_key).toBe("file_asst_only");
    }
  });

  it("rescan/idempotency preserves assistant artifact identity", async () => {
    const window = new Window({ url: "https://chatgpt.com/c/conv-asst-idem" });
    window.document.body.innerHTML = FIXTURE_ASSISTANT_IMAGE_ONLY;

    const turns: CaptureEnqueuePayload[] = [];
    const artifacts: CaptureArtifactPayload[] = [];
    let now = 0;

    const observer = createChatgptObserver({
      document: window.document as unknown as Document,
      getHref: () => "https://chatgpt.com/c/conv-asst-idem",
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
    const firstKeys = artifacts.map((a) => a.client_turn_id);
    expect(firstKeys.length).toBeGreaterThanOrEqual(1);

    await observer.rescan();
    await observer.rescan();
    // Successful enqueue marks attempt done — no duplicate client_turn_id drift.
    const unique = new Set(artifacts.map((a) => a.client_turn_id));
    expect([...unique]).toEqual(["msg-asst-img-only"]);
    expect(
      turns.filter((t) => t.speaker === "assistant").every(
        (t) => t.source_key === "msg-asst-img-only",
      ),
    ).toBe(true);
    expect(artifacts.every((a) => a.source_key === "file_asst_only")).toBe(
      true,
    );
  });

  it("assistant text+image artifact uses caption turn identity", async () => {
    const window = new Window({ url: "https://chatgpt.com/c/conv-asst-cap" });
    window.document.body.innerHTML = FIXTURE_ASSISTANT_TEXT_AND_IMAGE;

    const turns: CaptureEnqueuePayload[] = [];
    const artifacts: CaptureArtifactPayload[] = [];
    let now = 0;

    const observer = createChatgptObserver({
      document: window.document as unknown as Document,
      getHref: () => "https://chatgpt.com/c/conv-asst-cap",
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
    expect(asst?.text).toBe("Here is your duck");
    expect(asst?.source_key).toBe("msg-asst-text-img");
    expect(artifacts[0]?.client_turn_id).toBe("msg-asst-text-img");
    expect(artifacts[0]?.direction).toBe("assistant_generated");
  });
});
