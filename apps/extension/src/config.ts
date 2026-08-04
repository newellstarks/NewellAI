import type { SyncConfig, SyncConfigLoad } from "./queue/sync";
import { STORAGE_KEYS } from "./storage-keys";
import {
  TOKEN_STORAGE_MISMATCH_MESSAGE,
  fingerprintToken,
  validateCaptureToken,
} from "./token";
import {
  CONFIG_EXPORT_KIND,
  CONFIG_EXPORT_SCHEMA_VERSION,
  DEFAULT_LOCAL_WORKER_URL,
  DEFAULT_USER_ID,
  MAX_USER_ID_LENGTH,
} from "./capture/constants";

/**
 * Configuration lives in chrome.storage.local (ADR-0006): the token is never
 * placed in chrome.storage.sync and never bundled into the build.
 */

export { STORAGE_KEYS } from "./storage-keys";
export {
  DEFAULT_USER_ID,
  DEFAULT_LOCAL_WORKER_URL,
  CONFIG_EXPORT_KIND,
  CONFIG_EXPORT_SCHEMA_VERSION,
} from "./capture/constants";

export type LoadConfigResult = SyncConfigLoad;

export async function loadConfig(): Promise<LoadConfigResult> {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.baseUrl,
    STORAGE_KEYS.token,
  ]);
  const baseUrl = stored[STORAGE_KEYS.baseUrl];
  const token = stored[STORAGE_KEYS.token];
  if (typeof baseUrl !== "string" || baseUrl.trim().length === 0) {
    return { status: "missing" };
  }
  if (typeof token !== "string" || token.length === 0) {
    return { status: "missing" };
  }
  const validated = validateCaptureToken(token);
  if (!validated.ok) {
    return { status: "invalid_token" };
  }
  return {
    status: "ready",
    config: { baseUrl: baseUrl.trim(), token: validated.token },
  };
}

export type CaptureSettings = {
  enabled: boolean;
  userId: string;
};

/** Capture enablement defaults Off; user_id defaults to user-1. */
export async function loadCaptureSettings(): Promise<CaptureSettings> {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.captureEnabled,
    STORAGE_KEYS.userId,
  ]);
  const enabled = stored[STORAGE_KEYS.captureEnabled] === true;
  const rawUser = stored[STORAGE_KEYS.userId];
  let userId = DEFAULT_USER_ID;
  if (typeof rawUser === "string") {
    const trimmed = rawUser.trim();
    if (
      trimmed.length > 0 &&
      trimmed.length <= MAX_USER_ID_LENGTH &&
      !/[\u0000-\u001f\u007f]/.test(trimmed)
    ) {
      userId = trimmed;
    }
  }
  return { enabled, userId };
}

export type SaveCaptureResult = { ok: true } | { ok: false; message: string };

export async function saveCaptureSettings(
  settings: Partial<CaptureSettings>,
): Promise<SaveCaptureResult> {
  try {
    const patch: Record<string, unknown> = {};
    if (settings.enabled !== undefined) {
      patch[STORAGE_KEYS.captureEnabled] = settings.enabled === true;
    }
    if (settings.userId !== undefined) {
      const trimmed = settings.userId.trim();
      patch[STORAGE_KEYS.userId] =
        trimmed.length > 0 && trimmed.length <= MAX_USER_ID_LENGTH
          ? trimmed
          : DEFAULT_USER_ID;
    }
    if (Object.keys(patch).length > 0) {
      await chrome.storage.local.set(patch);
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "Failed to save capture settings" };
  }
}

export type SaveConfigResult = { ok: true } | { ok: false; message: string };

export const CLIPBOARD_PERMISSION_MESSAGE =
  "clipboard permission denied — allow clipboard access and try again";
export const CLIPBOARD_EMPTY_MESSAGE =
  "clipboard is empty — copy the token and try again";
export const PAIRING_FAILED_MESSAGE =
  "local pairing failed — is the Worker running with ALLOW_LOCAL_PAIRING?";
export const PAIRING_DISABLED_MESSAGE =
  "local pairing unavailable — check Worker env and extension Origin";
export const PAIRING_NETWORK_MESSAGE =
  "cannot reach local Worker — is wrangler dev running on the configured URL?";

