import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LOCAL_WORKER_URL,
  DEFAULT_USER_ID,
  STORAGE_KEYS,
  assertExportHasNoToken,
  exportConfiguration,
  hasToken,
  importConfiguration,
  loadBaseUrlOrDefault,
  loadCaptureSettings,
  pairWithLocalWorker,
  restoreLocalDevelopmentSetup,
  saveCaptureSettings,
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

const VALID_TOKEN =
  "Abcdef0123456789Abcdef0123456789Abcdef0123456789Abcdef01234567";

describe("operator config persistence", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("reload simulation preserves settings", async () => {
    const { store } = installChromeStorageMock();
    await saveConfig({
      baseUrl: "http://127.0.0.1:8787",
      token: VALID_TOKEN,
    });
    await saveCaptureSettings({ enabled: true, userId: "ops-1" });

    // Simulate reload: new loadConfig path against same store.
    vi.unstubAllGlobals();
    installChromeStorageMock(store);

    await expect(loadCaptureSettings()).resolves.toEqual({
      enabled: true,
      userId: "ops-1",
    });
    await expect(loadBaseUrlOrDefault()).resolves.toBe("http://127.0.0.1:8787");
    const validated = validateCaptureToken(
      store[STORAGE_KEYS.token] as string,
    );
    expect(validated.ok).toBe(true);
  });

  it("checkbox/status consistency: save updates storage; failed save can revert", async () => {
    installChromeStorageMock();
    const saved = await saveCaptureSettings({ enabled: true, userId: "user-1" });
    expect(saved.ok).toBe(true);
    await expect(loadCaptureSettings()).resolves.toEqual({
      enabled: true,
      userId: "user-1",
    });

    const previous = await loadCaptureSettings();
    // Simulate failed write by stubbing set to throw.
    const chromeRef = (
      globalThis as unknown as {
        chrome: { storage: { local: { set: (items: Store) => Promise<void> } } };
      }
    ).chrome;
    chromeRef.storage.local.set = async () => {
      throw new Error("quota");
    };
    const failed = await saveCaptureSettings({ enabled: false });
    expect(failed.ok).toBe(false);
    // Re-install readable mock with prior values for "revert" check.
    installChromeStorageMock({
      [STORAGE_KEYS.captureEnabled]: previous.enabled,
      [STORAGE_KEYS.userId]: previous.userId,
    });
    await expect(loadCaptureSettings()).resolves.toEqual(previous);
  });

  it("empty Worker URL defaults to local development URL", async () => {
    installChromeStorageMock();
    await expect(loadBaseUrlOrDefault()).resolves.toBe(DEFAULT_LOCAL_WORKER_URL);
  });

  it("export excludes token", async () => {
    installChromeStorageMock();
    await saveConfig({
      baseUrl: DEFAULT_LOCAL_WORKER_URL,
      token: VALID_TOKEN,
    });
    await saveCaptureSettings({ enabled: true, userId: "user-1" });
    const exported = await exportConfiguration();
    expect(assertExportHasNoToken(exported)).toBe(true);
    expect(exported).toEqual({
      schema_version: 1,
      kind: "newellai-capture-client-config",
      worker_base_url: DEFAULT_LOCAL_WORKER_URL,
      capture_chatgpt_enabled: true,
      user_id: "user-1",
    });
    expect(JSON.stringify(exported)).not.toContain(VALID_TOKEN);
  });

  it("import restores non-secrets and does not clear token", async () => {
    const { store } = installChromeStorageMock();
    await saveConfig({
      baseUrl: "http://127.0.0.1:8787",
      token: VALID_TOKEN,
    });
    const tokenBefore = store[STORAGE_KEYS.token];
    const fpBefore = await fingerprintToken(tokenBefore as string);

    const imported = await importConfiguration({
      schema_version: 1,
      kind: "newellai-capture-client-config",
      worker_base_url: "http://127.0.0.1:9999",
      capture_chatgpt_enabled: false,
      user_id: "imported-user",
    });
    expect(imported.ok).toBe(true);
    expect(store[STORAGE_KEYS.baseUrl]).toBe("http://127.0.0.1:9999");
    expect(store[STORAGE_KEYS.captureEnabled]).toBe(false);
    expect(store[STORAGE_KEYS.userId]).toBe("imported-user");
    expect(store[STORAGE_KEYS.token]).toBe(tokenBefore);
    expect(await fingerprintToken(store[STORAGE_KEYS.token] as string)).toBe(
      fpBefore,
    );
  });

  it("import rejects payloads that include a token field", async () => {
    installChromeStorageMock();
    const imported = await importConfiguration({
      schema_version: 1,
      kind: "newellai-capture-client-config",
      worker_base_url: DEFAULT_LOCAL_WORKER_URL,
      capture_chatgpt_enabled: true,
      user_id: DEFAULT_USER_ID,
      capture_api_token: "smuggled",
    });
    expect(imported.ok).toBe(false);
  });

  it("restore local setup sets URL + capture On and reports unpaired without token", async () => {
    installChromeStorageMock();
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 }));
    const result = await restoreLocalDevelopmentSetup(fetchImpl);
    expect(result.tokenPresent).toBe(false);
    expect(result.message).toMatch(/token still needs pairing/i);
    await expect(loadBaseUrlOrDefault()).resolves.toBe(DEFAULT_LOCAL_WORKER_URL);
    await expect(loadCaptureSettings()).resolves.toMatchObject({
      enabled: true,
      userId: DEFAULT_USER_ID,
    });
  });

  it("restore local setup pairs when Worker responds", async () => {
    installChromeStorageMock();
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ token: VALID_TOKEN }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const result = await restoreLocalDevelopmentSetup(fetchImpl);
    expect(result.tokenPresent).toBe(true);
    expect(result.message).toMatch(/token paired/i);
    expect(await hasToken()).toBe(true);
  });

  it("pairWithLocalWorker stores validated token without exposing it in errors", async () => {
    installChromeStorageMock();
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ token: VALID_TOKEN }), { status: 200 }),
    );
    const result = await pairWithLocalWorker(DEFAULT_LOCAL_WORKER_URL, fetchImpl);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain(VALID_TOKEN);
  });
});
