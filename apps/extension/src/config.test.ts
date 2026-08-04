import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLIPBOARD_EMPTY_MESSAGE,
  CLIPBOARD_PERMISSION_MESSAGE,
  STORAGE_KEYS,
  importTokenFromClipboard,
  loadConfig,
  replaceTokenFieldValue,
  saveConfig,
} from "./config";
import { fingerprintToken, validateCaptureToken } from "./token";

type Store = Record<string, unknown>;

function installChromeStorageMock(initial: Store = {}): { store: Store } {
  const store: Store = { ...initial };
  const chromeMock = {
    storage: {
      local: {
        async get(
          keys: string | string[] | Record<string, unknown> | null,
        ): Promise<Store> {
          if (keys === null || keys === undefined) return { ...store };
          const list = Array.isArray(keys)
            ? keys
            : typeof keys === "string"
              ? [keys]
              : Object.keys(keys);
          const out: Store = {};
          for (const key of list) {
            if (key in store) out[key] = store[key];
          }
          return out;
        },
        async set(items: Store): Promise<void> {
          Object.assign(store, items);
        },
        async remove(keys: string | string[]): Promise<void> {
          const list = Array.isArray(keys) ? keys : [keys];
          for (const key of list) delete store[key];
        },
      },
    },
  };
  vi.stubGlobal("chrome", chromeMock);
  return { store };
}

describe("saveConfig / loadConfig round-trip identity", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores exactly the normalized token and reloads the same value", async () => {
    const { store } = installChromeStorageMock();
    const raw = "  Abcdef0123456789Abcdef0123456789Abcdef0123456789Abcdef01234567  ";
    const validated = validateCaptureToken(raw);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const expectedFp = await fingerprintToken(validated.token);
    const saved = await saveConfig({
      baseUrl: " http://127.0.0.1:8787 ",
      token: raw,
    });
    expect(saved).toEqual({ ok: true });

    const storedToken = store[STORAGE_KEYS.token];
    expect(typeof storedToken).toBe("string");
    expect(storedToken).toBe(validated.token);
    expect(storedToken).not.toBe(raw); // edges trimmed, interior unchanged
    expect(await fingerprintToken(storedToken as string)).toBe(expectedFp);

    const loaded = await loadConfig();
    expect(loaded.status).toBe("ready");
    if (loaded.status !== "ready") return;
    expect(loaded.config.token).toBe(validated.token);
    expect(loaded.config.baseUrl).toBe("http://127.0.0.1:8787");
    expect(await fingerprintToken(loaded.config.token)).toBe(expectedFp);
  });

  it("fails verification when storage returns a different secret", async () => {
    const { store } = installChromeStorageMock();
    const originalSet = chrome.storage.local.set.bind(chrome.storage.local);
    chrome.storage.local.set = async (items: Store) => {
      await originalSet(items);
      // Simulate password-manager / storage corruption after write.
      store[STORAGE_KEYS.token] = "tampered-token-value-not-the-original!!!!";
    };

    const saved = await saveConfig({
      baseUrl: "http://127.0.0.1:8787",
      token: "a".repeat(64),
    });
    expect(saved.ok).toBe(false);
    if (saved.ok) return;
    expect(saved.message).toBe("token storage verification failed — re-enter token");
    expect(saved.message).not.toContain("a".repeat(8));
    // Bad token must not remain stored after failed verification.
    expect(store[STORAGE_KEYS.token]).toBeUndefined();
  });

  it("never includes the token in save failure messages", async () => {
    installChromeStorageMock();
    const secret = "super-secret-token-value-0123456789abcdef!!!!";
    const saved = await saveConfig({
      baseUrl: "http://127.0.0.1:8787",
      token: `bad\n${secret}`,
    });
    expect(saved.ok).toBe(false);
    if (saved.ok) return;
    expect(JSON.stringify(saved)).not.toContain(secret);
  });
});

describe("importTokenFromClipboard", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("imports an exact clipboard token and verifies storage fingerprint", async () => {
    const { store } = installChromeStorageMock({
      [STORAGE_KEYS.baseUrl]: "http://127.0.0.1:8787",
    });
    const clipboardToken = "B".repeat(64);
    const expectedFp = await fingerprintToken(clipboardToken);

    const result = await importTokenFromClipboard(
      "http://127.0.0.1:8787",
      async () => `  ${clipboardToken}  `,
    );
    expect(result).toEqual({ ok: true });
    expect(store[STORAGE_KEYS.token]).toBe(clipboardToken);
    expect(await fingerprintToken(store[STORAGE_KEYS.token] as string)).toBe(
      expectedFp,
    );

    const loaded = await loadConfig();
    expect(loaded.status).toBe("ready");
    if (loaded.status !== "ready") return;
    expect(loaded.config.token).toBe(clipboardToken);
    expect(JSON.stringify(result)).not.toContain(clipboardToken);
  });

  it("rejects invalid clipboard content without storing or leaking it", async () => {
    const { store } = installChromeStorageMock();
    const bad = "not-a-valid\ntoken-secret-value";
    const result = await importTokenFromClipboard(
      "http://127.0.0.1:8787",
      async () => bad,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe("invalid token characters — re-enter token");
    expect(store[STORAGE_KEYS.token]).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain(bad);
    expect(JSON.stringify(result)).not.toContain("token-secret");
  });

  it("reports a safe error when clipboard permission is denied", async () => {
    installChromeStorageMock();
    const result = await importTokenFromClipboard(
      "http://127.0.0.1:8787",
      async () => {
        throw new DOMException("Denied", "NotAllowedError");
      },
    );
    expect(result).toEqual({ ok: false, message: CLIPBOARD_PERMISSION_MESSAGE });
  });

  it("reports a safe error when clipboard is empty", async () => {
    installChromeStorageMock();
    const result = await importTokenFromClipboard(
      "http://127.0.0.1:8787",
      async () => "   ",
    );
    expect(result).toEqual({ ok: false, message: CLIPBOARD_EMPTY_MESSAGE });
  });

  it("fails fingerprint verification the same way as saveConfig", async () => {
    const { store } = installChromeStorageMock();
    const originalSet = chrome.storage.local.set.bind(chrome.storage.local);
    chrome.storage.local.set = async (items: Store) => {
      await originalSet(items);
      store[STORAGE_KEYS.token] = "tampered-after-clipboard-import!!!!!!!!";
    };
    const secret = "c".repeat(64);
    const result = await importTokenFromClipboard(
      "http://127.0.0.1:8787",
      async () => secret,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe("token storage verification failed — re-enter token");
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(store[STORAGE_KEYS.token]).toBeUndefined();
  });
});

describe("replaceTokenFieldValue", () => {
  it("replaces the entire field value and never appends", () => {
    const input = { value: "old-autofilled-secret" } as HTMLInputElement;
    replaceTokenFieldValue(input, "new-token-only");
    expect(input.value).toBe("new-token-only");
    replaceTokenFieldValue(input, "");
    expect(input.value).toBe("");
  });
});

describe("fingerprintToken", () => {
  it("is stable for identical input and differs when one character changes", async () => {
    const a = await fingerprintToken("same-token-value-0001");
    const b = await fingerprintToken("same-token-value-0001");
    const c = await fingerprintToken("same-token-value-0002");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
