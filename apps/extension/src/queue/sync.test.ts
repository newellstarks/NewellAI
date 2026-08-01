import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import type { UploadRequest } from "@newellai/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { getAllFromStore, openQueueDb, STORES } from "./db";
import { enqueue, getDeadLetters, getStatus } from "./queue";
import { createSyncRunner, syncOnce, type FetchLike } from "./sync";
import type { EnqueueInput, QueueEnvelope } from "./types";

const CONFIG = { baseUrl: "http://localhost:8787", token: "test-token" };

let db: IDBDatabase;

beforeEach(async () => {
  db = await openQueueDb(new IDBFactory());
});

function input(conversationId: string, text: string, sourceKey: string): EnqueueInput {
  return {
    conversation: { conversation_id: conversationId, user_id: "user-1" },
    capture: { capture_client: "chrome-extension" },
    source_key: sourceKey,
    turn: { speaker: "user", text },
  };
}

function ok(accepted: number, duplicate = 0): Response {
  return new Response(
    JSON.stringify({
      accepted,
      duplicate,
      conversation_id: "any",
      server_time: new Date().toISOString(),
    }),
    { status: 200 },
  );
}

/** Records upload bodies; serves queued responses (or throws for network). */
function fakeFetch(
  responses: Array<Response | "network-error">,
): { fetchFn: FetchLike; uploads: UploadRequest[]; calls: () => number } {
  const uploads: UploadRequest[] = [];
  let call = 0;
  const fetchFn: FetchLike = async (_url, init) => {
    uploads.push(JSON.parse(init.body as string) as UploadRequest);
    const next = responses[Math.min(call, responses.length - 1)]!;
    call += 1;
    if (next === "network-error") throw new TypeError("fetch failed");
    return next.clone();
  };
  return { fetchFn, uploads, calls: () => call };
}

function queueItems(): Promise<QueueEnvelope[]> {
  return getAllFromStore<QueueEnvelope>(db, STORES.queue);
}

