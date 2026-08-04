import type { SyncConfig, SyncConfigLoad } from "./queue/sync";
import { STORAGE_KEYS } from "./storage-keys";
import {
  TOKEN_STORAGE_MISMATCH_MESSAGE,
  fingerprintToken,
  validateCaptureToken,
} from "./token";
import { DEFAULT_USER_ID, MAX_USER_ID_LENGTH } from "./capture/constants";

/**
 * Configuration lives in chrome.storage.local (ADR-0006): the token is never
 * placed in chrome.storage.sync and never bundled into the build.
 */

export { STORAGE_KEYS } from "./storage-keys";
export { DEFAULT_USER_ID } from "./capture/constants";

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

export async function saveCaptureSettings(
  settings: Partial<CaptureSettings>,
): Promise<void> {
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
}

export type SaveConfigResult = { ok: true } | { ok: false; message: string };

export const CLIPBOARD_PERMISSION_MESSAGE =
  "clipboard permission denied — allow clipboard access and try again";
export const CLIPBOARD_EMPTY_MESSAGE =
  "clipboard is empty — copy the token and try again";

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

/** For the options form: base URL is shown; the token is never read back out. */
export async function loadBaseUrl(): Promise<string> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.baseUrl);
  const value = stored[STORAGE_KEYS.baseUrl];
  return typeof value === "string" ? value : "";
}

export async function hasToken(): Promise<boolean> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.token);
  const value = stored[STORAGE_KEYS.token];
  return typeof value === "string" && value.length > 0;
}

/**
 * Read the token field as a full replacement value: take the current input,
 * do not append to any prior stored secret. Caller should clear the field
 * after a successful save.
 */
export function readTokenFieldValue(input: HTMLInputElement): string {
  return input.value;
}

/** Replace the field contents entirely (never append). */
export function replaceTokenFieldValue(
  input: HTMLInputElement,
  next: string,
): void {
  input.value = next;
}

export { INVALID_TOKEN_MESSAGE, validateCaptureToken, fingerprintToken } from "./token";
export { TOKEN_STORAGE_MISMATCH_MESSAGE } from "./token";
