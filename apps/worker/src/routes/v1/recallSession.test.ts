import { beforeEach, describe, expect, it } from "vitest";
import { createTestD1 } from "../../db/testD1";
import type { Env } from "../../env";
import worker from "../../index";
import {
  RECALL_SESSION_COOKIE,
  resetRecallSessionsForTests,
} from "../../recall/sessionState";

const TOKEN = "test-capture-token-for-recall-session";
let env: Env;

beforeEach(() => {
  resetRecallSessionsForTests();
  env = {
    CAPTURE_API_TOKEN: TOKEN,
    DB: createTestD1().d1,
    ALLOW_LOCAL_PAIRING: "true",
    ARTIFACT_STORAGE_MODE: "memory",
  };
});

function cookieFrom(res: Response): string | null {
  const set = res.headers.get("Set-Cookie");
  if (set === null) return null;
  const match = new RegExp(`${RECALL_SESSION_COOKIE}=([^;]+)`).exec(set);
  return match?.[1] ?? null;
}

describe("POST /v1/dev/recall/session", () => {
  it("mints HttpOnly SameSite=Strict session on loopback", async () => {
    const res = await worker.fetch(
      new Request("http://127.0.0.1:8787/v1/dev/recall/session", {
        method: "POST",
      }),
      env,
    );
    expect(res.status).toBe(200);
    const set = res.headers.get("Set-Cookie") ?? "";
    expect(set).toContain(`${RECALL_SESSION_COOKIE}=`);
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/SameSite=Strict/i);
    expect(set).toMatch(/Path=\//i);
    const body = (await res.json()) as { ok: boolean; token?: string };
    expect(body.ok).toBe(true);
    expect(body.token).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain(TOKEN);
  });

  it("rejects non-loopback mint as unavailable", async () => {
    const res = await worker.fetch(
      new Request("https://example.test/v1/dev/recall/session", {
        method: "POST",
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("rejects mint when pairing disabled", async () => {
    const res = await worker.fetch(
      new Request("http://127.0.0.1:8787/v1/dev/recall/session", {
        method: "POST",
      }),
      { ...env, ALLOW_LOCAL_PAIRING: "false" },
    );
    expect(res.status).toBe(404);
  });
});

describe("recall_read vs capture_full scopes", () => {
  async function mintCookie(): Promise<string> {
    const res = await worker.fetch(
      new Request("http://127.0.0.1:8787/v1/dev/recall/session", {
        method: "POST",
      }),
      env,
    );
    const raw = cookieFrom(res);
    expect(raw).toBeTruthy();
    return raw!;
  }

  it("read APIs succeed with recall_read cookie", async () => {
    const raw = await mintCookie();
    const conv = await worker.fetch(
      new Request("http://127.0.0.1:8787/v1/conversations", {
        headers: { Cookie: `${RECALL_SESSION_COOKIE}=${raw}` },
      }),
      env,
    );
    expect(conv.status).toBe(200);
  });

  it("write APIs reject recall_read", async () => {
    const raw = await mintCookie();
    const turns = await worker.fetch(
      new Request("http://127.0.0.1:8787/v1/turns", {
        method: "POST",
        headers: {
          Cookie: `${RECALL_SESSION_COOKIE}=${raw}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          conversation: {
            conversation_id: "c1",
            started_at: new Date().toISOString(),
          },
          capture: {
            capture_client: "chrome-extension",
            capture_client_version: "0.1.0",
            surface: "chatgpt",
          },
          turns: [],
        }),
      }),
      env,
    );
    expect(turns.status).toBe(401);

    const art = await worker.fetch(
      new Request("http://127.0.0.1:8787/v1/artifacts", {
        method: "POST",
        headers: {
          Cookie: `${RECALL_SESSION_COOKIE}=${raw}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          conversation_id: "c1",
          client_artifact_id: "file_x",
          direction: "user_uploaded",
          mime_type: "image/png",
          capture: {
            capture_client: "chrome-extension",
            capture_client_version: "0.1.0",
            surface: "chatgpt",
          },
        }),
      }),
      env,
    );
    expect(art.status).toBe(401);
  });

  it("Bearer capture auth unchanged for writes", async () => {
    const res = await worker.fetch(
      new Request("http://127.0.0.1:8787/v1/conversations", {
        headers: { Authorization: `Bearer ${TOKEN}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
  });

  it("Sign out revokes cookie access", async () => {
    const raw = await mintCookie();
    const revoke = await worker.fetch(
      new Request("http://127.0.0.1:8787/v1/dev/recall/session/revoke", {
        method: "POST",
        headers: { Cookie: `${RECALL_SESSION_COOKIE}=${raw}` },
      }),
      env,
    );
    expect(revoke.status).toBe(200);
    const clear = revoke.headers.get("Set-Cookie") ?? "";
    expect(clear).toMatch(/Max-Age=0/i);

    const conv = await worker.fetch(
      new Request("http://127.0.0.1:8787/v1/conversations", {
        headers: { Cookie: `${RECALL_SESSION_COOKIE}=${raw}` },
      }),
      env,
    );
    expect(conv.status).toBe(401);
  });

  it("Worker restart equivalent: reset sessions invalidates cookie", async () => {
    const raw = await mintCookie();
    resetRecallSessionsForTests();
    const conv = await worker.fetch(
      new Request("http://127.0.0.1:8787/v1/conversations", {
        headers: { Cookie: `${RECALL_SESSION_COOKIE}=${raw}` },
      }),
      env,
    );
    expect(conv.status).toBe(401);
  });
});
