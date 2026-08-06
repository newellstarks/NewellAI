import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestD1 } from "../../db/testD1";
import type { Env } from "../../env";
import worker from "../../index";
import {
  SEARCH_LIMIT_MAX,
  SEARCH_QUERY_MAX,
  SEARCH_QUERY_MIN,
} from "../../db/search";

const TOKEN = "test-capture-token";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_ROOT = path.resolve(__dirname, "../../../public");

function createAssetsFetcher(): Fetcher {
  return {
    fetch(input: RequestInfo | URL) {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url,
      );
      let pathname = url.pathname;
      if (pathname === "/recall" || pathname === "/recall/") {
        pathname = "/recall/index.html";
      }
      const filePath = path.join(PUBLIC_ROOT, pathname.replace(/^\//, ""));
      try {
        const body = readFileSync(filePath);
        const type = pathname.endsWith(".css")
          ? "text/css"
          : pathname.endsWith(".js")
            ? "text/javascript"
            : "text/html";
        return Promise.resolve(
          new Response(body, {
            status: 200,
            headers: { "content-type": type },
          }),
        );
      } catch {
        return Promise.resolve(new Response("missing", { status: 404 }));
      }
    },
  } as Fetcher;
}

let env: Env;

beforeEach(() => {
  env = {
    CAPTURE_API_TOKEN: TOKEN,
    DB: createTestD1().d1,
    ASSETS: createAssetsFetcher(),
    ARTIFACT_STORAGE_MODE: "memory",
  };
});

function authHeaders(token = TOKEN): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

async function postTurns(
  text: string,
  conversationId: string,
  clientTurnId: string,
  capturedAt?: string,
): Promise<Response> {
  return worker.fetch(
    new Request("https://example.test/v1/turns", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({
        conversation: {
          conversation_id: conversationId,
          user_id: "user-1",
          title: `Title ${conversationId}`,
        },
        capture: { capture_client: "manual" },
        turns: [
          {
            client_turn_id: clientTurnId,
            speaker: "user",
            text,
            ...(capturedAt !== undefined ? { captured_at: capturedAt } : {}),
          },
        ],
      }),
    }),
    env,
  );
}

