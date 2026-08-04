import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_USER_ID,
  STORAGE_KEYS,
  loadCaptureSettings,
  saveCaptureSettings,
} from "../config";

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

describe("capture settings", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults capture Off and user-1", async () => {
    installChromeStorageMock();
    await expect(loadCaptureSettings()).resolves.toEqual({
      enabled: false,
      userId: DEFAULT_USER_ID,
    });
  });

  it("persists enablement and user_id", async () => {
    const { store } = installChromeStorageMock();
    await saveCaptureSettings({ enabled: true, userId: "ops-9" });
    expect(store[STORAGE_KEYS.captureEnabled]).toBe(true);
    expect(store[STORAGE_KEYS.userId]).toBe("ops-9");
    await expect(loadCaptureSettings()).resolves.toEqual({
      enabled: true,
      userId: "ops-9",
    });
  });
});
