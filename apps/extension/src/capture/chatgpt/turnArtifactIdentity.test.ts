import { Window } from "happy-dom";
import { describe, expect, it, vi } from "vitest";
import { CAPTURE_STABILITY_MS } from "../constants";
import {
  createChatgptObserver,
  type CaptureArtifactPayload,
  type CaptureEnqueuePayload,
  type EnqueueSendResult,
} from "./observe";

const ESTUARY =
  "https://chatgpt.com/backend-api/estuary/content?id=file_img1&ts=1&p=2&cid=3&sig=4&v=5";

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

describe("turn/artifact client_turn_id identity", () => {
  it("user-uploaded image uses the exact turn source_key as artifact client_turn_id", async () => {
    const window = new Window({ url: "https://chatgpt.com/c/conv-up" });
    window.document.body.innerHTML = `
<main>
  <article data-testid="conversation-turn-1">
    <div data-message-author-role="user" data-message-id="msg-user-1">
      <div class="whitespace-pre-wrap">See this</div>
      <img src="${ESTUARY}" />
    </div>
  </article>
</main>`;

    const turns: CaptureEnqueuePayload[] = [];
    const artifacts: CaptureArtifactPayload[] = [];
    let now = CAPTURE_STABILITY_MS;

    const observer = createChatgptObserver({
      document: window.document as unknown as Document,
      getHref: () => "https://chatgpt.com/c/conv-up",
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

    const userTurn = turns.find((t) => t.speaker === "user");
    expect(userTurn).toBeDefined();
    expect(userTurn!.source_key).toBe("msg-user-1");
    expect(artifacts.length).toBeGreaterThanOrEqual(1);
    for (const art of artifacts) {
      expect(art.direction).toBe("user_uploaded");
      expect(art.client_turn_id).toBe(userTurn!.source_key);
      expect(art.client_turn_id).toBe("msg-user-1");
    }
  });

  it("assistant-generated image uses the exact turn source_key as artifact client_turn_id", async () => {
    const window = new Window({ url: "https://chatgpt.com/c/conv-as" });
    window.document.body.innerHTML = `
<main>
  <article data-testid="conversation-turn-2">
    <div data-message-author-role="assistant" data-message-id="msg-asst-1">
      <div class="markdown"><p>Here is an image</p></div>
      <img src="${ESTUARY}" />
    </div>
  </article>
</main>`;

    const turns: CaptureEnqueuePayload[] = [];
    const artifacts: CaptureArtifactPayload[] = [];
    let now = 0;

    const observer = createChatgptObserver({
      document: window.document as unknown as Document,
      getHref: () => "https://chatgpt.com/c/conv-as",
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

    await observer.rescan(); // prime assistant stability clock
    now = CAPTURE_STABILITY_MS;
    await observer.rescan();

    const asst = turns.find((t) => t.speaker === "assistant");
    expect(asst).toBeDefined();
    expect(asst!.source_key).toBe("msg-asst-1");
    expect(artifacts.length).toBeGreaterThanOrEqual(1);
    for (const art of artifacts) {
      expect(art.direction).toBe("assistant_generated");
      expect(art.client_turn_id).toBe(asst!.source_key);
    }
  });

  it("image-only user turn shares the [image attachment] synthetic key", async () => {
    const window = new Window({ url: "https://chatgpt.com/c/conv-imgonly" });
    window.document.body.innerHTML = `
<main>
  <article data-testid="conversation-turn-3">
    <div data-message-author-role="user">
      <img src="${ESTUARY}" />
    </div>
  </article>
</main>`;

    const turns: CaptureEnqueuePayload[] = [];
    const artifacts: CaptureArtifactPayload[] = [];
    const now = CAPTURE_STABILITY_MS;

    const observer = createChatgptObserver({
      document: window.document as unknown as Document,
      getHref: () => "https://chatgpt.com/c/conv-imgonly",
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

    const uniqueTurnKeys = [...new Set(turns.map((t) => t.source_key))];
    expect(uniqueTurnKeys).toEqual([
      "conv-imgonly|user|[image attachment]|0",
    ]);
    expect(turns.every((t) => t.text === "[image attachment]")).toBe(true);
    expect(artifacts.length).toBeGreaterThanOrEqual(1);
    expect(artifacts[0]!.client_turn_id).toBe(uniqueTurnKeys[0]);
  });

  it("rescan is idempotent: same turn/artifact client_turn_id, no second identity", async () => {
    const window = new Window({ url: "https://chatgpt.com/c/conv-idem-img" });
    window.document.body.innerHTML = `
<main>
  <article data-testid="conversation-turn-4">
    <div data-message-author-role="user" data-message-id="msg-idem">
      <div class="whitespace-pre-wrap">Caption</div>
      <img src="${ESTUARY}" />
    </div>
  </article>
</main>`;

    const turns: CaptureEnqueuePayload[] = [];
    const artifacts: CaptureArtifactPayload[] = [];
    const now = CAPTURE_STABILITY_MS;

    const observer = createChatgptObserver({
      document: window.document as unknown as Document,
      getHref: () => "https://chatgpt.com/c/conv-idem-img",
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
    const firstArtCount = artifacts.length;
    expect(firstArtCount).toBeGreaterThanOrEqual(1);
    const firstId = artifacts[0]!.client_turn_id;
    expect(firstId).toBe("msg-idem");
    expect(turns.every((t) => t.source_key === firstId)).toBe(true);

    await observer.rescan();
    // Artifact success ack prevents re-fetch; identity key stays singular.
    expect(artifacts).toHaveLength(firstArtCount);
    expect(new Set(artifacts.map((a) => a.client_turn_id))).toEqual(
      new Set([firstId]),
    );
    expect(new Set(turns.map((t) => t.source_key))).toEqual(new Set([firstId]));
  });

  it("does not invent a solo-role synthetic key that differs from turn occurrence keys", async () => {
    const window = new Window({ url: "https://chatgpt.com/c/conv-dup" });
    window.document.body.innerHTML = `
<main>
  <article data-testid="conversation-turn-5">
    <div data-message-author-role="user">
      <img src="https://chatgpt.com/backend-api/estuary/content?id=file_a&ts=1&p=2&cid=3&sig=4&v=5" />
    </div>
  </article>
  <article data-testid="conversation-turn-6">
    <div data-message-author-role="user">
      <img src="https://chatgpt.com/backend-api/estuary/content?id=file_b&ts=1&p=2&cid=3&sig=4&v=5" />
    </div>
  </article>
</main>`;

    const turns: CaptureEnqueuePayload[] = [];
    const artifacts: CaptureArtifactPayload[] = [];
    const now = CAPTURE_STABILITY_MS;

    const observer = createChatgptObserver({
      document: window.document as unknown as Document,
      getHref: () => "https://chatgpt.com/c/conv-dup",
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

    const userKeys = [
      ...new Set(
        turns.filter((t) => t.speaker === "user").map((t) => t.source_key),
      ),
    ];
    expect(userKeys).toEqual([
      "conv-dup|user|[image attachment]|0",
      "conv-dup|user|[image attachment]|1",
    ]);
    const artKeys = [...new Set(artifacts.map((a) => a.client_turn_id))].sort();
    expect(artKeys).toEqual([...userKeys].sort());
    expect(artKeys).toHaveLength(2);
  });
});
