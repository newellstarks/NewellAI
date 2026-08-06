import { STORAGE_KEYS } from "../storage-keys";
import { createChatgptObserver } from "../capture/chatgpt/observe";
import type {
  CaptureArtifactPayload,
  CaptureEnqueuePayload,
  EnqueueSendResult,
} from "../capture/chatgpt/observe";

/**
 * Static content script for ChatGPT (docs/CaptureClient.md Slice 2 +
 * Artifact v1 image slice — content-script-first byte fetch).
 *
 * After extension reload, existing ChatGPT tabs must be refreshed or
 * reinjected by the service worker — otherwise this file never runs.
 */

const LOG_PREFIX = "[newellai]";

let captureEnabled = false;
let observer: ReturnType<typeof createChatgptObserver> | null = null;

async function readCaptureEnabled(): Promise<boolean> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.captureEnabled);
  return stored[STORAGE_KEYS.captureEnabled] === true;
}

function sendEnqueue(
  payload: CaptureEnqueuePayload,
): Promise<EnqueueSendResult | void> {
  if (!captureEnabled) return Promise.resolve();
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, (reply) => {
      const err = chrome.runtime.lastError?.message;
      if (err) {
        console.info(LOG_PREFIX, "captureEnqueue transport:", err.slice(0, 80));
        resolve();
        return;
      }
      if (reply && reply.ok === false) {
        console.info(
          LOG_PREFIX,
          "captureEnqueue rejected:",
          String(reply.error ?? "unknown").slice(0, 40),
        );
        resolve();
        return;
      }
      const clientTurnId = reply?.result?.client_turn_id;
      if (typeof clientTurnId === "string" && clientTurnId.length > 0) {
        resolve({ client_turn_id: clientTurnId });
        return;
      }
      resolve();
    });
  });
}

export type ArtifactEnqueueSendResult =
  | { ok: true; status?: string }
  | { ok: false; error: string };

/**
 * Bridge wire format: plain number[] (0..255). Chrome sendMessage has been
 * observed to destroy ArrayBuffer/Uint8Array identity; number[] reconstructs
 * reliably in the service worker.
 */
function sendArtifactEnqueue(
  payload: CaptureArtifactPayload,
): Promise<ArtifactEnqueueSendResult> {
  if (!captureEnabled) {
    return Promise.resolve({ ok: false, error: "capture_disabled" });
  }
  const wireBytes = Array.from(payload.bytes);
  const wire = { ...payload, bytes: wireBytes };
  // Do not log URLs, filenames, or byte contents.
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(wire, (reply) => {
      const err = chrome.runtime.lastError?.message;
      if (err) {
        console.info(LOG_PREFIX, "artifactEnqueue transport:", err.slice(0, 80));
        resolve({ ok: false, error: "transport" });
        return;
      }
      if (reply && reply.ok === false) {
        console.info(
          LOG_PREFIX,
          "artifactEnqueue rejected:",
          String(reply.error ?? "unknown").slice(0, 40),
        );
        resolve({
          ok: false,
          error: String(reply.error ?? "unknown"),
        });
        return;
      }
      if (reply && reply.ok === true) {
        const status = String(reply.result?.status ?? "accepted").slice(0, 24);
        console.info(LOG_PREFIX, "artifactEnqueue ok:", status);
        resolve({ ok: true, status });
        return;
      }
      resolve({ ok: false, error: "no_reply" });
    });
  });
}

function ensureObserver(): void {
  if (observer !== null) return;
  observer = createChatgptObserver({
    document,
    getHref: () => location.href,
    isCaptureEnabled: () => captureEnabled,
    sendEnqueue,
    sendArtifactEnqueue,
    fetchFn: fetch.bind(globalThis),
  });
}

async function applyEnabled(enabled: boolean): Promise<void> {
  const was = captureEnabled;
  captureEnabled = enabled;
  ensureObserver();
  if (!observer) return;

  if (enabled) {
    observer.start();
    if (!was) await observer.rescan();
  } else {
    observer.stop();
  }
}

function onVisibility(): void {
  if (!captureEnabled || !observer) return;
  if (document.visibilityState === "visible") {
    void observer.rescan();
  }
}

function onPageShow(): void {
  if (!captureEnabled || !observer) return;
  void observer.rescan();
}

let lastHref = location.href;
function watchUrl(): void {
  const href = location.href;
  if (href === lastHref) return;
  lastHref = href;
  if (!captureEnabled || !observer) return;
  observer.resetSession();
  void observer.rescan();
}

async function init(): Promise<void> {
  console.info(LOG_PREFIX, "ChatGPT capture content script loaded");
  await applyEnabled(await readCaptureEnabled());
  console.info(
    LOG_PREFIX,
    "capture",
    captureEnabled ? "enabled" : "disabled",
    "href=",
    location.pathname.slice(0, 64),
  );

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (STORAGE_KEYS.captureEnabled in changes) {
      const next = changes[STORAGE_KEYS.captureEnabled]?.newValue === true;
      void applyEnabled(next);
    }
  });

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pageshow", onPageShow);
  setInterval(watchUrl, 1_000);
}

void init();
