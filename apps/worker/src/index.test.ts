import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestD1 } from "./db/testD1";
import type { Env } from "./env";
import worker from "./index";

const TOKEN = "test-capture-token";
let env: Env;

beforeEach(() => {
  env = { CAPTURE_API_TOKEN: TOKEN, DB: createTestD1().d1 };
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function authHeaders(token = TOKEN, authorization?: string): HeadersInit {
  return {
    "content-type": "application/json",
    Authorization: authorization ?? `Bearer ${token}`,
  };
}

async function postTurns(
  init: {
    headers?: HeadersInit;
    body?: string;
    env?: Env;
  } = {},
): Promise<Response> {
  return worker.fetch(
    new Request("https://example.test/v1/turns", {
      method: "POST",
      headers: init.headers ?? authHeaders(),
      body: init.body ?? JSON.stringify(validBody),
    }),
    init.env ?? env,
  );
}

function expectServerRequestId(res: Response): string {
  const id = res.headers.get("X-Request-Id");
  expect(id).toBeTruthy();
  expect(id).toMatch(UUID_RE);
  expect(id!.toLowerCase()).not.toContain("bearer");
  expect(id!.toLowerCase()).not.toContain("token");
  expect(id!).not.toContain(TOKEN);
  return id!;
}

function expectSanitizedUnauthorized(res: Response): void {
  expect(res.status).toBe(401);
  expect(res.headers.get("WWW-Authenticate")).toBe("Bearer");
  expectServerRequestId(res);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Worker fetch — authentication + ingest", () => {
  it("AUTH-1: GET /health returns ok without Authorization", async () => {
    const res = await worker.fetch(
      new Request("https://example.test/health"),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("AUTH-2: POST /v1/turns missing Authorization returns sanitized 401", async () => {
    const res = await postTurns({
      headers: { "content-type": "application/json" },
    });
    expectSanitizedUnauthorized(res);
    const body = (await res.json()) as {
      error: { code: string; message: string; details?: unknown };
    };
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.message).toBe("Unauthorized");
    expect(body.error.details).toBeUndefined();
    expect(JSON.stringify(body).toLowerCase()).not.toContain("token");
  });

  it("AUTH-3: POST /v1/turns wrong Bearer token returns sanitized 401", async () => {
    const res = await postTurns({ headers: authHeaders("wrong-token") });
    expectSanitizedUnauthorized(res);
    const body = (await res.json()) as {
      error: { code: string; message: string; details?: unknown };
    };
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.message).toBe("Unauthorized");
    expect(body.error.details).toBeUndefined();
  });

  it("AUTH-4: POST /v1/turns Basic scheme returns sanitized 401", async () => {
    const res = await postTurns({
      headers: authHeaders(TOKEN, "Basic dXNlcjpwYXNz"),
    });
    expectSanitizedUnauthorized(res);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.message).toBe("Unauthorized");
  });

  it("AUTH-5: POST /v1/turns valid Bearer returns UploadResponse skeleton", async () => {
    const res = await postTurns();
    expect(res.status).toBe(200);
    expectServerRequestId(res);
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

  it("AUTH-6: invalid auth + invalid JSON yields 401 not INVALID_JSON", async () => {
    const res = await postTurns({
      headers: { "content-type": "application/json" },
      body: "{not-json",
    });
    expectSanitizedUnauthorized(res);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("AUTH-7: valid Bearer + invalid JSON returns INVALID_JSON", async () => {
    const res = await postTurns({ body: "{not-json" });
    expect(res.status).toBe(400);
    expectServerRequestId(res);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_JSON");
  });

  it("AUTH-8: valid Bearer + empty turns returns VALIDATION_ERROR", async () => {
    const res = await postTurns({
      body: JSON.stringify({ ...validBody, turns: [] }),
    });
    expect(res.status).toBe(400);
    expectServerRequestId(res);
    const body = (await res.json()) as { error: { code: string; details?: unknown } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("AUTH-9: ignores client-supplied X-Request-Id", async () => {
    const res = await postTurns({
      headers: {
        ...authHeaders(),
        "X-Request-Id": "client-injected-id",
      },
    });
    expect(res.status).toBe(200);
    const id = expectServerRequestId(res);
    expect(id).not.toBe("client-injected-id");
  });

  it("AUTH-10: missing CAPTURE_API_TOKEN fails closed with sanitized 500", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await postTurns({
      env: { CAPTURE_API_TOKEN: "", DB: env.DB },
      body: "{not-json",
    });
    expect(res.status).toBe(500);
    expectServerRequestId(res);
    const body = (await res.json()) as {
      error: { code: string; message: string; details?: unknown };
    };
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("Unexpected server error");
    expect(body.error.details).toBeUndefined();
    const serialized = JSON.stringify(body).toLowerCase();
    expect(serialized).not.toContain("token");
    expect(serialized).not.toContain("capture");
    expect(serialized).not.toContain("configuration");
    expect(body.error.code).not.toBe("INVALID_JSON");
    expect(spy).toHaveBeenCalledWith("AUTH_CONFIGURATION_MISSING");
  });

  it("AUTH-11: accepts bearer / BEARER scheme casing", async () => {
    for (const authorization of [
      `bearer ${TOKEN}`,
      `BEARER ${TOKEN}`,
      `BeArEr ${TOKEN}`,
    ]) {
      const res = await postTurns({ headers: authHeaders(TOKEN, authorization) });
      expect(res.status).toBe(200);
      expectServerRequestId(res);
    }
  });

  it("AUTH-12: accepts extra spaces and trailing header whitespace", async () => {
    const res = await postTurns({
      headers: authHeaders(TOKEN, `Bearer    ${TOKEN}  `),
    });
    expect(res.status).toBe(200);
    expectServerRequestId(res);
  });

  it("AUTH-13: empty Bearer token returns sanitized 401", async () => {
    for (const authorization of ["Bearer", "Bearer ", "Bearer   "]) {
      const res = await postTurns({ headers: authHeaders(TOKEN, authorization) });
      expectSanitizedUnauthorized(res);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("UNAUTHORIZED");
    }
  });

  it("AUTH-14: Token and other unsupported schemes return sanitized 401", async () => {
    for (const authorization of [`Token ${TOKEN}`, `Digest ${TOKEN}`, TOKEN]) {
      const res = await postTurns({ headers: authHeaders(TOKEN, authorization) });
      expectSanitizedUnauthorized(res);
    }
  });

  it("AUTH-15: combined Authorization values return sanitized 401", async () => {
    const res = await postTurns({
      headers: authHeaders(TOKEN, `Bearer ${TOKEN}, Bearer other`),
    });
    expectSanitizedUnauthorized(res);
  });

  it("DB-2 (route): re-uploading the same batch reports duplicates", async () => {
    const first = await postTurns();
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { accepted: number; duplicate: number };
    expect(firstBody).toMatchObject({ accepted: 1, duplicate: 0 });

    const second = await postTurns();
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { accepted: number; duplicate: number };
    expect(secondBody).toMatchObject({ accepted: 0, duplicate: 1 });
  });

  it("DB-7 (route): missing DB binding returns sanitized 500 after auth", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await postTurns({ env: { CAPTURE_API_TOKEN: TOKEN } });
    expect(res.status).toBe(500);
    expectServerRequestId(res);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("Unexpected server error");
    expect(spy).toHaveBeenCalledWith("DB_CONFIGURATION_MISSING");
  });

  it("READ (route): list + turns round-trip after ingest", async () => {
    const post = await postTurns();
    expect(post.status).toBe(200);

    const list = await worker.fetch(
      new Request("https://example.test/v1/conversations", {
        headers: authHeaders(),
      }),
      env,
    );
    expect(list.status).toBe(200);
    expectServerRequestId(list);
    const listBody = (await list.json()) as {
      conversations: Array<{
        conversation_id: string;
        turn_count: number;
        last_turn_at: string;
      }>;
      server_time: string;
    };
    expect(listBody.conversations).toHaveLength(1);
    expect(listBody.conversations[0]).toMatchObject({
      conversation_id: "conv-1",
      turn_count: 1,
    });
    // READ-4: summaries only — no turn content in the list response.
    expect(JSON.stringify(listBody)).not.toContain("Hi there");

    const turns = await worker.fetch(
      new Request("https://example.test/v1/conversations/conv-1/turns", {
        headers: authHeaders(),
      }),
      env,
    );
    expect(turns.status).toBe(200);
    expectServerRequestId(turns);
    const turnsBody = (await turns.json()) as {
      conversation_id: string;
      turns: Array<{ client_turn_id: string; text: string; turn_id: string }>;
    };
    expect(turnsBody.conversation_id).toBe("conv-1");
    expect(turnsBody.turns).toHaveLength(1);
    expect(turnsBody.turns[0]).toMatchObject({
      client_turn_id: "turn-1",
      text: "Hi there",
    });
    expect(turnsBody.turns[0]!.turn_id).toMatch(UUID_RE);
  });

  it("READ (route): URL-encoded conversation id is decoded before lookup", async () => {
    const body = JSON.stringify({
      ...validBody,
      conversation: { ...validBody.conversation, conversation_id: "conv 1" },
    });
    const post = await postTurns({ body });
    expect(post.status).toBe(200);

    const turns = await worker.fetch(
      new Request("https://example.test/v1/conversations/conv%201/turns", {
        headers: authHeaders(),
      }),
      env,
    );
    expect(turns.status).toBe(200);
    const turnsBody = (await turns.json()) as { conversation_id: string };
    expect(turnsBody.conversation_id).toBe("conv 1");
  });

  it("READ-6 (route): unknown conversation returns sanitized 404", async () => {
    const res = await worker.fetch(
      new Request("https://example.test/v1/conversations/missing/turns", {
        headers: authHeaders(),
      }),
      env,
    );
    expect(res.status).toBe(404);
    expectServerRequestId(res);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("READ-7 (route): both read routes require auth before any DB access", async () => {
    // env deliberately has no DB binding: a 401 (not 500) proves auth ran first.
    const noDbEnv: Env = { CAPTURE_API_TOKEN: TOKEN };
    for (const path of [
      "/v1/conversations",
      "/v1/conversations/conv-1/turns",
    ]) {
      const res = await worker.fetch(
        new Request(`https://example.test${path}`, {
          headers: authHeaders("wrong-token"),
        }),
        noDbEnv,
      );
      expectSanitizedUnauthorized(res);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("UNAUTHORIZED");
    }
  });

  it("READ-8 (route): missing DB binding returns sanitized 500 after auth", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await worker.fetch(
      new Request("https://example.test/v1/conversations", {
        headers: authHeaders(),
      }),
      { CAPTURE_API_TOKEN: TOKEN },
    );
    expect(res.status).toBe(500);
    expectServerRequestId(res);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("Unexpected server error");
    expect(spy).toHaveBeenCalledWith("DB_CONFIGURATION_MISSING");
  });

  it("READ-9 (route): POST /v1/conversations returns 405 with X-Request-Id", async () => {
    const res = await worker.fetch(
      new Request("https://example.test/v1/conversations", {
        method: "POST",
        headers: authHeaders(),
      }),
      env,
    );
    expect(res.status).toBe(405);
    expectServerRequestId(res);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("METHOD_NOT_ALLOWED");
  });

  it("GET /v1/turns returns 405 with X-Request-Id", async () => {
    const res = await worker.fetch(
      new Request("https://example.test/v1/turns", { method: "GET" }),
      env,
    );
    expect(res.status).toBe(405);
    expectServerRequestId(res);
  });

  it("unknown route returns NOT_FOUND", async () => {
    const res = await worker.fetch(
      new Request("https://example.test/nope"),
      env,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });
});
