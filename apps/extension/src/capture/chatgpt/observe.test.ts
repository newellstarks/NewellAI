import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import { CAPTURE_STABILITY_MS } from "../constants";
import {
  coalesceCandidates,
  createChatgptObserver,
  type CaptureEnqueuePayload,
} from "./observe";

const DUP_USERS = `
<main>
  <div data-message-author-role="user">
    <div class="whitespace-pre-wrap">Same text twice</div>
  </div>
  <div data-message-author-role="assistant">
    <div class="markdown"><p>Answer A</p></div>
  </div>
  <div data-message-author-role="user">
    <div class="whitespace-pre-wrap">Same text twice</div>
  </div>
  <div data-message-author-role="assistant">
    <div class="markdown"><p>Answer A</p></div>
  </div>
</main>
`;

describe("coalesceCandidates", () => {
  it("keeps missing-id duplicates and dedupes source ids", () => {
    const out = coalesceCandidates([
      { speaker: "user", text: "hi", sourceProvidedId: null },
      { speaker: "user", text: "hi", sourceProvidedId: null },
      { speaker: "assistant", text: "yo", sourceProvidedId: "a1" },
      { speaker: "assistant", text: "changed", sourceProvidedId: "a1" },
    ]);
    expect(out).toHaveLength(3);
    expect(out.filter((c) => c.speaker === "user")).toHaveLength(2);
    expect(out.filter((c) => c.sourceProvidedId === "a1")).toHaveLength(1);
    expect(out.find((c) => c.sourceProvidedId === "a1")?.text).toBe("yo");
  });
});

describe("observer buffer + flush path", () => {
  it("two identical user and assistant texts without source ids get distinct keys", async () => {
    const window = new Window({ url: "https://chatgpt.com/c/conv-obs" });
    window.document.body.innerHTML = DUP_USERS;
    const sent: CaptureEnqueuePayload[] = [];
    let now = 0;

    const observer = createChatgptObserver({
      document: window.document as unknown as Document,
      getHref: () => "https://chatgpt.com/c/conv-obs",
      isCaptureEnabled: () => true,
      sendEnqueue: (p) => {
        sent.push(p);
      },
      now: () => now,
      stabilityMs: CAPTURE_STABILITY_MS,
      // Disable automatic timers; drive rescans manually.
      setTimeout: ((fn: () => void) => {
        fn();
        return 0;
      }) as unknown as typeof setTimeout,
      clearTimeout: () => undefined,
      setInterval: (() => 0) as unknown as typeof setInterval,
      clearInterval: () => undefined,
    });

    await observer.rescan(); // prime stability (users may enqueue early)
    now = CAPTURE_STABILITY_MS;
    sent.length = 0;
    await observer.rescan();

    const userKeys = sent.filter((s) => s.speaker === "user").map((s) => s.source_key);
    const asstKeys = sent
      .filter((s) => s.speaker === "assistant")
      .map((s) => s.source_key);
    expect(userKeys).toEqual([
      "conv-obs|user|Same text twice|0",
      "conv-obs|user|Same text twice|1",
    ]);
    expect(asstKeys).toEqual([
      "conv-obs|assistant|Answer A|0",
      "conv-obs|assistant|Answer A|1",
    ]);
  });

  it("buffers before /c/<id> then flushes both duplicate turns", async () => {
    const window = new Window({ url: "https://chatgpt.com/" });
    window.document.body.innerHTML = `
<main>
  <div data-message-author-role="user">
    <div class="whitespace-pre-wrap">Repeat me</div>
  </div>
  <div data-message-author-role="user">
    <div class="whitespace-pre-wrap">Repeat me</div>
  </div>
</main>`;
    const sent: CaptureEnqueuePayload[] = [];
    let href = "https://chatgpt.com/";

    const observer = createChatgptObserver({
      document: window.document as unknown as Document,
      getHref: () => href,
      isCaptureEnabled: () => true,
      sendEnqueue: (p) => {
        sent.push(p);
      },
      now: () => CAPTURE_STABILITY_MS,
      setTimeout: ((fn: () => void) => {
        fn();
        return 0;
      }) as unknown as typeof setTimeout,
      clearTimeout: () => undefined,
      setInterval: (() => 0) as unknown as typeof setInterval,
      clearInterval: () => undefined,
    });

    await observer.rescan();
    expect(sent).toHaveLength(0);

    // Clear DOM so flush must come from the buffer, not a fresh extract.
    window.document.body.innerHTML = "<main></main>";
    href = "https://chatgpt.com/c/new-conv";
    await observer.rescan();
    expect(sent).toHaveLength(2);
    expect(sent.map((s) => s.source_key)).toEqual([
      "new-conv|user|Repeat me|0",
      "new-conv|user|Repeat me|1",
    ]);
  });

  it("rescan of the same DOM is idempotent at the send layer", async () => {
    const window = new Window({ url: "https://chatgpt.com/c/idem" });
    window.document.body.innerHTML = DUP_USERS;
    const sent: CaptureEnqueuePayload[] = [];
    let now = 0;
    const observer = createChatgptObserver({
      document: window.document as unknown as Document,
      getHref: () => "https://chatgpt.com/c/idem",
      isCaptureEnabled: () => true,
      sendEnqueue: (p) => {
        sent.push(p);
      },
      now: () => now,
      setTimeout: ((fn: () => void) => {
        fn();
        return 0;
      }) as unknown as typeof setTimeout,
      clearTimeout: () => undefined,
      setInterval: (() => 0) as unknown as typeof setInterval,
      clearInterval: () => undefined,
    });

    await observer.rescan();
    now = CAPTURE_STABILITY_MS;
    sent.length = 0;
    await observer.rescan();
    expect(sent).toHaveLength(4);

    await observer.rescan();
    // Observer re-sends; queue registry makes this already_known — keys stable.
    expect(sent).toHaveLength(8);
    const keys = sent.map((s) => s.source_key);
    expect(new Set(keys).size).toBe(4);
  });
});
