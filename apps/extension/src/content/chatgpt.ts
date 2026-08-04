import { STORAGE_KEYS } from "../storage-keys";
import { createChatgptObserver } from "../capture/chatgpt/observe";
import type { CaptureEnqueuePayload } from "../capture/chatgpt/observe";

/**
 * Static content script for ChatGPT (docs/CaptureClient.md Slice 2).
 * Loads on approved origins via manifest content_scripts.
 * Does not enqueue while capture is disabled.
 */

let captureEnabled = false;
let observer: ReturnType<typeof createChatgptObserver> | null = null;

async function readCaptureEnabled(): Promise<boolean> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.captureEnabled);
  return stored[STORAGE_KEYS.captureEnabled] === true;
}

function sendEnqueue(payload: CaptureEnqueuePayload): void {
  if (!captureEnabled) return;
  void chrome.runtime.sendMessage(payload).catch(() => {
    // SW may be restarting; next rescan retries. No turn text in logs.
  });
}

function ensureObserver(): void {
  if (observer !== null) return;
  observer = createChatgptObserver({
    document,
    getHref: () => location.href,
    isCaptureEnabled: () => captureEnabled,
    sendEnqueue,
  });
}

async function applyEnabled(enabled: boolean): Promise<void> {
  const was = captureEnabled;
  captureEnabled = enabled;
  ensureObserver();
  if (!observer) return;

  if (enabled) {
    observer.start();
    // Turning On triggers a bounded rescan of the visible conversation.
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

// SPA URL changes (ChatGPT client router).
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
  await applyEnabled(await readCaptureEnabled());

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
