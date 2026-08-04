import {
  DEFAULT_LOCAL_WORKER_URL,
  DEFAULT_USER_ID,
  exportConfiguration,
  hasToken,
  importConfiguration,
  importTokenFromClipboard,
  loadBaseUrlOrDefault,
  loadCaptureSettings,
  pairWithLocalWorker,
  readTokenFieldValue,
  replaceTokenFieldValue,
  restoreLocalDevelopmentSetup,
  saveBaseUrl,
  saveCaptureSettings,
  saveConfig,
} from "./config";
import type { QueueStatus } from "./queue/types";

/**
 * Options page — capture enablement, export/import, local pairing, status
 * (docs/CaptureClient.md Slice 2.1, docs/DurableQueue.md).
 */

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function send<T>(message: unknown): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

function renderCaptureStatus(enabled: boolean): void {
  const status = el("capture-status");
  status.textContent = enabled ? "Capture: Enabled" : "Capture: Disabled";
  status.className = enabled
    ? "capture-status capture-on"
    : "capture-status capture-off";
  el<HTMLInputElement>("capture-enabled").checked = enabled;
}

async function refreshStatus(): Promise<void> {
  const reply = await send<{
    ok: boolean;
    status?: QueueStatus;
    capture?: { enabled: boolean; userId: string };
  }>({ type: "getStatus" });
  if (!reply.ok || reply.status === undefined) return;
  const s = reply.status;
  el("st-pending").textContent = String(s.pending);
  el("st-auth").textContent = String(s.auth_blocked);
  el("st-inflight").textContent = String(s.in_flight);
  el("st-dead").textContent = String(s.dead);
  el("st-error").textContent = s.last_error ?? "none";
  el("st-error").className = s.last_error === null ? "" : "error";
  el("st-success").textContent =
    s.last_success_at === null
      ? "never"
      : new Date(s.last_success_at).toLocaleString();
  if (reply.capture) {
    renderCaptureStatus(reply.capture.enabled);
    el<HTMLInputElement>("user-id").value = reply.capture.userId;
  }
}

function note(id: string, text: string): void {
  const span = el(id);
  span.textContent = text;
  setTimeout(() => {
    span.textContent = "";
  }, 6000);
}

function wireTokenField(tokenInput: HTMLInputElement): void {
  tokenInput.addEventListener("focus", () => {
    tokenInput.removeAttribute("readonly");
    replaceTokenFieldValue(tokenInput, "");
  });

  tokenInput.addEventListener("paste", (event) => {
    event.preventDefault();
    const text = event.clipboardData?.getData("text") ?? "";
    replaceTokenFieldValue(tokenInput, text);
  });

  tokenInput.addEventListener("blur", () => {
    tokenInput.setAttribute("readonly", "readonly");
  });
}

