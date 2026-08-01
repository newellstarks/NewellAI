import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { getAllFromStore, openQueueDb, STORES } from "./db";
import {
  clearDeadLetters,
  enqueue,
  getDeadLetters,
  getStatus,
  recoverInFlight,
  requeueAuthBlocked,
  validateSourceKey,
} from "./queue";
import { syncOnce } from "./sync";
import type { EnqueueInput, QueueEnvelope } from "./types";

let db: IDBDatabase;

beforeEach(async () => {
  db = await openQueueDb(new IDBFactory());
});

function input(
  conversationId: string,
  text: string,
  sourceKey?: string,
): EnqueueInput {
  return {
    conversation: { conversation_id: conversationId, user_id: "user-1" },
    capture: { capture_client: "chrome-extension" },
    ...(sourceKey !== undefined ? { source_key: sourceKey } : {}),
    turn: { speaker: "user", text },
  };
}

function queueItems(): Promise<QueueEnvelope[]> {
  return getAllFromStore<QueueEnvelope>(db, STORES.queue);
}

describe("validateSourceKey", () => {
  it("accepts reasonable identifiers and trims whitespace", () => {
    expect(validateSourceKey("msg-abc-123")).toBe("msg-abc-123");
    expect(validateSourceKey("  msg-1  ")).toBe("msg-1");
  });

  it("rejects empty, oversized, and control-character values", () => {
    expect(validateSourceKey(undefined)).toBeNull();
    expect(validateSourceKey("")).toBeNull();
    expect(validateSourceKey("   ")).toBeNull();
    expect(validateSourceKey("x".repeat(129))).toBeNull();
    expect(validateSourceKey("bad\u0000key")).toBeNull();
  });
});

describe("enqueue — identity and sequence (ADR-0006)", () => {
  it("assigns per-conversation sequence starting at 1", async () => {
    const first = await enqueue(db, input("conv-a", "one", "m1"));
    const second = await enqueue(db, input("conv-a", "two", "m2"));
    const other = await enqueue(db, input("conv-b", "one", "m1"));

    expect(first).toMatchObject({ status: "accepted", sequence: 1 });
    expect(second).toMatchObject({ status: "accepted", sequence: 2 });
    expect(other).toMatchObject({ status: "accepted", sequence: 1 });
  });

  it("uses a validated source key as client_turn_id", async () => {
    const result = await enqueue(db, input("conv-a", "hello", "msg-77"));
    expect(result.client_turn_id).toBe("msg-77");
  });

  it("falls back to a local UUID when the source key is invalid", async () => {
    const result = await enqueue(db, input("conv-a", "hello", "   "));
    expect(result.client_turn_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("re-observation reuses identity and sequence; no new item, no increment", async () => {
    const first = await enqueue(db, input("conv-a", "hello", "m1"));
    const rescan = await enqueue(db, input("conv-a", "hello", "m1"));

    expect(rescan).toEqual({
      status: "already_known",
      client_turn_id: first.client_turn_id,
      sequence: 1,
    });
    expect(await queueItems()).toHaveLength(1);

    // Sequence counter untouched by the rescan.
    const next = await enqueue(db, input("conv-a", "new turn", "m2"));
    expect(next.sequence).toBe(2);
  });

  it("rescan after delivery does not re-enqueue (identity persists)", async () => {
    await enqueue(db, input("conv-a", "hello", "m1"));
    const ok = new Response(
      JSON.stringify({
        accepted: 1,
        duplicate: 0,
        conversation_id: "conv-a",
        server_time: new Date().toISOString(),
      }),
      { status: 200 },
    );
    await syncOnce(db, { baseUrl: "http://x", token: "t" }, async () => ok);
    expect(await queueItems()).toHaveLength(0);

    const rescan = await enqueue(db, input("conv-a", "hello", "m1"));
    expect(rescan.status).toBe("already_known");
    expect(await queueItems()).toHaveLength(0);
  });

  it("same source key in different conversations is a distinct turn", async () => {
    const a = await enqueue(db, input("conv-a", "hello", "m1"));
    const b = await enqueue(db, input("conv-b", "hello", "m1"));
    expect(a.status).toBe("accepted");
    expect(b.status).toBe("accepted");
    expect(await queueItems()).toHaveLength(2);
  });
});

describe("recovery and dead letters", () => {
  it("T6: abandoned in-flight items revert to pending", async () => {
    await enqueue(db, input("conv-a", "one", "m1"));
    const [item] = await queueItems();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORES.queue, "readwrite");
      tx.objectStore(STORES.queue).put({ ...item!, state: "in_flight" });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    const recovered = await recoverInFlight(db);
    expect(recovered).toBe(1);
    const [after] = await queueItems();
    expect(after!.state).toBe("pending");
  });

  it("auth-blocked items requeue as pending when credentials change", async () => {
    await enqueue(db, input("conv-a", "one", "m1"));
    await syncOnce(
      db,
      { baseUrl: "http://x", token: "bad" },
      async () => new Response("{}", { status: 401 }),
    );
    let [item] = await queueItems();
    expect(item!.state).toBe("auth_blocked");

    const requeued = await requeueAuthBlocked(db);
    expect(requeued).toBe(1);
    [item] = await queueItems();
    expect(item!.state).toBe("pending");
  });

  it("dead letters are retained until manually cleared", async () => {
    await enqueue(db, input("conv-a", "one", "m1"));
    await syncOnce(
      db,
      { baseUrl: "http://x", token: "t" },
      async () => new Response("{}", { status: 400 }),
    );
    expect(await getDeadLetters(db)).toHaveLength(1);

    const cleared = await clearDeadLetters(db);
    expect(cleared).toBe(1);
    expect(await getDeadLetters(db)).toHaveLength(0);
  });
});

describe("T8: status", () => {
  it("reports counts, oldest age, and last error without content", async () => {
    await enqueue(db, input("conv-a", "secret content", "m1"), 1_000);
    await syncOnce(
      db,
      { baseUrl: "http://x", token: "t" },
      async () => {
        throw new TypeError("fetch failed");
      },
      2_000,
    );

    const status = await getStatus(db, 10_000);
    expect(status.pending).toBe(1);
    expect(status.dead).toBe(0);
    expect(status.oldest_pending_age_ms).toBe(9_000);
    expect(status.last_error).toBe("network error");
    expect(JSON.stringify(status)).not.toContain("secret content");
  });
});
