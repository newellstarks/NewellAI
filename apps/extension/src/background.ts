import { loadCaptureSettings, loadConfig } from "./config";
import {
  authorizeArtifactEnqueue,
  authorizeCaptureEnqueue,
  authorizeLegacyEnqueue,
  ARTIFACT_ENQUEUE_TYPE,
  CAPTURE_ENQUEUE_TYPE,
} from "./capture/messaging";
import {
  CAPTURE_CLIENT,
  CAPTURE_CLIENT_VERSION,
  CAPTURE_SURFACE,
} from "./capture/constants";
import { openArtifactDb } from "./artifacts/db";
import {
  attachArtifactBytes,
  clearArtifactDeadLetters,
  dismissArtifactConflict,
  enqueueArtifact,
  forceArtifactPendingDue,
  getArtifactStatus,
  listOpenArtifactConflicts,
  recoverArtifactInFlight,
  requeueArtifactAuthBlocked,
} from "./artifacts/queue";
import { createArtifactSyncRunner } from "./artifacts/sync";
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
 * Capture Client v1 service worker — turn queue + sibling artifact queue
 * (docs/DurableQueue.md, docs/Artifacts.md, ADR-0006, ADR-0009).
 */

const SYNC_ALARM = "newellai-sync-sweep";
const CHATGPT_TAB_URLS = [
  "https://chatgpt.com/*",
  "https://chat.openai.com/*",
] as const;

/**
 * After Load unpacked / Reload, Chrome does not reinject content_scripts into
 * already-open ChatGPT tabs. Reinject so artifact discovery runs without a
 * manual page refresh.
 */
async function reinjectChatgptContentScripts(): Promise<void> {
  if (chrome.scripting?.executeScript === undefined) return;
  let tabs: chrome.tabs.Tab[];
  try {
    tabs = await chrome.tabs.query({ url: [...CHATGPT_TAB_URLS] });
  } catch {
    return;
  }
  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["dist/chatgpt.js"],
      });
    } catch {
      /* discarded / chrome:// / permission edge */
    }
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbPromise ??= openQueueDb();
  return dbPromise;
}

let artifactDbPromise: Promise<IDBDatabase> | null = null;
function artifactDb(): Promise<IDBDatabase> {
  artifactDbPromise ??= openArtifactDb();
  return artifactDbPromise;
}

const runSync = (async () => {
  const database = await db();
  return createSyncRunner(database, loadConfig, (input, init) =>
    fetch(input, init),
  );
})();

const runArtifactSync = (async () => {
  const database = await artifactDb();
  return createArtifactSyncRunner(database, loadConfig, (input, init) =>
    fetch(input, init),
  );
})();

async function updateBadge(): Promise<void> {
  const { enabled } = await loadCaptureSettings();
  if (!enabled) {
    await chrome.action.setBadgeText({ text: "OFF" });
    await chrome.action.setBadgeBackgroundColor({ color: "#6b7280" });
    return;
  }
  const [turnStatus, artStatus] = await Promise.all([
    getStatus(await db()),
    getArtifactStatus(await artifactDb()),
  ]);
  const count =
    turnStatus.pending +
    turnStatus.auth_blocked +
    turnStatus.in_flight +
    turnStatus.dead +
    artStatus.pending +
    artStatus.auth_blocked +
    artStatus.in_flight +
    artStatus.dead +
    artStatus.conflicts;
  if (count === 0) {
    await chrome.action.setBadgeText({ text: "ON" });
    await chrome.action.setBadgeBackgroundColor({ color: "#2c6e49" });
    return;
  }
  await chrome.action.setBadgeText({ text: String(count) });
  await chrome.action.setBadgeBackgroundColor({
    color:
      turnStatus.dead > 0 ||
      turnStatus.auth_blocked > 0 ||
      artStatus.dead > 0 ||
      artStatus.auth_blocked > 0 ||
      artStatus.conflicts > 0
        ? "#c0392b"
        : "#2c6e49",
  });
}

async function syncAndRefresh(): Promise<void> {
  const [run, runArt] = await Promise.all([runSync, runArtifactSync]);
  await Promise.all([run(), runArt()]);
  await updateBadge();
}

