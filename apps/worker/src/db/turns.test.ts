import { afterEach, describe, expect, it, vi } from "vitest";
import type { UploadRequest } from "@newellai/contracts";
import { HttpError } from "../errors";
import { createTestD1 } from "./testD1";
import { persistUpload } from "./turns";

function makeUpload(overrides: Partial<UploadRequest> = {}): UploadRequest {
  return {
    conversation: {
      conversation_id: "conv-1",
      user_id: "user-1",
      title: "First title",
    },
    capture: {
      capture_client: "manual",
      surface: "chatgpt-web",
    },
    turns: [
      {
        client_turn_id: "turn-1",
        speaker: "user",
        text: "Hello",
        sequence: 1,
        topic: "greeting",
      },
      {
        client_turn_id: "turn-2",
        speaker: "assistant",
        text: "Hi there",
        sequence: 2,
        parent_client_turn_id: "turn-1",
      },
    ],
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("persistUpload (docs/Database.md)", () => {
  it("DB-1: persists user, conversation, and turns with real counts", async () => {
    const { d1, test } = createTestD1();
    const result = await persistUpload(d1, makeUpload());

    expect(result).toEqual({ accepted: 2, duplicate: 0 });
    expect(test.count("users")).toBe(1);
    expect(test.count("conversations")).toBe(1);
    expect(test.count("turns")).toBe(2);
  });

  it("DB-2: re-uploading an identical batch counts all as duplicate", async () => {
    const { d1, test } = createTestD1();
    await persistUpload(d1, makeUpload());
    const result = await persistUpload(d1, makeUpload());

    expect(result).toEqual({ accepted: 0, duplicate: 2 });
    expect(test.count("turns")).toBe(2);
  });

  it("DB-3: mixed batch counts new vs already-stored separately", async () => {
    const { d1, test } = createTestD1();
    await persistUpload(d1, makeUpload());

    const mixed = makeUpload({
      turns: [
        { client_turn_id: "turn-2", speaker: "assistant", text: "Hi there" },
        { client_turn_id: "turn-3", speaker: "user", text: "New message" },
      ],
    });
    const result = await persistUpload(d1, mixed);

    expect(result).toEqual({ accepted: 1, duplicate: 1 });
    expect(test.count("turns")).toBe(3);
  });

  it("DB-4: same client_turn_id in a different conversation is accepted", async () => {
    const { d1, test } = createTestD1();
    await persistUpload(d1, makeUpload());

    const other = makeUpload({
      conversation: { conversation_id: "conv-2", user_id: "user-1" },
      turns: [{ client_turn_id: "turn-1", speaker: "user", text: "Hello again" }],
    });
    const result = await persistUpload(d1, other);

    expect(result).toEqual({ accepted: 1, duplicate: 0 });
    expect(test.count("conversations")).toBe(2);
    expect(test.count("turns")).toBe(3);
  });

  it("DB-5: duplicate client_turn_id within one batch counts as duplicate", async () => {
    const { d1, test } = createTestD1();
    const batch = makeUpload({
      turns: [
        { client_turn_id: "turn-1", speaker: "user", text: "Hello" },
        { client_turn_id: "turn-1", speaker: "user", text: "Hello repeat" },
      ],
    });
    const result = await persistUpload(d1, batch);

    expect(result).toEqual({ accepted: 1, duplicate: 1 });
    expect(test.count("turns")).toBe(1);
  });

  it("DB-6: conversation metadata is first-write-wins", async () => {
    const { d1, test } = createTestD1();
    await persistUpload(d1, makeUpload());

    await persistUpload(
      d1,
      makeUpload({
        conversation: {
          conversation_id: "conv-1",
          user_id: "user-1",
          title: "Changed title",
        },
        turns: [{ client_turn_id: "turn-9", speaker: "user", text: "More" }],
      }),
    );

    const row = test.sqlite
      .prepare("SELECT title FROM conversations WHERE conversation_id = ?")
      .get("conv-1") as { title: string };
    expect(row.title).toBe("First title");
  });

  it("DB-7: missing DB binding fails closed with sanitized error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(persistUpload(undefined, makeUpload())).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      message: "Unexpected server error",
    });
    expect(spy).toHaveBeenCalledWith("DB_CONFIGURATION_MISSING");
  });

  it("DB-8: D1 errors surface as unhandled (mapped to 500 by the route)", async () => {
    const { d1, test } = createTestD1();
    test.sqlite.exec("DROP TABLE turns");
    await expect(persistUpload(d1, makeUpload())).rejects.toThrow();
  });

  it("DB-9: optional turn columns round-trip as sent", async () => {
    const { d1, test } = createTestD1();
    await persistUpload(d1, makeUpload());

    const row = test.sqlite
      .prepare(
        `SELECT speaker, text, sequence, parent_client_turn_id, topic,
                capture_client, surface
         FROM turns WHERE client_turn_id = ?`,
      )
      .get("turn-2") as Record<string, unknown>;

    expect(row).toEqual({
      speaker: "assistant",
      text: "Hi there",
      sequence: 2,
      parent_client_turn_id: "turn-1",
      topic: null,
      capture_client: "manual",
      surface: "chatgpt-web",
    });
  });

  it("rejects HttpError instances unchanged (no double wrapping)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(persistUpload(undefined, makeUpload())).rejects.toBeInstanceOf(
      HttpError,
    );
  });
});