export type ClipboardReader = () => Promise<string>;

/**
 * One-click import: read clipboard text, validate, store, fingerprint-verify.
 * Never returns or logs the token value.
 */
export async function importTokenFromClipboard(
  baseUrl: string,
  readClipboard: ClipboardReader = () => navigator.clipboard.readText(),
): Promise<SaveConfigResult> {
  let raw: string;
  try {
    raw = await readClipboard();
  } catch {
    return { ok: false, message: CLIPBOARD_PERMISSION_MESSAGE };
  }
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, message: CLIPBOARD_EMPTY_MESSAGE };
  }
  return saveConfig({ baseUrl, token: raw });
}

/**
 * Validate, store exactly the normalized token, then verify length + SHA-256
 * fingerprint against the pre-storage value (token never logged/returned).
 */
export async function saveConfig(config: SyncConfig): Promise<SaveConfigResult> {
  const baseUrl = config.baseUrl.trim();
  if (baseUrl.length === 0) {
    return { ok: false, message: "Worker base URL is required" };
  }
  const validated = validateCaptureToken(config.token);
  if (!validated.ok) {
    return { ok: false, message: validated.message };
  }

  const expectedLength = validated.token.length;
  const expectedFingerprint = await fingerprintToken(validated.token);

  await chrome.storage.local.set({
    [STORAGE_KEYS.baseUrl]: baseUrl,
    [STORAGE_KEYS.token]: validated.token,
  });

  const stored = await chrome.storage.local.get(STORAGE_KEYS.token);
  const got = stored[STORAGE_KEYS.token];
  if (typeof got !== "string" || got.length !== expectedLength) {
    await chrome.storage.local.remove(STORAGE_KEYS.token);
    return { ok: false, message: TOKEN_STORAGE_MISMATCH_MESSAGE };
  }
  const gotFingerprint = await fingerprintToken(got);
  if (gotFingerprint !== expectedFingerprint) {
    await chrome.storage.local.remove(STORAGE_KEYS.token);
    return { ok: false, message: TOKEN_STORAGE_MISMATCH_MESSAGE };
  }

  return { ok: true };
}

export async function saveBaseUrl(baseUrl: string): Promise<SaveConfigResult> {
  const trimmed = baseUrl.trim();
  if (trimmed.length === 0) {
    return { ok: false, message: "Worker base URL is required" };
  }
  await chrome.storage.local.set({ [STORAGE_KEYS.baseUrl]: trimmed });
  return { ok: true };
}

/** For the options form: base URL is shown; the token is never read back out. */
export async function loadBaseUrl(): Promise<string> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.baseUrl);
  const value = stored[STORAGE_KEYS.baseUrl];
  return typeof value === "string" ? value : "";
}

/** Empty storage → local default for display / Restore. */
export async function loadBaseUrlOrDefault(): Promise<string> {
  const stored = await loadBaseUrl();
  return stored.length > 0 ? stored : DEFAULT_LOCAL_WORKER_URL;
}

export async function hasToken(): Promise<boolean> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.token);
  const value = stored[STORAGE_KEYS.token];
  if (typeof value !== "string" || value.length === 0) return false;
  return validateCaptureToken(value).ok;
}

export interface ExportedConfig {
  schema_version: number;
  kind: string;
  worker_base_url: string;
  capture_chatgpt_enabled: boolean;
  user_id: string;
}

/** Non-secret settings only — never includes the API token. */
export async function exportConfiguration(): Promise<ExportedConfig> {
  const baseUrl = await loadBaseUrlOrDefault();
  const capture = await loadCaptureSettings();
  return {
    schema_version: CONFIG_EXPORT_SCHEMA_VERSION,
    kind: CONFIG_EXPORT_KIND,
    worker_base_url: baseUrl,
    capture_chatgpt_enabled: capture.enabled,
    user_id: capture.userId,
  };
}

export function assertExportHasNoToken(exported: ExportedConfig): boolean {
  const json = JSON.stringify(exported);
  if ("capture_api_token" in (exported as object)) return false;
  if (/capture_api_token/i.test(json)) return false;
  return true;
}

export type ImportConfigResult =
  | { ok: true }
  | { ok: false; message: string };

