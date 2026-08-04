import { loadCaptureSettings, loadConfig } from "./config";
import {
  authorizeCaptureEnqueue,
  authorizeLegacyEnqueue,
  CAPTURE_ENQUEUE_TYPE,
} from "./capture/messaging";
import {
  CAPTURE_CLIENT,
  CAPTURE_CLIENT_VERSION,
  CAPTURE_SURFACE,
} from "./capture/constants";
import { openQueueDb } from "./queue/db";
import {
  clearDeadLetters,
  enqueue,
  forcePendingDue,
  getStatus,
  recoverInFlight,
  requeueAuthBlocked,
} from "./queue/queue";
import { createSyncRunner } from "./queue/sync";
import type { EnqueueInput } from "./queue/types";

/**
 * Capture Client v1 service worker — durable queue + ChatGPT captureEnqueue
 * (docs/DurableQueue.md, docs/CaptureClient.md, ADR-0006).
 * Diagnostics never include turn text or the token.
 */

const SYNC_ALARM = "newellai-sync-sweep";

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbPromise ??= openQueueDb();
  return dbPromise;
}

const runSync = (async () => {
  const database = await db();
  return createSyncRunner(database, loadConfig, (input, init) => fetch(input, init));
})();

async function updateBadge(): Promise<void> {
  const { enabled } = await loadCaptureSettings();
  if (!enabled) {
    await chrome.action.setBadgeText({ text: "OFF" });
    await chrome.action.setBadgeBackgroundColor({ color: "#6b7280" });
    return;
  }
  const status = await getStatus(await db());
  const count = status.pending + status.auth_blocked + status.in_flight + status.dead;
  if (count === 0) {
    await chrome.action.setBadgeText({ text: "ON" });
    await chrome.action.setBadgeBackgroundColor({ color: "#2c6e49" });
    return;
  }
  await chrome.action.setBadgeText({ text: String(count) });
  await chrome.action.setBadgeBackgroundColor({
    color: status.dead > 0 || status.auth_blocked > 0 ? "#c0392b" : "#2c6e49",
  });
}

async function syncAndRefresh(): Promise<void> {
  const run = await runSync;
  await run();
  await updateBadge();
}

function ensureAlarm(): void {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 1 });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarm();
  void (async () => {
    await recoverInFlight(await db());
    await syncAndRefresh();
  })();
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
  void (async () => {
    await recoverInFlight(await db());
    await syncAndRefresh();
  })();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== SYNC_ALARM) return;
  void syncAndRefresh();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if ("capture_chatgpt_enabled" in changes || "user_id" in changes) {
    void updateBadge();
  }
});

type Message =
  | { type: "enqueue"; input: EnqueueInput }
  | { type: typeof CAPTURE_ENQUEUE_TYPE }
  | { type: "getStatus" }
  | { type: "getCaptureSettings" }
  | { type: "clearDeadLetters" }
  | { type: "configChanged" }
  | { type: "syncNow" };

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  void (async () => {
    try {
      const database = await db();
      switch (message.type) {
        case CAPTURE_ENQUEUE_TYPE: {
          const gate = authorizeCaptureEnqueue(
            message,
            sender,
            chrome.runtime.id,
          );
          if (!gate.ok) {
            sendResponse({ ok: false, error: gate.reason });
            break;
          }
          const settings = await loadCaptureSettings();
          if (!settings.enabled) {
            sendResponse({ ok: false, error: "capture_disabled" });
            break;
          }
          const input: EnqueueInput = {
            conversation: {
              conversation_id: gate.message.conversation_id,
              user_id: settings.userId,
            },
            capture: {
              capture_client: CAPTURE_CLIENT,
              capture_client_version: CAPTURE_CLIENT_VERSION,
              surface: CAPTURE_SURFACE,
            },
            source_key: gate.message.source_key,
            turn: {
              speaker: gate.message.speaker,
              text: gate.message.text,
              ...(gate.message.captured_at !== undefined
                ? { captured_at: gate.message.captured_at }
                : {}),
            },
          };
          const result = await enqueue(database, input);
          await syncAndRefresh();
          sendResponse({ ok: true, result });
          break;
        }
        case "enqueue": {
          const legacy = authorizeLegacyEnqueue(sender, chrome.runtime.id);
          if (!legacy.ok) {
            sendResponse({ ok: false, error: legacy.reason });
            break;
          }
          const result = await enqueue(database, message.input);
          await syncAndRefresh();
          sendResponse({ ok: true, result });
          break;
        }
        case "getStatus": {
          const settings = await loadCaptureSettings();
          sendResponse({
            ok: true,
            status: await getStatus(database),
            capture: settings,
          });
          break;
        }
        case "getCaptureSettings": {
          sendResponse({ ok: true, capture: await loadCaptureSettings() });
          break;
        }
        case "clearDeadLetters": {
          const cleared = await clearDeadLetters(database);
          await updateBadge();
          sendResponse({ ok: true, cleared });
          break;
        }
        case "configChanged": {
          const requeued = await requeueAuthBlocked(database);
          await syncAndRefresh();
          sendResponse({ ok: true, requeued });
          break;
        }
        case "syncNow": {
          await forcePendingDue(database);
          await syncAndRefresh();
          sendResponse({ ok: true, status: await getStatus(database) });
          break;
        }
      }
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.name : "Error",
      });
    }
  })();
  return true;
});
