import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { Window } from "happy-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { CAPTURE_STABILITY_MS } from "./constants";
import {
  extractRawMessages,
  selectCompletedCandidates,
} from "./chatgpt/adapter";
import { FIXTURE_COMPLETED_FOUR_TURNS } from "./chatgpt/fixtures";
import { assignSourceKeys } from "./chatgpt/identity";
import type { StabilityTracker } from "./chatgpt/completion";
import {
  createChatgptObserver,
  type CaptureEnqueuePayload,
} from "./chatgpt/observe";
import { getAllFromStore, openQueueDb, STORES } from "../queue/db";
import { enqueue } from "../queue/queue";
import type { EnqueueInput, QueueEnvelope } from "../queue/types";
import {
  CAPTURE_CLIENT,
  CAPTURE_CLIENT_VERSION,
  CAPTURE_SURFACE,
} from "./constants";

let db: IDBDatabase;

beforeEach(async () => {
  db = await openQueueDb(new IDBFactory());
});

function loadFixture(html: string): Document {
  const window = new Window({ url: "https://chatgpt.com/c/conv-dedupe" });
  window.document.body.innerHTML = html;
  return window.document as unknown as Document;
}

describe("capture → enqueue deduplication", () => {
  it("rescan of the same completed turns is already_known", async () => {
    const doc = loadFixture(FIXTURE_COMPLETED_FOUR_TURNS);
    const msgs = extractRawMessages(doc);
    const tracker: StabilityTracker = new Map();
    selectCompletedCandidates(msgs, tracker, 0, CAPTURE_STABILITY_MS);
    const completed = selectCompletedCandidates(
      msgs,
      tracker,
      CAPTURE_STABILITY_MS,
      CAPTURE_STABILITY_MS,
    );
    expect(completed).toHaveLength(4);

    const keyed = await assignSourceKeys("conv-dedupe", completed);
    const toInput = (turn: (typeof keyed)[number]): EnqueueInput => ({
      conversation: { conversation_id: "conv-dedupe", user_id: "user-1" },
      capture: {
        capture_client: CAPTURE_CLIENT,
        capture_client_version: CAPTURE_CLIENT_VERSION,
        surface: CAPTURE_SURFACE,
      },
      source_key: turn.source_key,
      turn: { speaker: turn.speaker, text: turn.text },
    });

    for (const turn of keyed) {
      const result = await enqueue(db, toInput(turn));
      expect(result.status).toBe("accepted");
    }
    expect(await getAllFromStore<QueueEnvelope>(db, STORES.queue)).toHaveLength(4);

    for (const turn of keyed) {
      const result = await enqueue(db, toInput(turn));
      expect(result.status).toBe("already_known");
    }
    expect(await getAllFromStore<QueueEnvelope>(db, STORES.queue)).toHaveLength(4);

    const edited = await enqueue(db, {
      ...toInput(keyed[0]!),
      turn: {
        speaker: "user",
        text: "edited in place — must not create a new turn",
      },
    });
    expect(edited.status).toBe("already_known");
    expect(await getAllFromStore<QueueEnvelope>(db, STORES.queue)).toHaveLength(4);
  });

  it("observer rescan of duplicate missing-id texts stays idempotent in the queue", async () => {
    const window = new Window({ url: "https://chatgpt.com/c/obs-q" });
    window.document.body.innerHTML = `
<main>
  <div data-message-author-role="user">
    <div class="whitespace-pre-wrap">Same text twice</div>
  </div>
  <div data-message-author-role="user">
    <div class="whitespace-pre-wrap">Same text twice</div>
  </div>
</main>`;
    let now = 0;
    const payloads: CaptureEnqueuePayload[] = [];
    const observer = createChatgptObserver({
      document: window.document as unknown as Document,
      getHref: () => "https://chatgpt.com/c/obs-q",
      isCaptureEnabled: () => true,
      sendEnqueue: async (p) => {
        payloads.push(p);
        await enqueue(db, {
          conversation: {
            conversation_id: p.conversation_id,
            user_id: "user-1",
          },
          capture: {
            capture_client: CAPTURE_CLIENT,
            capture_client_version: CAPTURE_CLIENT_VERSION,
            surface: CAPTURE_SURFACE,
          },
          source_key: p.source_key,
          turn: { speaker: p.speaker, text: p.text },
        });
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
    await observer.rescan();
    expect(await getAllFromStore<QueueEnvelope>(db, STORES.queue)).toHaveLength(
      2,
    );
    expect(new Set(payloads.map((p) => p.source_key)).size).toBe(2);

    await observer.rescan();
    expect(await getAllFromStore<QueueEnvelope>(db, STORES.queue)).toHaveLength(
      2,
    );
  });
});