function ensureAlarm(): void {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 1 });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarm();
  void (async () => {
    await reinjectChatgptContentScripts();
    await recoverInFlight(await db());
    await recoverArtifactInFlight(await artifactDb());
    await syncAndRefresh();
  })();
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
  void (async () => {
    await reinjectChatgptContentScripts();
    await recoverInFlight(await db());
    await recoverArtifactInFlight(await artifactDb());
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
  if (
    "capture_chatgpt_enabled" in changes &&
    changes.capture_chatgpt_enabled?.newValue === true
  ) {
    void reinjectChatgptContentScripts();
  }
});

type Message =
  | { type: "enqueue"; input: EnqueueInput }
  | { type: typeof CAPTURE_ENQUEUE_TYPE }
  | { type: typeof ARTIFACT_ENQUEUE_TYPE }
  | { type: "getStatus" }
  | { type: "getCaptureSettings" }
  | { type: "clearDeadLetters" }
  | { type: "clearArtifactDeadLetters" }
  | { type: "dismissArtifactConflict"; client_artifact_id: string }
  | { type: "configChanged" }
  | { type: "syncNow" };

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  void (async () => {
    try {
      const database = await db();
      const artDb = await artifactDb();
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
        case ARTIFACT_ENQUEUE_TYPE: {
          const gate = authorizeArtifactEnqueue(
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
          const result = await enqueueArtifact(artDb, {
            conversation_id: gate.message.conversation_id,
            user_id: settings.userId,
            client_turn_id: gate.message.client_turn_id,
            source_key: gate.message.source_key,
            direction: gate.message.direction,
            mime_type: gate.message.mime_type,
            declared_sha256: gate.message.declared_sha256,
            declared_byte_size: gate.message.declared_byte_size,
            capture: {
              capture_client: CAPTURE_CLIENT,
              capture_client_version: CAPTURE_CLIENT_VERSION,
              surface: CAPTURE_SURFACE,
            },
            ...(gate.message.image_provenance !== undefined
              ? { image_provenance: gate.message.image_provenance }
              : {}),
            ...(gate.message.original_filename !== undefined
              ? { original_filename: gate.message.original_filename }
              : {}),
            ...(gate.message.source_url !== undefined
              ? { source_url: gate.message.source_url }
              : {}),
            ...(gate.message.captured_at !== undefined
              ? { captured_at: gate.message.captured_at }
              : {}),
            ...(gate.message.bytes !== undefined
              ? { bytes: gate.message.bytes }
              : {}),
          });
          // Rescan recovery: identity already known but bytes were missing.
          if (
            result.status === "already_known" &&
            gate.message.bytes !== undefined
          ) {
            await attachArtifactBytes(
              artDb,
              gate.message.conversation_id,
              result.client_artifact_id,
              gate.message.bytes,
              gate.message.declared_sha256,
              gate.message.declared_byte_size,
            );
          }
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
            artifactStatus: await getArtifactStatus(artDb),
            artifactConflicts: await listOpenArtifactConflicts(artDb),
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
        case "clearArtifactDeadLetters": {
          const cleared = await clearArtifactDeadLetters(artDb);
          await updateBadge();
          sendResponse({ ok: true, cleared });
          break;
        }
        case "dismissArtifactConflict": {
          const dismissed = await dismissArtifactConflict(
            artDb,
            message.client_artifact_id,
          );
          await updateBadge();
          sendResponse({ ok: true, dismissed });
          break;
        }
        case "configChanged": {
          const requeued = await requeueAuthBlocked(database);
          const artRequeued = await requeueArtifactAuthBlocked(artDb);
          await syncAndRefresh();
          sendResponse({ ok: true, requeued, artifactRequeued: artRequeued });
          break;
        }
        case "syncNow": {
          await forcePendingDue(database);
          await forceArtifactPendingDue(artDb);
          await syncAndRefresh();
          sendResponse({
            ok: true,
            status: await getStatus(database),
            artifactStatus: await getArtifactStatus(artDb),
          });
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
