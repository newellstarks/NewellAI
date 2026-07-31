import { describe, expect, it } from "vitest";
import worker from "./index";

const validBody = {
  conversation: {
    conversation_id: "conv-1",
    user_id: "user-1",
  },
  capture: {
    capture_client: "manual",
  },
  turns: [
    {
      client_turn_id: "turn-1",
      speaker: "assistant",
      text: "Hi there",
    },
  ],
};

describe("Worker fetch — ingest skeleton", () => {
  it("GET /health returns ok", async () => {
    const res = await worker.fetch(new Request("https://example.test/health"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("POST /v1/turns returns UploadResponse skeleton for valid JSON", async () => {
    const res = await worker.fetch(
      new Request("https://example.test/v1/turns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validBody),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accepted: number;
      duplicate: number;
      conversation_id: string;
      server_time: string;
    };
    expect(body.accepted).toBe(1);
    expect(body.duplicate).toBe(0);
    expect(body.conversation_id).toBe("conv-1");
    expect(typeof body.server_time).toBe("string");
  });

  it("POST /v1/turns returns INVALID_JSON for bad body", async () => {
    const res = await worker.fetch(
      new Request("https://example.test/v1/turns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not-json",
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_JSON");
  });

  it("POST /v1/turns returns VALIDATION_ERROR for empty turns", async () => {
    const res = await worker.fetch(
      new Request("https://example.test/v1/turns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...validBody, turns: [] }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; details?: unknown } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("unknown route returns NOT_FOUND", async () => {
    const res = await worker.fetch(new Request("https://example.test/nope"));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });
});