/** Restore non-secret fields; does not clear or modify the stored token. */
export async function importConfiguration(
  raw: unknown,
): Promise<ImportConfigResult> {
  if (raw === null || typeof raw !== "object") {
    return { ok: false, message: "Invalid configuration file" };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.kind !== CONFIG_EXPORT_KIND) {
    return { ok: false, message: "Unrecognized configuration kind" };
  }
  if (obj.schema_version !== CONFIG_EXPORT_SCHEMA_VERSION) {
    return { ok: false, message: "Unsupported configuration schema_version" };
  }
  if (typeof obj.worker_base_url !== "string" || obj.worker_base_url.trim().length === 0) {
    return { ok: false, message: "worker_base_url is required" };
  }
  if (typeof obj.capture_chatgpt_enabled !== "boolean") {
    return { ok: false, message: "capture_chatgpt_enabled must be boolean" };
  }
  if (typeof obj.user_id !== "string") {
    return { ok: false, message: "user_id is required" };
  }
  // Refuse payloads that smuggle a token field.
  if ("capture_api_token" in obj || "token" in obj) {
    return { ok: false, message: "Configuration must not include a token" };
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.baseUrl]: obj.worker_base_url.trim(),
    [STORAGE_KEYS.captureEnabled]: obj.capture_chatgpt_enabled === true,
    [STORAGE_KEYS.userId]:
      obj.user_id.trim().length > 0 ? obj.user_id.trim() : DEFAULT_USER_ID,
  });
  return { ok: true };
}

export type PairResult = SaveConfigResult;

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

/**
 * User-initiated local pairing. Never logs token or response body.
 */
export async function pairWithLocalWorker(
  baseUrl: string,
  fetchImpl: FetchLike = fetch,
): Promise<PairResult> {
  const url = baseUrl.trim().replace(/\/$/, "") + "/v1/dev/pair";
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
    });
  } catch {
    return { ok: false, message: PAIRING_NETWORK_MESSAGE };
  }

  if (response.status === 404 || response.status === 403) {
    return { ok: false, message: PAIRING_DISABLED_MESSAGE };
  }
  if (!response.ok) {
    return { ok: false, message: PAIRING_FAILED_MESSAGE };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, message: PAIRING_FAILED_MESSAGE };
  }
  if (
    body === null ||
    typeof body !== "object" ||
    typeof (body as { token?: unknown }).token !== "string"
  ) {
    return { ok: false, message: PAIRING_FAILED_MESSAGE };
  }
  const token = (body as { token: string }).token;
  return saveConfig({ baseUrl: baseUrl.trim(), token });
}

export type RestoreLocalResult = {
  ok: true;
  message: string;
  tokenPresent: boolean;
};

/**
 * Restore local development setup: URL + capture On + default user_id,
 * then pair if token missing.
 */
export async function restoreLocalDevelopmentSetup(
  fetchImpl: FetchLike = fetch,
): Promise<RestoreLocalResult> {
  const prior = await loadCaptureSettings();
  await chrome.storage.local.set({
    [STORAGE_KEYS.baseUrl]: DEFAULT_LOCAL_WORKER_URL,
    [STORAGE_KEYS.captureEnabled]: true,
    [STORAGE_KEYS.userId]: prior.userId,
  });

  if (await hasToken()) {
    return {
      ok: true,
      tokenPresent: true,
      message: "Local setup restored; token present",
    };
  }

  const paired = await pairWithLocalWorker(DEFAULT_LOCAL_WORKER_URL, fetchImpl);
  if (paired.ok) {
    return {
      ok: true,
      tokenPresent: true,
      message: "Local setup restored; token paired",
    };
  }

  return {
    ok: true,
    tokenPresent: false,
    message:
      "Local setup restored; token still needs pairing — use Pair with local Worker or Import token from clipboard",
  };
}

export function readTokenFieldValue(input: HTMLInputElement): string {
  return input.value;
}

export function replaceTokenFieldValue(
  input: HTMLInputElement,
  next: string,
): void {
  input.value = next;
}

export { INVALID_TOKEN_MESSAGE, validateCaptureToken, fingerprintToken } from "./token";
export { TOKEN_STORAGE_MISMATCH_MESSAGE } from "./token";