async function init(): Promise<void> {
  el<HTMLInputElement>("base-url").value = await loadBaseUrlOrDefault();
  el<HTMLInputElement>("base-url").placeholder = DEFAULT_LOCAL_WORKER_URL;

  const capture = await loadCaptureSettings();
  renderCaptureStatus(capture.enabled);
  el<HTMLInputElement>("user-id").value = capture.userId;

  el("extension-id").textContent = chrome.runtime.id;
  el("pairing-origin-hint").textContent =
    `PAIRING_EXTENSION_ORIGIN=chrome-extension://${chrome.runtime.id}`;

  const tokenInput = el<HTMLInputElement>("token");
  tokenInput.placeholder = (await hasToken())
    ? "Token saved — enter a new value to replace"
    : "Stored locally; never displayed";
  wireTokenField(tokenInput);

  // Immediate-save capture checkbox (status updates only after successful write).
  el<HTMLInputElement>("capture-enabled").addEventListener("change", () => {
    void (async () => {
      const checkbox = el<HTMLInputElement>("capture-enabled");
      const previous = await loadCaptureSettings();
      const enabled = checkbox.checked;
      const userId =
        el<HTMLInputElement>("user-id").value.trim() || DEFAULT_USER_ID;
      const saved = await saveCaptureSettings({ enabled, userId });
      if (!saved.ok) {
        checkbox.checked = previous.enabled;
        renderCaptureStatus(previous.enabled);
        note("capture-note", saved.message);
        return;
      }
      renderCaptureStatus(enabled);
      await send({ type: "configChanged" });
      await refreshStatus();
      note(
        "capture-note",
        enabled
          ? "Capture enabled — visible chat will rescan"
          : "Capture disabled",
      );
    })();
  });

  el("save-user-id").addEventListener("click", () => {
    void (async () => {
      const userId =
        el<HTMLInputElement>("user-id").value.trim() || DEFAULT_USER_ID;
      const saved = await saveCaptureSettings({ userId });
      if (!saved.ok) {
        note("capture-note", saved.message);
        return;
      }
      el<HTMLInputElement>("user-id").value = userId;
      note("capture-note", "User id saved");
      await refreshStatus();
    })();
  });

  async function afterTokenSaved(): Promise<void> {
    replaceTokenFieldValue(tokenInput, "");
    tokenInput.setAttribute("readonly", "readonly");
    tokenInput.placeholder = "Token saved — enter a new value to replace";
    await send({ type: "configChanged" });
    await refreshStatus();
  }

  el<HTMLFormElement>("connection-form").addEventListener("submit", (event) => {
    event.preventDefault();
    void (async () => {
      const baseUrl = el<HTMLInputElement>("base-url").value.trim();
      const token = readTokenFieldValue(tokenInput);
      if (baseUrl.length === 0) {
        note("save-note", "Worker base URL is required");
        return;
      }
      if (token.trim().length === 0) {
        const urlOnly = await saveBaseUrl(baseUrl);
        note("save-note", urlOnly.ok ? "Worker URL saved" : urlOnly.message);
        if (urlOnly.ok) await refreshStatus();
        return;
      }
      const saved = await saveConfig({ baseUrl, token });
      if (!saved.ok) {
        note("save-note", saved.message);
        return;
      }
      await afterTokenSaved();
      note("save-note", "Saved successfully");
    })();
  });

  el("import-clipboard").addEventListener("click", () => {
    void (async () => {
      const baseUrl =
        el<HTMLInputElement>("base-url").value.trim() ||
        DEFAULT_LOCAL_WORKER_URL;
      const imported = await importTokenFromClipboard(baseUrl);
      if (!imported.ok) {
        note("save-note", imported.message);
        return;
      }
      el<HTMLInputElement>("base-url").value = baseUrl;
      await afterTokenSaved();
      note("save-note", "Saved successfully");
    })();
  });

  el("pair-local").addEventListener("click", () => {
    void (async () => {
      const baseUrl =
        el<HTMLInputElement>("base-url").value.trim() ||
        DEFAULT_LOCAL_WORKER_URL;
      const paired = await pairWithLocalWorker(baseUrl);
      if (!paired.ok) {
        note("save-note", paired.message);
        return;
      }
      el<HTMLInputElement>("base-url").value = baseUrl;
      await afterTokenSaved();
      note("save-note", "Paired with local Worker");
    })();
  });

  el("restore-local").addEventListener("click", () => {
    void (async () => {
      const result = await restoreLocalDevelopmentSetup();
      el<HTMLInputElement>("base-url").value = DEFAULT_LOCAL_WORKER_URL;
      const capture = await loadCaptureSettings();
      renderCaptureStatus(capture.enabled);
      el<HTMLInputElement>("user-id").value = capture.userId;
      if (result.tokenPresent) {
        tokenInput.placeholder = "Token saved — enter a new value to replace";
      }
      await send({ type: "configChanged" });
      await refreshStatus();
      note("setup-note", result.message);
    })();
  });

  el("export-config").addEventListener("click", () => {
    void (async () => {
      const exported = await exportConfiguration();
      const blob = new Blob([JSON.stringify(exported, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "newellai-capture-config.json";
      a.click();
      URL.revokeObjectURL(url);
      note("setup-note", "Exported (does not include the API token)");
    })();
  });

  el("import-config").addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    void (async () => {
      try {
        const text = await file.text();
        const parsed: unknown = JSON.parse(text);
        const imported = await importConfiguration(parsed);
        if (!imported.ok) {
          note("setup-note", imported.message);
          return;
        }
        el<HTMLInputElement>("base-url").value = await loadBaseUrlOrDefault();
        const capture = await loadCaptureSettings();
        renderCaptureStatus(capture.enabled);
        el<HTMLInputElement>("user-id").value = capture.userId;
        await send({ type: "configChanged" });
        await refreshStatus();
        note(
          "setup-note",
          "Configuration imported (token unchanged — pair if needed)",
        );
      } catch {
        note("setup-note", "Could not read configuration file");
      } finally {
        input.value = "";
      }
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
      const settings = await loadCaptureSettings();
      await send({
        type: "enqueue",
        input: {
          conversation: {
            conversation_id: `manual-test-${now.toISOString().slice(0, 10)}`,
            user_id: settings.userId,
            title: "Capture Client v1 test conversation",
          },
          capture: {
            capture_client: "chrome-extension",
            capture_client_version: "0.1.0",
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
