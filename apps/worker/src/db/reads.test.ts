import type { UploadRequest } from "@newellai/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../errors";
import { listConversations, listConversationTurns } from "./reads";
import { createTestD1, TestD1Database } from "./testD1";
import { persistUpload } from "./turns";

let d1: D1Database;
let test: TestD1Database;

beforeEach(() => {
  ({ d1, test } = createTestD1());
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-01T10:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function upload(
  conversationId: string,
  clientTurnIds: string[],
  overrides: Partial<UploadRequest["conversation"]> = {},
  turnOverrides: Array<Partial<UploadRequest["turns"][number]>> = [],
): UploadRequest {
  return {
    conversation: {
      conversation_id: conversationId,
      user_id: "user-1",
      ...overrides,
    },
    capture: { capture_client: "manual" },
    turns: clientTurnIds.map((clientTurnId, i) => ({
      client_turn_id: clientTurnId,
      speaker: i % 2 === 0 ? "user" : "assistant",
      text: `text-${clientTurnId}`,
      ...turnOverrides[i],
    })),
  };
}

/** Advance fake time so each ingest gets a distinct server created_at. */
async function ingestAt(iso: string, request: UploadRequest): Promise<void> {
  vi.setSystemTime(new Date(iso));
  await persistUpload(d1, request);
}

describe("listConversations", () => {
  it("READ-1: orders by last turn ingest time descending", async () => {
    await ingestAt("2026-08-01T10:00:00.000Z", upload("conv-a", ["a1"]));
    await ingestAt("2026-08-01T10:01:00.000Z", upload("conv-b", ["b1"]));
    // conv-a becomes most recently active.
    await ingestAt("2026-08-01T10:02:00.000Z", upload("conv-a", ["a2"]));

    const list = await listConversations(d1);
    expect(list.map((c) => c.conversation_id)).toEqual(["conv-a", "conv-b"]);
    expect(list[0]!.last_turn_at).toBe("2026-08-01T10:02:00.000Z");
    expect(list[1]!.last_turn_at).toBe("2026-08-01T10:01:00.000Z");
  });

  it("READ-2: breaks last_turn_at ties by conversation_id ascending", async () => {
    // Same fake timestamp for both ingests → identical last_turn_at.
    await ingestAt("2026-08-01T10:00:00.000Z", upload("conv-z", ["z1"]));
    await ingestAt("2026-08-01T10:00:00.000Z", upload("conv-a", ["a1"]));

    const list = await listConversations(d1);
    expect(list.map((c) => c.conversation_id)).toEqual(["conv-a", "conv-z"]);
  });

  it("READ-3: empty store returns an empty array", async () => {
    await expect(listConversations(d1)).resolves.toEqual([]);
  });

  it("READ-4: returns summaries only, with correct aggregates", async () => {
    await ingestAt(
      "2026-08-01T10:00:00.000Z",
      upload("conv-a", ["a1", "a2"], { title: "My chat", source_model: "gpt-5" }),
    );
    await ingestAt("2026-08-01T10:05:00.000Z", upload("conv-a", ["a3"]));

    const list = await listConversations(d1);
    expect(list).toHaveLength(1);
    const summary = list[0]!;
    expect(summary).toEqual({
      conversation_id: "conv-a",
      user_id: "user-1",
      title: "My chat",
      source_model: "gpt-5",
      created_at: "2026-08-01T10:00:00.000Z",
      last_turn_at: "2026-08-01T10:05:00.000Z",
      turn_count: 3,
    });
    // No turn content anywhere in the summary.
    expect(JSON.stringify(list)).not.toContain("text-a1");
  });

  it("READ-4b: optional conversation fields are absent when not stored", async () => {
    await ingestAt("2026-08-01T10:00:00.000Z", upload("conv-a", ["a1"]));
    const [summary] = await listConversations(d1);
    expect(summary).not.toHaveProperty("title");
    expect(summary).not.toHaveProperty("source_model");
    expect(summary).not.toHaveProperty("started_at");
  });

  it("READ-11: orphaned conversation is exposed with nulls and sorts last", async () => {
    await ingestAt("2026-08-01T10:00:00.000Z", upload("conv-old", ["o1"]));
    await ingestAt("2026-08-01T10:01:00.000Z", upload("conv-new", ["n1"]));

    // Simulate a mid-write failure on the non-transactional persistence
    // path: conversation row inserted, but no turns.
    test.sqlite
      .prepare(
        `INSERT INTO users (user_id, created_at) VALUES (?, ?)
         ON CONFLICT DO NOTHING`,
      )
      .run("user-1", "2026-08-01T10:02:00.000Z");
    test.sqlite
      .prepare(
        `INSERT INTO conversations
           (conversation_id, user_id, title, source_model, started_at, created_at)
         VALUES (?, ?, NULL, NULL, NULL, ?)`,
      )
      .run("conv-a-orphan", "user-1", "2026-08-01T10:02:00.000Z");

    const list = await listConversations(d1);
    // Orphan sorts after every conversation with turns, despite an id that
    // would sort first alphabetically.
    expect(list.map((c) => c.conversation_id)).toEqual([
      "conv-new",
      "conv-old",
      "conv-a-orphan",
    ]);
    const orphan = list[2]!;
    expect(orphan.last_turn_at).toBeNull();
    expect(orphan.turn_count).toBe(0);
  });

  it("READ-8: missing DB binding fails closed with sanitized error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(listConversations(undefined)).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      message: "Unexpected server error",
    });
    expect(spy).toHaveBeenCalledWith("DB_CONFIGURATION_MISSING");
  });
});