describe("GET /v1/search", () => {
  it("finds literal case-insensitive matches with bounded snippets", async () => {
    await postTurns(
      `${"a".repeat(90)}UniquePhraseZZ${"b".repeat(90)}`,
      "conv-s1",
      "ct-1",
    );
    const res = await worker.fetch(
      new Request("https://example.test/v1/search?q=uniquephrasezz", {
        headers: authHeaders(),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      query: string;
      hits: Array<{ snippet: string; turn_id: string; text?: string }>;
    };
    expect(body.query).toBe("uniquephrasezz");
    expect(body.hits).toHaveLength(1);
    expect(body.hits[0]!.snippet).toContain("UniquePhraseZZ");
    expect(body.hits[0]!.snippet.length).toBeLessThan(200);
    expect(JSON.stringify(body.hits[0])).not.toContain("text");
    expect(body.hits[0]!.snippet.startsWith("…")).toBe(true);
  });

  it("treats %, _, and backslash as literals when escaped for LIKE", async () => {
    await postTurns("progress 100%_complete now", "conv-s2", "ct-2");
    await postTurns("progress 100Xcomplete now", "conv-s2b", "ct-2b");
    await postTurns("path C:\\temp\\file", "conv-s2c", "ct-2c");

    const res = await worker.fetch(
      new Request(
        `https://example.test/v1/search?q=${encodeURIComponent("100%_")}`,
        { headers: authHeaders() },
      ),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      hits: Array<{ conversation_id: string; snippet: string }>;
    };
    expect(body.hits).toHaveLength(1);
    expect(body.hits[0]!.conversation_id).toBe("conv-s2");
    expect(body.hits[0]!.snippet).toContain("100%_");

    const slash = await worker.fetch(
      new Request(
        `https://example.test/v1/search?q=${encodeURIComponent("C:\\temp")}`,
        { headers: authHeaders() },
      ),
      env,
    );
    expect(slash.status).toBe(200);
    const slashBody = (await slash.json()) as {
      hits: Array<{ conversation_id: string; snippet: string }>;
    };
    expect(slashBody.hits).toHaveLength(1);
    expect(slashBody.hits[0]!.conversation_id).toBe("conv-s2c");
  });

  it("rejects queries below minimum and above maximum length", async () => {
    const short = await worker.fetch(
      new Request(
        `https://example.test/v1/search?q=${"x".repeat(SEARCH_QUERY_MIN - 1)}`,
        { headers: authHeaders() },
      ),
      env,
    );
    expect(short.status).toBe(400);

    const long = await worker.fetch(
      new Request(
        `https://example.test/v1/search?q=${"y".repeat(SEARCH_QUERY_MAX + 1)}`,
        { headers: authHeaders() },
      ),
      env,
    );
    expect(long.status).toBe(400);
  });

  it("caps limit server-side and orders created_at DESC, turn_id ASC", async () => {
    for (let i = 0; i < 3; i++) {
      await postTurns(`shared-token-${i}`, "conv-order", `ct-o-${i}`);
    }
    const res = await worker.fetch(
      new Request(
        `https://example.test/v1/search?q=shared-token&limit=${SEARCH_LIMIT_MAX + 100}`,
        { headers: authHeaders() },
      ),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      hits: Array<{ client_turn_id: string; created_at: string; turn_id: string }>;
    };
    expect(body.hits.length).toBeLessThanOrEqual(SEARCH_LIMIT_MAX);
    expect(body.hits.length).toBe(3);
    for (let i = 1; i < body.hits.length; i++) {
      const prev = body.hits[i - 1]!;
      const cur = body.hits[i]!;
      const cmp = prev.created_at.localeCompare(cur.created_at);
      expect(cmp > 0 || (cmp === 0 && prev.turn_id <= cur.turn_id)).toBe(true);
    }
  });

  it("returns empty hits when nothing matches", async () => {
    await postTurns("hello world", "conv-empty", "ct-e");
    const res = await worker.fetch(
      new Request("https://example.test/v1/search?q=nomatchzzz", {
        headers: authHeaders(),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { hits: unknown[] };
    expect(body.hits).toEqual([]);
  });

  it("rejects unauthorized search", async () => {
    const res = await worker.fetch(
      new Request("https://example.test/v1/search?q=hello"),
      env,
    );
    expect(res.status).toBe(401);
  });
});

describe("GET /v1/status", () => {
  it("returns seeded counts and timestamps", async () => {
    await postTurns("status turn", "conv-st", "ct-st");
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const digest = await crypto.subtle.digest("SHA-256", png);
    const sha = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const created = await worker.fetch(
      new Request("https://example.test/v1/artifacts", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          client_artifact_id: "file_status_1",
          conversation_id: "conv-st",
          user_id: "user-1",
          client_turn_id: "ct-st",
          direction: "user_uploaded",
          artifact_type: "image",
          mime_type: "image/png",
          declared_sha256: sha,
          declared_byte_size: png.byteLength,
          image_provenance: "uploaded",
          capture: { capture_client: "manual" },
        }),
      }),
      env,
    );
    expect(created.status).toBe(200);
    const createdBody = (await created.json()) as { artifact_id: string };
    const put = await worker.fetch(
      new Request(
        `https://example.test/v1/artifacts/${createdBody.artifact_id}/content`,
        {
          method: "PUT",
          headers: {
            "content-type": "application/octet-stream",
            ...authHeaders(),
          },
          body: png,
        },
      ),
      env,
    );
    expect(put.status).toBe(200);

    const res = await worker.fetch(
      new Request("https://example.test/v1/status", {
        headers: authHeaders(),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      conversation_count: number;
      turn_count: number;
      artifacts: {
        stored: number;
        pending_download: number;
        failed_download: number;
        other: number;
        bytes_missing: number;
      };
      storage: { mode: string; root: string | null; available: boolean };
      last_turn_at: string | null;
      last_artifact_at: string | null;
    };
    expect(body.conversation_count).toBeGreaterThanOrEqual(1);
    expect(body.turn_count).toBeGreaterThanOrEqual(1);
    expect(body.artifacts.stored).toBeGreaterThanOrEqual(1);
    expect(body.artifacts.bytes_missing).toBe(0);
    expect(body.storage.mode).toBe("memory");
    expect(body.storage.root).toBeNull();
    expect(body.storage.available).toBe(true);
    expect(body.last_turn_at).toBeTruthy();
    expect(body.last_artifact_at).toBeTruthy();
  });

  it("rejects unauthorized status", async () => {
    const res = await worker.fetch(
      new Request("https://example.test/v1/status"),
      env,
    );
    expect(res.status).toBe(401);
  });
});

describe("Recall static + artifact content", () => {
  it("serves /recall/ UI assets", async () => {
    const res = await worker.fetch(
      new Request("https://example.test/recall/"),
      env,
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("NewellAI Recall");
    expect(html).not.toContain("CAPTURE_API_TOKEN=");
  });

  it("reads artifact content with auth after store", async () => {
    await postTurns("img turn", "conv-img", "ct-img");
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const digest = await crypto.subtle.digest("SHA-256", png);
    const sha = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const created = await worker.fetch(
      new Request("https://example.test/v1/artifacts", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          client_artifact_id: "file_img_1",
          conversation_id: "conv-img",
          user_id: "user-1",
          client_turn_id: "ct-img",
          direction: "user_uploaded",
          artifact_type: "image",
          mime_type: "image/png",
          declared_sha256: sha,
          declared_byte_size: png.byteLength,
          capture: { capture_client: "manual" },
        }),
      }),
      env,
    );
    const { artifact_id } = (await created.json()) as { artifact_id: string };
    await worker.fetch(
      new Request(`https://example.test/v1/artifacts/${artifact_id}/content`, {
        method: "PUT",
        headers: {
          "content-type": "application/octet-stream",
          ...authHeaders(),
        },
        body: png,
      }),
      env,
    );
    const get = await worker.fetch(
      new Request(`https://example.test/v1/artifacts/${artifact_id}/content`, {
        headers: authHeaders(),
      }),
      env,
    );
    expect(get.status).toBe(200);
    const bytes = new Uint8Array(await get.arrayBuffer());
    expect([...bytes]).toEqual([...png]);
  });
});
