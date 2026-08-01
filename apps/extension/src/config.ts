import type { SyncConfig } from "./queue/sync";

/**
 * Configuration lives in chrome.storage.local (ADR-0006): the token is never
 * placed in chrome.storage.sync and never bundled into the build.
 */

const KEYS = { baseUrl: "worker_base_url", token: "capture_api_token" } as const;

export async function loadConfig(): Promise<SyncConfig | null> {
  const stored = await chrome.storage.local.get([KEYS.baseUrl, KEYS.token]);
  const baseUrl = stored[KEYS.baseUrl];
  const token = stored[KEYS.token];
  if (typeof baseUrl !== "string" || baseUrl.length === 0) return null;
  if (typeof token !== "string" || token.length === 0) return null;
  return { baseUrl, token };
}

export async function saveConfig(config: SyncConfig): Promise<void> {
  await chrome.storage.local.set({
    [KEYS.baseUrl]: config.baseUrl.trim(),
    [KEYS.token]: config.token.trim(),
  });
}

/** For the options form: base URL is shown; the token is never read back out. */
export async function loadBaseUrl(): Promise<string> {
  const stored = await chrome.storage.local.get(KEYS.baseUrl);
  const value = stored[KEYS.baseUrl];
  return typeof value === "string" ? value : "";
}

export async function hasToken(): Promise<boolean> {
  const stored = await chrome.storage.local.get(KEYS.token);
  const value = stored[KEYS.token];
  return typeof value === "string" && value.length > 0;
}
