import { beforeEach, describe, expect, it } from "vitest";
import { createTestD1 } from "../../db/testD1";
import type { Env } from "../../env";
import worker from "../../index";

const TOKEN = "test-capture-token";
let env: Env;

beforeEach(() => {
  env = {
    CAPTURE_API_TOKEN: TOKEN,
    DB: createTestD1().d1,
    ARTIFACT_STORAGE_MODE: "memory",
  };
});

function authHeaders(token = TOKEN): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
  };
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Minimal valid 1x1 PNG. */
const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
  0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f,
  0x00, 0x05, 0xfe, 0x02, 0xfe, 0xa1, 0x46, 0x9f, 0x31, 0x00, 0x00, 0x00,
  0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

describe("Artifact v1 image routes", () => {
  it("POST metadata then PUT content finalizes stored; GET content returns bytes", async () => {
    const checksum = await sha256Hex(PNG_BYTES);
    const createRes = await worker.fetch(
      new Request("https://example.test/v1/artifacts", {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          client_artifact_id: "file_1",
          conversation_id: "conv-a",
          user_id: "user-1",
          client_turn_id: "turn-a",
          direction: "user_uploaded",
          artifact_type: "image",
          mime_type: "image/png",
          declared_sha256: checksum,
          declared_byte_size: PNG_BYTES.byteLength,
          image_provenance: "uploaded",
          capture: { capture_client: "chrome-extension" },
        }),
      }),
      env,
    );
    expect(createRes.status).toBe(200);
    const created = (await createRes.json()) as {
      artifact_id: string;
      duplicate: boolean;
      capture_status: string;
    };
    expect(created.duplicate).toBe(false);
    expect(created.capture_status).toBe("pending_download");

    const putRes = await worker.fetch(
      new Request(
        `https://example.test/v1/artifacts/${created.artifact_id}/content`,
        {
          method: "PUT",
          headers: {
            ...authHeaders(),
            "content-type": "image/png",
          },
          body: PNG_BYTES,
        },
      ),
      env,
    );
    expect(putRes.status).toBe(200);
    const putBody = (await putRes.json()) as { capture_status: string };
    expect(putBody.capture_status).toBe("stored");

    const getMeta = await worker.fetch(
      new Request(
        `https://example.test/v1/artifacts/${created.artifact_id}`,
        { headers: authHeaders() },
      ),
      env,
    );
    expect(getMeta.status).toBe(200);

    const getBytes = await worker.fetch(
      new Request(
        `https://example.test/v1/artifacts/${created.artifact_id}/content`,
        { headers: authHeaders() },
      ),
      env,
    );
    expect(getBytes.status).toBe(200);
    expect(getBytes.headers.get("content-type")).toBe("image/png");
    const body = new Uint8Array(await getBytes.arrayBuffer());
    expect(body).toEqual(PNG_BYTES);

    const list = await worker.fetch(
      new Request("https://example.test/v1/conversations/conv-a/artifacts", {
        headers: authHeaders(),
      }),
      env,
    );
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as { artifacts: unknown[] };
    expect(listBody.artifacts).toHaveLength(1);
  });

  it("POST is idempotent for same checksum; conflicts on different checksum", async () => {
    const checksum = await sha256Hex(PNG_BYTES);
    const body = {
      client_artifact_id: "file_dup",
      conversation_id: "conv-b",
      user_id: "user-1",
      client_turn_id: "turn-b",
      direction: "assistant_generated",
      artifact_type: "image",
      mime_type: "image/png",
      declared_sha256: checksum,
      declared_byte_size: PNG_BYTES.byteLength,
      capture: { capture_client: "chrome-extension" },
    };
    const first = await worker.fetch(
      new Request("https://example.test/v1/artifacts", {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
    expect(first.status).toBe(200);
    const firstJson = (await first.json()) as { artifact_id: string };

    const second = await worker.fetch(
      new Request("https://example.test/v1/artifacts", {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
    expect(second.status).toBe(200);
    const secondJson = (await second.json()) as {
      artifact_id: string;
      duplicate: boolean;
    };
    expect(secondJson.duplicate).toBe(true);
    expect(secondJson.artifact_id).toBe(firstJson.artifact_id);

    const conflict = await worker.fetch(
      new Request("https://example.test/v1/artifacts", {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          ...body,
          declared_sha256: "b".repeat(64),
        }),
      }),
      env,
    );
    expect(conflict.status).toBe(409);
  });

  it("rejects disallowed MIME and unauthorized requests", async () => {
    const bad = await worker.fetch(
      new Request("https://example.test/v1/artifacts", {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          client_artifact_id: "file_x",
          conversation_id: "conv-c",
          user_id: "user-1",
          client_turn_id: "turn-c",
          direction: "user_uploaded",
          artifact_type: "image",
          mime_type: "application/pdf",
          capture: { capture_client: "chrome-extension" },
        }),
      }),
      env,
    );
    expect(bad.status).toBe(400);

    const unauth = await worker.fetch(
      new Request("https://example.test/v1/artifacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(unauth.status).toBe(401);
  });

  it("GET content returns 404 when metadata_discovered (not stored)", async () => {
    const createRes = await worker.fetch(
      new Request("https://example.test/v1/artifacts", {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          client_artifact_id: "file_meta",
          conversation_id: "conv-d",
          user_id: "user-1",
          client_turn_id: "turn-d",
          direction: "user_uploaded",
          artifact_type: "image",
          mime_type: "image/png",
          capture: { capture_client: "chrome-extension" },
        }),
      }),
      env,
    );
    const created = (await createRes.json()) as { artifact_id: string };
    const getBytes = await worker.fetch(
      new Request(
        `https://example.test/v1/artifacts/${created.artifact_id}/content`,
        { headers: authHeaders() },
      ),
      env,
    );
    expect(getBytes.status).toBe(404);
  });
});
