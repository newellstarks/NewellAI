import { hasToken, loadBaseUrl, saveConfig } from "./config";
import type { QueueStatus } from "./queue/types";

/**
 * Options page — endpoint, token, status, synthetic test enqueue
 * (docs/DurableQueue.md diagnostics policy: counts and sanitized errors only;
 * the stored token is never read back into the page).
 */

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function send<T>(message: unknown): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

async function refreshStatus(): Promise<void> {
  const reply = await send<{ ok: boolean; status?: QueueStatus }>({
    type: "getStatus",
  });
  if (!reply.ok || reply.status === undefined) return;
  const s = reply.status;
  el("st-pending").textContent = String(s.pending);
  el("st-auth").textContent = String(s.auth_blocked);
  el("st-inflight").textContent = String(s.in_flight);
  el("st-dead").textContent = String(s.dead);
  el("st-error").textContent = s.last_error ?? "none";
  el("st-error").className = s.last_error === null ? "" : "error";
  el("st-success").textContent =
    s.last_success_at === null ? "never" : new Date(s.last_success_at).toLocaleString();
}

function note(id: string, text: string): void {
  const span = el(id);
  span.textContent = text;
  setTimeout(() => {
    span.textContent = "";
  }, 4000);
}

async function init(): Promise<void> {
  el<HTMLInputElement>("base-url").value = await loadBaseUrl();
  el<HTMLInputElement>("token").placeholder = (await hasToken())
    ? "Token saved — enter a new value to replace"
    : "Stored locally; never displayed";

  el("save").addEventListener("click", () => {
    void (async () => {
      const baseUrl = el<HTMLInputElement>("base-url").value.trim();
      const token = el<HTMLInputElement>("token").value.trim();
      if (baseUrl.length === 0 || token.length === 0) {
        note("save-note", "Both fields are required");
        return;
      }
      await saveConfig({ baseUrl, token });
      el<HTMLInputElement>("token").value = "";
      await send({ type: "configChanged" });
      note("save-note", "Saved");
      await refreshStatus();
    })();
  });

  el("refresh").addEventListener("click", () => void refreshStatus());

  el("sync-now").addEventListener("click", () => {
    void (async () => {
      await send({ type: "syncNow" });
      note("action-note", "Sync attempted");
      await refreshStatus();
    })();
  });

  el("test-enqueue").addEventListener("click", () => {
    void (async () => {
      const now = new Date();
      await send({
        type: "enqueue",
        input: {
          conversation: {
            conversation_id: `manual-test-${now.toISOString().slice(0, 10)}`,
            user_id: "user-1",
            title: "Capture Client v1 test conversation",
          },
          capture: {
            capture_client: "chrome-extension",
            capture_client_version: "0.0.0",
            surface: "options-test",
          },
          turn: {
            speaker: "user",
            text: `Synthetic test turn enqueued at ${now.toISOString()}`,
            captured_at: now.toISOString(),
          },
        },
      });
      note("action-note", "Test turn enqueued");
      await refreshStatus();
    })();
  });

  el("clear-dead").addEventListener("click", () => {
    void (async () => {
      const reply = await send<{ ok: boolean; cleared?: number }>({
        type: "clearDeadLetters",
      });
      note("action-note", `Cleared ${reply.cleared ?? 0} dead letter(s)`);
      await refreshStatus();
    })();
  });

  await refreshStatus();
}

void init();