describe("listConversationTurns", () => {
  it("READ-5: orders sequence ASC nulls last, then created_at, then turn_id", async () => {
    await ingestAt(
      "2026-08-01T10:00:00.000Z",
      upload("conv-a", ["t-seq2", "t-null-early"], {}, [{ sequence: 2 }, {}]),
    );
    await ingestAt(
      "2026-08-01T10:01:00.000Z",
      upload("conv-a", ["t-seq1", "t-null-late"], {}, [{ sequence: 1 }, {}]),
    );

    const turns = await listConversationTurns(d1, "conv-a");
    expect(turns.map((t) => t.client_turn_id)).toEqual([
      "t-seq1",
      "t-seq2",
      "t-null-early",
      "t-null-late",
    ]);
  });

  it("READ-5b: created_at ties fall back to turn_id ascending", async () => {
    // One batch → same created_at, no sequences; expect deterministic order.
    await ingestAt(
      "2026-08-01T10:00:00.000Z",
      upload("conv-a", ["t1", "t2", "t3"]),
    );
    const first = await listConversationTurns(d1, "conv-a");
    const second = await listConversationTurns(d1, "conv-a");
    expect(first.map((t) => t.turn_id)).toEqual(second.map((t) => t.turn_id));
    const ids = first.map((t) => t.turn_id);
    expect([...ids].sort()).toEqual(ids);
  });

  it("READ-6: unknown conversation throws NOT_FOUND", async () => {
    await expect(listConversationTurns(d1, "missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      listConversationTurns(d1, "missing"),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it("READ-8: missing DB binding fails closed with sanitized error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      listConversationTurns(undefined, "conv-a"),
    ).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      message: "Unexpected server error",
    });
    expect(spy).toHaveBeenCalledWith("DB_CONFIGURATION_MISSING");
  });

  it("READ-10: optional turn fields round-trip and are absent when NULL", async () => {
    await ingestAt(
      "2026-08-01T10:00:00.000Z",
      upload("conv-a", ["rich", "bare"], {}, [
        {
          captured_at: "2026-07-31T09:00:00.000Z",
          sequence: 1,
          parent_client_turn_id: "parent-1",
          message_type: "chat",
          topic: "testing",
        },
        {},
      ]),
    );

    const turns = await listConversationTurns(d1, "conv-a");
    const rich = turns.find((t) => t.client_turn_id === "rich")!;
    const bare = turns.find((t) => t.client_turn_id === "bare")!;

    expect(rich).toMatchObject({
      speaker: "user",
      text: "text-rich",
      captured_at: "2026-07-31T09:00:00.000Z",
      sequence: 1,
      parent_client_turn_id: "parent-1",
      message_type: "chat",
      topic: "testing",
      capture_client: "manual",
      created_at: "2026-08-01T10:00:00.000Z",
    });
    for (const field of [
      "captured_at",
      "sequence",
      "parent_client_turn_id",
      "message_type",
      "topic",
      "capture_client_version",
      "surface",
      "captured_batch_id",
    ]) {
      expect(bare).not.toHaveProperty(field);
    }
  });
});
