import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { openArtifactDb } from "./db";
import { enqueueArtifact, getArtifactStatus } from "./queue";
import { syncArtifactOnce } from "./sync";

describe("sibling artifact queue", () => {
  let db: IDBDatabase;

  beforeEach(async () => {
    // Unique DB per test via delete + reopen is awkward with fixed name;
    // clear stores instead.
    db = await openArtifactDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        ["queue", "dead", "conflicts", "identities", "status"],
        "readwrite",
      );
      for (const name of [
        "queue",
        "dead",
        "conflicts",
        "identities",
        "status",
      ]) {
        tx.objectStore(name).clear();
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });

  it("enqueue is idempotent on source_key", async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const input = {
      conversation_id: "c1",
      user_id: "u1",
      client_turn_id: "t1",
      source_key: "file_1",
      direction: "user_uploaded" as const,
      mime_type: "image/png",
      declared_sha256: "a".repeat(64),
      declared_byte_size: 3,
      capture: { capture_client: "chrome-extension" },
      bytes,
    };
    const first = await enqueueArtifact(db, input);
    expect(first.status).toBe("accepted");
    const second = await enqueueArtifact(db, input);
    expect(second.status).toBe("already_known");
    const status = await getArtifactStatus(db);
    expect(status.pending).toBe(1);
  });

  it("sync POST+PUT delivers and dequeues", async () => {
    const bytes = new Uint8Array([9, 8, 7]).buffer;
    await enqueueArtifact(db, {
      conversation_id: "c2",
      user_id: "u1",
      client_turn_id: "t2",
      source_key: "file_2",
      direction: "assistant_generated",
      mime_type: "image/png",
      declared_sha256: "b".repeat(64),
      declared_byte_size: 3,
      capture: { capture_client: "chrome-extension" },
      bytes,
    });

    let posts = 0;
    let puts = 0;
    const fetchFn = async (url: string, init?: RequestInit) => {
      if (url.endsWith("/v1/artifacts") && init?.method === "POST") {
        posts += 1;
        return new Response(
          JSON.stringify({
            artifact_id: "art-1",
            client_artifact_id: "file_2",
            conversation_id: "c2",
            capture_status: "pending_download",
            linkage_status: "unresolved",
            duplicate: false,
            server_time: new Date().toISOString(),
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/content") && init?.method === "PUT") {
        puts += 1;
        return new Response(
          JSON.stringify({
            artifact_id: "art-1",
            capture_status: "stored",
            checksum: "b".repeat(64),
            byte_size: 3,
            server_time: new Date().toISOString(),
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("no", { status: 404 });
    };

    const outcome = await syncArtifactOnce(
      db,
      { baseUrl: "http://127.0.0.1:8787", token: "tok" },
      fetchFn,
    );
    expect(outcome.delivered).toBe(1);
    expect(posts).toBe(1);
    expect(puts).toBe(1);
    const status = await getArtifactStatus(db);
    expect(status.pending).toBe(0);
  });

  it("409 creates conflict notice without URLs/bytes", async () => {
    const bytes = new Uint8Array([1]).buffer;
    await enqueueArtifact(db, {
      conversation_id: "c3",
      user_id: "u1",
      client_turn_id: "t3",
      source_key: "file_3",
      direction: "user_uploaded",
      mime_type: "image/png",
      declared_sha256: "c".repeat(64),
      declared_byte_size: 1,
      original_filename: "x.png",
      source_url: "https://chatgpt.com/backend-api/estuary/content?id=file_3",
      capture: { capture_client: "chrome-extension" },
      bytes,
    });

    const fetchFn = async () =>
      new Response(
        JSON.stringify({
          error: { code: "CONFLICT", message: "Artifact checksum conflict" },
        }),
        { status: 409, headers: { "content-type": "application/json" } },
      );

    const outcome = await syncArtifactOnce(
      db,
      { baseUrl: "http://127.0.0.1:8787", token: "tok" },
      fetchFn,
    );
    expect(outcome.conflicts).toBe(1);
    const status = await getArtifactStatus(db);
    expect(status.conflicts).toBe(1);
    expect(JSON.stringify(status)).not.toContain("estuary");
  });
});