describe("syncOnce — classification", () => {
  it("T1: delivers one conversation's turns in sequence order", async () => {
    await enqueue(db, input("conv-a", "first", "m1"));
    await enqueue(db, input("conv-a", "second", "m2"));
    const { fetchFn, uploads } = fakeFetch([ok(2)]);

    const outcome = await syncOnce(db, CONFIG, fetchFn);
    expect(outcome).toMatchObject({ delivered: 2, retried: 0, dead_lettered: 0 });
    expect(await queueItems()).toHaveLength(0);
    expect(uploads).toHaveLength(1);
    expect(uploads[0]!.turns.map((t) => t.sequence)).toEqual([1, 2]);
    expect(uploads[0]!.turns.map((t) => t.client_turn_id)).toEqual(["m1", "m2"]);
  });

  it("T2: unreachable Worker leaves items pending with backoff; delivers once reachable", async () => {
    await enqueue(db, input("conv-a", "offline turn", "m1"), 1_000);

    const offline = fakeFetch(["network-error"]);
    const first = await syncOnce(db, CONFIG, offline.fetchFn, 1_000);
    expect(first).toMatchObject({ delivered: 0, retried: 1 });
    let [item] = await queueItems();
    expect(item!.state).toBe("pending");
    expect(item!.attempts).toBe(1);
    expect(item!.next_attempt_at).toBe(1_000 + 5_000);

    // Not due yet: sync is idle before next_attempt_at.
    const early = await syncOnce(db, CONFIG, offline.fetchFn, 2_000);
    expect(early.idle).toBe(true);

    // Worker reachable again after the backoff elapses.
    const online = fakeFetch([ok(1)]);
    const second = await syncOnce(db, CONFIG, online.fetchFn, 6_001);
    expect(second).toMatchObject({ delivered: 1 });
    expect(await queueItems()).toHaveLength(0);
  });

  it("T3: duplicate 200 dequeues regardless of accepted/duplicate split", async () => {
    await enqueue(db, input("conv-a", "retry me", "m1"));
    const { fetchFn } = fakeFetch([ok(0, 1)]);
    const outcome = await syncOnce(db, CONFIG, fetchFn);
    expect(outcome.delivered).toBe(1);
    expect(await queueItems()).toHaveLength(0);
  });

  it("T4: delivers after transient 500s, consuming retry budget", async () => {
    await enqueue(db, input("conv-a", "flaky", "m1"), 0);
    const { fetchFn } = fakeFetch([
      new Response("{}", { status: 500 }),
      new Response("{}", { status: 500 }),
      ok(1),
    ]);

    expect((await syncOnce(db, CONFIG, fetchFn, 0)).retried).toBe(1);
    expect((await syncOnce(db, CONFIG, fetchFn, 5_001)).retried).toBe(1);
    const third = await syncOnce(db, CONFIG, fetchFn, 20_001);
    expect(third.delivered).toBe(1);
    expect(await queueItems()).toHaveLength(0);
  });

  it("T5: persistent 500 dead-letters after 5 attempts and unblocks others", async () => {
    await enqueue(db, input("conv-a", "poisoned by server", "a1"), 0);
    const always500 = fakeFetch([new Response("{}", { status: 500 })]);

    let now = 0;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const outcome = await syncOnce(db, CONFIG, always500.fetchFn, now);
      if (attempt < 5) {
        expect(outcome.retried).toBe(1);
        const [item] = await queueItems();
        now = item!.next_attempt_at;
      } else {
        expect(outcome.dead_lettered).toBe(1);
      }
    }

    const letters = await getDeadLetters(db);
    expect(letters).toHaveLength(1);
    expect(letters[0]!.reason).toBe("max attempts exceeded");

    // Another conversation still drains.
    await enqueue(db, input("conv-b", "healthy", "b1"), now);
    const healthy = fakeFetch([ok(1)]);
    const outcome = await syncOnce(db, CONFIG, healthy.fetchFn, now + 1);
    expect(outcome.delivered).toBe(1);
  });

  it("T7: interleaved conversations sync oldest-first with per-conversation order", async () => {
    await enqueue(db, input("conv-b", "b first", "b1"), 1_000);
    await enqueue(db, input("conv-a", "a first", "a1"), 2_000);
    await enqueue(db, input("conv-b", "b second", "b2"), 3_000);
    await enqueue(db, input("conv-a", "a second", "a2"), 4_000);

    const { fetchFn, uploads } = fakeFetch([ok(2)]);
    const run = createSyncRunner(db, async () => CONFIG, fetchFn);
    const outcome = await run();

    expect(outcome.delivered).toBe(4);
    expect(uploads).toHaveLength(2);
    // conv-b holds the oldest pending item, so it goes first.
    expect(uploads[0]!.conversation.conversation_id).toBe("conv-b");
    expect(uploads[0]!.turns.map((t) => t.client_turn_id)).toEqual(["b1", "b2"]);
    expect(uploads[1]!.conversation.conversation_id).toBe("conv-a");
    expect(uploads[1]!.turns.map((t) => t.client_turn_id)).toEqual(["a1", "a2"]);
  });

  it("401 blocks items without consuming the retry budget", async () => {
    await enqueue(db, input("conv-a", "auth me", "m1"));
    const { fetchFn } = fakeFetch([new Response("{}", { status: 401 })]);

    const outcome = await syncOnce(db, CONFIG, fetchFn);
    expect(outcome.auth_blocked).toBe(1);
    const [item] = await queueItems();
    expect(item!.state).toBe("auth_blocked");
    expect(item!.attempts).toBe(0);

    // Auth-blocked items are not selected by later syncs.
    const again = await syncOnce(db, CONFIG, fetchFn);
    expect(again.idle).toBe(true);

    const status = await getStatus(db);
    expect(status.auth_blocked).toBe(1);
    expect(status.last_error).toBe("authentication rejected (401)");
  });

  it("permanent 400 dead-letters immediately with a sanitized reason", async () => {
    await enqueue(db, input("conv-a", "top secret text", "m1"));
    const { fetchFn, calls } = fakeFetch([new Response("{}", { status: 400 })]);

    const outcome = await syncOnce(db, CONFIG, fetchFn);
    expect(outcome.dead_lettered).toBe(1);
    expect(calls()).toBe(1);
    expect(await queueItems()).toHaveLength(0);

    const [letter] = await getDeadLetters(db);
    expect(letter!.reason).toBe("permanent rejection (HTTP 400)");
    expect(letter!.reason).not.toContain("top secret text");

    const status = await getStatus(db);
    expect(status.last_error).toBe("upload rejected (HTTP 400)");
  });

  it("caps a batch at 25 turns and drains the remainder", async () => {
    for (let i = 1; i <= 30; i += 1) {
      await enqueue(db, input("conv-a", `turn ${i}`, `m${String(i).padStart(2, "0")}`), i);
    }
    const { fetchFn, uploads } = fakeFetch([ok(25), ok(5)]);
    const run = createSyncRunner(db, async () => CONFIG, fetchFn);
    const outcome = await run();

    expect(outcome.delivered).toBe(30);
    expect(uploads[0]!.turns).toHaveLength(25);
    expect(uploads[1]!.turns).toHaveLength(5);
    expect(uploads[0]!.turns[0]!.sequence).toBe(1);
    expect(uploads[1]!.turns[0]!.sequence).toBe(26);
  });

  it("stale in-flight items are recovered by the next sync", async () => {
    await enqueue(db, input("conv-a", "stuck", "m1"));
    const [item] = await queueItems();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORES.queue, "readwrite");
      tx.objectStore(STORES.queue).put({ ...item!, state: "in_flight" });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    const { fetchFn } = fakeFetch([ok(1)]);
    const outcome = await syncOnce(db, CONFIG, fetchFn);
    expect(outcome.delivered).toBe(1);
    expect(await queueItems()).toHaveLength(0);
  });

  it("runner returns unconfigured as idle without fetching", async () => {
    await enqueue(db, input("conv-a", "waiting", "m1"));
    const { fetchFn, calls } = fakeFetch([ok(1)]);
    const run = createSyncRunner(db, async () => null, fetchFn);
    const outcome = await run();
    expect(outcome.idle).toBe(true);
    expect(calls()).toBe(0);
    expect(await queueItems()).toHaveLength(1);
  });
});
