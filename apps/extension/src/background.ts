import { loadConfig } from "./config";
import { openQueueDb } from "./queue/db";
import {
  clearDeadLetters,
  enqueue,
  getStatus,
  recoverInFlight,
  requeueAuthBlocked,
} from "./queue/queue";
import { createSyncRunner } from "./queue/sync";
import type { EnqueueInput } from "./queue/types";

/**
 * Capture Client v1 service worker — durable queue slice (docs/DurableQueue.md,
 * ADR-0006). MV3 lifecycle: immediate sync attempt on enqueue, one-minute
 * chrome.alarms sweep of persisted next_attempt_at, startup recovery.
 * No DOM capture in this slice. No conversation text or token in logs.
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
  const status = await getStatus(await db());
  const count = status.pending + status.auth_blocked + status.in_flight + status.dead;
  await chrome.action.setBadgeText({ text: count === 0 ? "" : String(count) });
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

type Message =
  | { type: "enqueue"; input: EnqueueInput }
  | { type: "getStatus" }
  | { type: "clearDeadLetters" }
  | { type: "configChanged" }
  | { type: "syncNow" };

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  void (async () => {
    try {
      const database = await db();
      switch (message.type) {
        case "enqueue": {
          const result = await enqueue(database, message.input);
          await syncAndRefresh();
          sendResponse({ ok: true, result });
          break;
        }
        case "getStatus": {
          sendResponse({ ok: true, status: await getStatus(database) });
          break;
        }
        case "clearDeadLetters": {
          const cleared = await clearDeadLetters(database);
          await updateBadge();
          sendResponse({ ok: true, cleared });
          break;
        }
        case "configChanged": {
          // Credentials may be fixed: auth-blocked items become pending.
          const requeued = await requeueAuthBlocked(database);
          await syncAndRefresh();
          sendResponse({ ok: true, requeued });
          break;
        }
        case "syncNow": {
          await syncAndRefresh();
          sendResponse({ ok: true, status: await getStatus(database) });
          break;
        }
      }
    } catch (error) {
      // Sanitized: no payload content, no token.
      sendResponse({ ok: false, error: error instanceof Error ? error.name : "Error" });
    }
  })();
  return true; // async sendResponse
});
