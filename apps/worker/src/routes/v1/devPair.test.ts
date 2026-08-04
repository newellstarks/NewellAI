import { beforeEach, describe, expect, it } from "vitest";
import type { Env } from "../../env";
import worker from "../../index";
import { resetPairingStateForTests } from "../../pairingState";

const TOKEN = "Abcdef0123456789Abcdef0123456789Abcdef0123456789Abcdef01234567";
// Chrome extension IDs are 32 chars from the set a–p only.
const EXT_ID = "abcdefghijklmnopabcdefghijklmnop";
const ORIGIN = `chrome-extension://${EXT_ID}`;

function pairEnv(overrides: Partial<Env> = {}): Env {
  return {
    CAPTURE_API_TOKEN: TOKEN,
    ALLOW_LOCAL_PAIRING: "true",
    PAIRING_EXTENSION_ORIGIN: ORIGIN,
    ...overrides,
  };
}

async function pairRequest(
  init: {
    url?: string;
    method?: string;
    origin?: string | null;
    env?: Env;
  } = {},
): Promise<Response> {
  const headers = new Headers();
  if (init.origin !== null) {
    headers.set("Origin", init.origin ?? ORIGIN);
  }
  return worker.fetch(
    new Request(init.url ?? "http://127.0.0.1:8787/v1/dev/pair", {
      method: init.method ?? "POST",
      headers,
    }),
    init.env ?? pairEnv(),
  );
}

describe("POST /v1/dev/pair", () => {
  beforeEach(() => {
    resetPairingStateForTests();
  });

  it("succeeds once on loopback with matching origin", async () => {
    const res = await pairRequest();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    const body = (await res.json()) as { token: string };
    expect(body.token).toBe(TOKEN);

    const second = await pairRequest();
    expect(second.status).toBe(403);
  });

  it("answers OPTIONS preflight for the exact origin", async () => {
    const res = await pairRequest({ method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });

  it("rejects when pairing flag is off", async () => {
    const res = await pairRequest({
      env: pairEnv({ ALLOW_LOCAL_PAIRING: "false" }),
    });
    expect(res.status).toBe(404);
  });

  it("rejects non-loopback hosts", async () => {
    const res = await pairRequest({
      url: "https://example.test/v1/dev/pair",
    });
    expect(res.status).toBe(404);
  });

  it("rejects missing Origin, Origin null, web origins, other extensions", async () => {
    expect((await pairRequest({ origin: null })).status).toBe(403);
    expect((await pairRequest({ origin: "null" })).status).toBe(403);
    expect((await pairRequest({ origin: "https://evil.example" })).status).toBe(
      403,
    );
    expect(
      (
        await pairRequest({
          origin: "chrome-extension://ppppppppppppppppaaaaaaaaaaaaaaaa",
        })
      ).status,
    ).toBe(403);
  });

  it("rejects GET", async () => {
    const res = await pairRequest({ method: "GET" });
    expect(res.status).toBe(405);
  });

  it("does not use wildcard CORS", async () => {
    const res = await pairRequest();
    expect(res.headers.get("Access-Control-Allow-Origin")).not.toBe("*");
  });
});
