/**
 * Desktop Recall v1 — local session cookie (normal) or recovery Bearer.
 * Never logs tokens, cookies, storage paths, or signed source URLs.
 * Never embeds CAPTURE_API_TOKEN in HTML/JS assets.
 */

import {
  buildAuthorizationHeader,
  normalizeToken,
} from "./token.js?v=recall-2026-08-06e";
import { loadThumbnail as loadThumbnailInto } from "./thumbnail.js?v=recall-2026-08-08a";

/** Recovery Bearer only (sessionStorage). Normal path uses HttpOnly cookie. */
const RECOVERY_TOKEN_KEY = "newellai_recall_recovery_token";

const els = {
  token: document.getElementById("token"),
  authState: document.getElementById("auth-state"),
  btnConnect: document.getElementById("btn-connect"),
  btnSignOut: document.getElementById("btn-sign-out"),
  btnSave: document.getElementById("btn-save-token"),
  btnClear: document.getElementById("btn-clear-token"),
  health: document.getElementById("health"),
  healthBody: document.getElementById("health-body"),
  searchPanel: document.getElementById("search-panel"),
  searchForm: document.getElementById("search-form"),
  searchQ: document.getElementById("search-q"),
  searchError: document.getElementById("search-error"),
  searchResults: document.getElementById("search-results"),
  conversations: document.getElementById("conversations"),
  conversationList: document.getElementById("conversation-list"),
  conversationView: document.getElementById("conversation-view"),
  convTitle: document.getElementById("conv-title"),
  convMeta: document.getElementById("conv-meta"),
  unlinkedArtifacts: document.getElementById("unlinked-artifacts"),
  turns: document.getElementById("turns"),
  btnBack: document.getElementById("btn-back"),
  imageDialog: document.getElementById("image-dialog"),
  imageTitle: document.getElementById("image-dialog-title"),
  imageImg: document.getElementById("image-dialog-img"),
  imageDownload: document.getElementById("image-dialog-download"),
};

/** @type {"session" | "recovery" | null} */
let authMode = null;

function getRecoveryToken() {
  return sessionStorage.getItem(RECOVERY_TOKEN_KEY) ?? "";
}

function setRecoveryToken(token) {
  if (token) sessionStorage.setItem(RECOVERY_TOKEN_KEY, token);
  else sessionStorage.removeItem(RECOVERY_TOKEN_KEY);
}

function setAuthedUi(ok, label) {
  els.authState.textContent = ok
    ? label || "Connected to local Worker"
    : "Not connected — use Connect local Worker";
  els.health.classList.toggle("hidden", !ok);
  els.searchPanel.classList.toggle("hidden", !ok);
  els.conversations.classList.toggle("hidden", !ok);
  if (!ok) {
    els.conversationView.classList.add("hidden");
    els.healthBody.innerHTML = "";
    els.conversationList.innerHTML = "";
    els.searchResults.innerHTML = "";
  }
}

/**
 * Same-origin fetch with credentials (Recall cookie) and optional recovery Bearer.
 */
async function api(path, init = {}) {
  const headers = new Headers(init.headers || {});
  const recovery = getRecoveryToken();
  if (recovery) {
    const norm = normalizeToken(recovery);
    if (!norm.ok) {
      const err = new Error(norm.error);
      err.code = "TOKEN_INVALID";
      throw err;
    }
    const built = buildAuthorizationHeader(norm.token);
    if (!built.ok) {
      const err = new Error(built.error);
      err.code = "TOKEN_INVALID";
      throw err;
    }
    headers.set("Authorization", built.authorization);
  }
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers,
  });
  if (res.status === 401) {
    const err = new Error("unauthorized");
    err.code = "UNAUTHORIZED";
    throw err;
  }
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body?.error?.message ?? message;
    } catch {
      /* ignore */
    }
    const err = new Error(message);
    err.code = "HTTP";
    throw err;
  }
  return res;
}

async function apiJson(path) {
  const res = await api(path);
  return res.json();
}

function fmt(ts) {
  if (!ts) return "-";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function renderHealth(status) {
  const a = status.artifacts;
  const storage = status.storage ?? { mode: "?", root: null, available: true };
  const available =
    storage.available === undefined ? true : Boolean(storage.available);
  els.healthBody.innerHTML = `
    <div><span>Conversations</span><strong>${status.conversation_count}</strong></div>
    <div><span>Turns</span><strong>${status.turn_count}</strong></div>
    <div><span>Artifacts stored</span><strong>${a.stored}</strong></div>
    <div><span>Pending download</span><strong>${a.pending_download}</strong></div>
    <div><span>Failed download</span><strong>${a.failed_download}</strong></div>
    <div><span>Bytes missing</span><strong>${a.bytes_missing ?? 0}</strong></div>
    <div><span>Other artifacts</span><strong>${a.other}</strong></div>
    <div><span>Storage mode</span><strong>${storage.mode}</strong></div>
    <div><span>Storage</span><strong>${available ? "available" : "unavailable"}</strong></div>
    <div><span>Storage root</span><strong>${storage.root ?? "-"}</strong></div>
    <div><span>Last turn</span><strong>${fmt(status.last_turn_at)}</strong></div>
    <div><span>Last artifact</span><strong>${a.stored + a.pending_download + a.failed_download + a.other > 0 ? fmt(status.last_artifact_at) : "-"}</strong></div>
  `;
}

function renderHealthUnavailable(message) {
  els.healthBody.innerHTML = `
    <div><span>System health</span><strong>partial</strong></div>
    <div><span>Detail</span><strong>${message || "Status unavailable"}</strong></div>
    <div><span>Storage</span><strong>unavailable</strong></div>
  `;
}

function showHomeLists() {
  revokeAllObjectUrls();
  els.conversationView.classList.add("hidden");
  els.conversations.classList.remove("hidden");
  els.searchPanel.classList.remove("hidden");
  if (els.unlinkedArtifacts) {
    els.unlinkedArtifacts.innerHTML = "";
    els.unlinkedArtifacts.classList.add("hidden");
  }
  els.turns.innerHTML = "";
}

function renderConversationList(list) {
  els.conversationList.innerHTML = "";
  for (const c of list.conversations) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = `#/c/${encodeURIComponent(c.conversation_id)}`;
    a.textContent = c.title?.trim() || c.conversation_id;
    const meta = document.createElement("div");
    meta.className = "muted";
    meta.textContent = `${c.turn_count} turns | last ${fmt(c.last_turn_at)}`;
    li.append(a, meta);
    els.conversationList.appendChild(li);
  }
  if (list.conversations.length === 0) {
    els.conversationList.innerHTML = `<li class="muted">No conversations stored yet.</li>`;
  }
}

async function loadHome() {
  // Conversations/search must load even when /v1/status storage probe fails.
  let list;
  try {
    list = await apiJson("/v1/conversations");
  } catch (err) {
    throw err;
  }
  renderConversationList(list);

  try {
    const status = await apiJson("/v1/status");
    renderHealth(status);
  } catch (err) {
    if (err.code === "UNAUTHORIZED") throw err;
    renderHealthUnavailable(err.message || "Status unavailable");
  }
}

async function connectLocalSession() {
  const res = await fetch("/v1/dev/recall/session", {
    method: "POST",
    credentials: "include",
    headers: { "Cache-Control": "no-store" },
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body?.error?.message ?? message;
    } catch {
      /* ignore */
    }
    const err = new Error(message);
    err.code = "HTTP";
    throw err;
  }
  authMode = "session";
  setRecoveryToken("");
  if (els.token) els.token.value = "";
}

/**
 * Prefer turn_id; fallback client_turn_id; return unlinked remainder.
 * Keep aligned with src/recall/associate.ts.
 */
function associateArtifacts(turns, artifacts) {
  const byTurnId = new Map();
  const byClientTurnId = new Map();
  let withTurnId = 0;
  let withClientTurnId = 0;
  let turnIdNull = 0;
  for (const art of artifacts) {
    if (art.turn_id) {
      withTurnId += 1;
      const list = byTurnId.get(art.turn_id) ?? [];
      list.push(art);
      byTurnId.set(art.turn_id, list);
    } else {
      turnIdNull += 1;
    }
    if (art.client_turn_id) {
      withClientTurnId += 1;
      const list = byClientTurnId.get(art.client_turn_id) ?? [];
      list.push(art);
      byClientTurnId.set(art.client_turn_id, list);
    }
  }
  const claimed = new Set();
  const rows = turns.map((turn) => {
    const matched = [];
    for (const art of byTurnId.get(turn.turn_id) ?? []) {
      if (!claimed.has(art)) {
        matched.push(art);
        claimed.add(art);
      }
    }
    if (matched.length === 0) {
      for (const art of byClientTurnId.get(turn.client_turn_id) ?? []) {
        if (!claimed.has(art)) {
          matched.push(art);
          claimed.add(art);
        }
      }
    }
    return { turn, artifacts: matched };
  });
  const unlinked = artifacts.filter((art) => !claimed.has(art));
  return {
    rows,
    unlinked,
    diagnostics: {
      artifactCount: artifacts.length,
      linkedCount: claimed.size,
      unlinkedCount: unlinked.length,
      withTurnId,
      withClientTurnId,
      turnIdNull,
    },
  };
}

/** Object URLs for thumbnails / dialog — revoke when leaving a view. */
const liveObjectUrls = new Set();
let dialogObjectUrl = null;

function trackObjectUrl(url) {
  liveObjectUrls.add(url);
  return url;
}

function revokeObjectUrl(url) {
  if (!url || !url.startsWith("blob:")) return;
  URL.revokeObjectURL(url);
  liveObjectUrls.delete(url);
}

function revokeAllObjectUrls() {
  for (const url of liveObjectUrls) {
    URL.revokeObjectURL(url);
  }
  liveObjectUrls.clear();
  dialogObjectUrl = null;
  if (els.imageImg?.src?.startsWith("blob:")) {
    els.imageImg.removeAttribute("src");
  }
  if (els.imageDownload) {
    els.imageDownload.removeAttribute("href");
  }
}

function formatByteSize(n) {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return "size unknown";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadFilename(art) {
  const mime = (art.mime_type || "image").replace(/[^\w.+/-]+/g, "_");
  const base = (art.original_filename || mime.split("/")[1] || "image")
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 80);
  return base || "image";
}

async function fetchArtifactBlob(artifactId) {
  const res = await api(`/v1/artifacts/${encodeURIComponent(artifactId)}/content`);
  return res.blob();
}

async function openImage(artifactId, title) {
  const blob = await fetchArtifactBlob(artifactId);
  const url = URL.createObjectURL(blob);
  if (dialogObjectUrl) revokeObjectUrl(dialogObjectUrl);
  dialogObjectUrl = trackObjectUrl(url);
  els.imageTitle.textContent = title;
  els.imageImg.src = url;
  els.imageDownload.href = url;
  els.imageDownload.download = title.replace(/[^\w.-]+/g, "_").slice(0, 80) || "image";
  els.imageDialog.showModal();
}

async function downloadImage(artifactId, filename) {
  const blob = await fetchArtifactBlob(artifactId);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function loadThumbnail(imgEl, artifactId) {
  await loadThumbnailInto(imgEl, artifactId, {
    fetchBlob: fetchArtifactBlob,
    trackObjectUrl,
    revokeObjectUrl,
  });
}

/**
 * Render thumbnail + controls under a turn (or unlinked section).
 * Never exposes storage paths, source URLs, tokens, or object locations.
 */
function appendArtifactControls(box, art) {
  const card = document.createElement("figure");
  card.className = "artifact-card";

  if (art.capture_status === "stored") {
    const thumb = document.createElement("img");
    thumb.className = "artifact-thumb";
    thumb.alt = "Captured image";
    thumb.hidden = true;
    thumb.decoding = "async";
    card.appendChild(thumb);
    void loadThumbnail(thumb, art.artifact_id);

    const meta = document.createElement("figcaption");
    meta.className = "artifact-meta";
    meta.textContent = `${art.mime_type || "image"} | ${formatByteSize(art.byte_size)}`;

    const actions = document.createElement("div");
    actions.className = "artifact-actions";
    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.textContent = "View full size";
    viewBtn.addEventListener("click", () => {
      void openImage(
        art.artifact_id,
        `${art.mime_type || "image"} (${formatByteSize(art.byte_size)})`,
      );
    });
    const dlBtn = document.createElement("button");
    dlBtn.type = "button";
    dlBtn.className = "secondary";
    dlBtn.textContent = "Download";
    dlBtn.addEventListener("click", () => {
      void downloadImage(art.artifact_id, downloadFilename(art));
    });
    actions.append(viewBtn, dlBtn);
    card.append(meta, actions);
  } else if (art.capture_status === "pending_download") {
    const ph = document.createElement("div");
    ph.className = "artifact-placeholder pending";
    ph.textContent = "Pending download";
    card.appendChild(ph);
  } else if (art.capture_status === "failed_download") {
    const ph = document.createElement("div");
    ph.className = "artifact-placeholder failed";
    ph.textContent = "Download failed";
    card.appendChild(ph);
  } else {
    const ph = document.createElement("div");
    ph.className = "artifact-placeholder";
    ph.textContent = String(art.capture_status || "unknown");
    card.appendChild(ph);
  }

  box.appendChild(card);
}

function renderUnlinkedArtifacts(unlinked) {
  if (!els.unlinkedArtifacts) return;
  els.unlinkedArtifacts.innerHTML = "";
  if (unlinked.length === 0) {
    els.unlinkedArtifacts.classList.add("hidden");
    return;
  }
  els.unlinkedArtifacts.classList.remove("hidden");
  const h = document.createElement("h3");
  h.textContent = "Unlinked images";
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent =
    "These artifacts belong to this conversation but did not match a turn by turn_id or client_turn_id.";
  const box = document.createElement("div");
  box.className = "artifacts";
  for (const art of unlinked) {
    appendArtifactControls(box, art);
  }
  els.unlinkedArtifacts.append(h, hint, box);
}

async function loadConversation(conversationId, highlightTurnId) {
  revokeAllObjectUrls();

  const [turnsBody, artsBody] = await Promise.all([
    apiJson(`/v1/conversations/${encodeURIComponent(conversationId)}/turns`),
    apiJson(
      `/v1/conversations/${encodeURIComponent(conversationId)}/artifacts`,
    ),
  ]);

  // Never surface storage_location / source URLs in the UI.
  // content_type is not on ArtifactRecord; mime_type is the media type field.
  const artifacts = (artsBody.artifacts ?? []).map((a) => ({
    artifact_id: a.artifact_id,
    conversation_id: a.conversation_id,
    turn_id: a.turn_id,
    client_turn_id: a.client_turn_id,
    direction: a.direction,
    mime_type: a.mime_type,
    original_filename: a.original_filename,
    capture_status: a.capture_status,
    byte_size: a.byte_size,
  }));

  els.conversations.classList.add("hidden");
  els.searchPanel.classList.add("hidden");
  els.conversationView.classList.remove("hidden");
  els.convTitle.textContent = conversationId;
  els.convMeta.textContent = `${turnsBody.turns.length} turns | ${artifacts.length} artifacts`;

  const { rows, unlinked } = associateArtifacts(turnsBody.turns, artifacts);
  renderUnlinkedArtifacts(unlinked);

  els.turns.innerHTML = "";
  for (const { turn, artifacts: linked } of rows) {
    const article = document.createElement("article");
    article.className = `turn ${turn.speaker}`;
    article.id = `turn-${turn.turn_id}`;
    if (highlightTurnId && turn.turn_id === highlightTurnId) {
      article.classList.add("highlight");
    }

    const meta = document.createElement("div");
    meta.className = "turn-meta";
    meta.innerHTML = `
      <span>${turn.speaker}</span>
      <span>captured ${fmt(turn.captured_at ?? turn.created_at)}</span>
      <span>${turn.capture_client}${turn.surface ? ` | ${turn.surface}` : ""}</span>
      <span>turn ${turn.turn_id.slice(0, 8)}...</span>
    `;

    const text = document.createElement("p");
    text.className = "turn-text";
    text.textContent = turn.text;

    article.append(meta, text);

    if (linked.length > 0) {
      const box = document.createElement("div");
      box.className = "artifacts";
      for (const art of linked) {
        appendArtifactControls(box, art);
      }
      article.appendChild(box);
    }

    els.turns.appendChild(article);
  }

  if (highlightTurnId) {
    document.getElementById(`turn-${highlightTurnId}`)?.scrollIntoView({
      block: "center",
    });
  }
}

async function runSearch(q) {
  els.searchError.hidden = true;
  els.searchResults.innerHTML = "";
  try {
    const data = await apiJson(
      `/v1/search?q=${encodeURIComponent(q)}&limit=50`,
    );
    if (data.hits.length === 0) {
      els.searchResults.innerHTML = `<li class="muted">No matches.</li>`;
      return;
    }
    for (const hit of data.hits) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = `#/c/${encodeURIComponent(hit.conversation_id)}/t/${encodeURIComponent(hit.turn_id)}`;
      a.textContent = hit.title?.trim() || hit.conversation_id;
      const meta = document.createElement("div");
      meta.className = "muted";
      meta.textContent = `${hit.speaker} | ${fmt(hit.captured_at ?? hit.created_at)}`;
      const snip = document.createElement("p");
      snip.className = "snippet";
      snip.textContent = hit.snippet;
      li.append(a, meta, snip);
      els.searchResults.appendChild(li);
    }
  } catch (err) {
    els.searchError.hidden = false;
    els.searchError.textContent =
      err.code === "UNAUTHORIZED"
        ? "Unauthorized — Connect local Worker"
        : err.message || "Search failed";
  }
}

async function bootstrap() {
  // Drop legacy sessionStorage of capture token (normal path is HttpOnly cookie).
  try {
    sessionStorage.removeItem("newellai_recall_token");
  } catch {
    /* ignore */
  }

  // Prefer existing HttpOnly session; recovery Bearer is optional Advanced path.
  const recovery = getRecoveryToken();
  if (recovery) {
    const norm = normalizeToken(recovery);
    if (!norm.ok) {
      setRecoveryToken("");
      if (els.token) els.token.value = "";
      authMode = null;
      setAuthedUi(false);
      els.authState.textContent = norm.error;
      return;
    }
    if (els.token) els.token.value = norm.token;
    authMode = "recovery";
  }

  try {
    await loadHome();
    authMode = recovery ? "recovery" : "session";
    setAuthedUi(
      true,
      recovery ? "Signed in with recovery token" : "Connected to local Worker",
    );
    await route();
  } catch (err) {
    if (err.code === "UNAUTHORIZED") {
      setRecoveryToken("");
      authMode = null;
      setAuthedUi(false);
      els.authState.textContent =
        "Not connected — use Connect local Worker";
      return;
    }
    if (err.code === "TOKEN_INVALID") {
      setRecoveryToken("");
      authMode = null;
      setAuthedUi(false);
      els.authState.textContent = err.message || "Invalid recovery token";
      return;
    }
    setAuthedUi(false);
    els.authState.textContent = err.message || "Failed to load";
  }
}

async function route() {
  if (!authMode) return;
  const hash = location.hash.replace(/^#/, "");
  const convTurn = /^\/c\/([^/]+)\/t\/([^/]+)$/.exec(hash);
  const convOnly = /^\/c\/([^/]+)$/.exec(hash);
  if (convTurn) {
    await loadConversation(
      decodeURIComponent(convTurn[1]),
      decodeURIComponent(convTurn[2]),
    );
    return;
  }
  if (convOnly) {
    await loadConversation(decodeURIComponent(convOnly[1]), null);
    return;
  }
  showHomeLists();
  await loadHome();
}

els.btnConnect.addEventListener("click", () => {
  void (async () => {
    try {
      await connectLocalSession();
      setAuthedUi(true, "Connected to local Worker");
      await loadHome();
      await route();
    } catch (err) {
      setAuthedUi(false);
      els.authState.textContent =
        err.message || "Connect failed — is ALLOW_LOCAL_PAIRING enabled?";
    }
  })();
});

els.btnSignOut.addEventListener("click", () => {
  void (async () => {
    try {
      await fetch("/v1/dev/recall/session/revoke", {
        method: "POST",
        credentials: "include",
        headers: { "Cache-Control": "no-store" },
      });
    } catch {
      /* ignore */
    }
    setRecoveryToken("");
    if (els.token) els.token.value = "";
    authMode = null;
    setAuthedUi(false);
  })();
});

els.btnSave.addEventListener("click", () => {
  const norm = normalizeToken(els.token.value);
  if (!norm.ok) {
    setAuthedUi(false);
    els.authState.textContent = norm.error;
    return;
  }
  setRecoveryToken(norm.token);
  els.token.value = norm.token;
  authMode = "recovery";
  setAuthedUi(true, "Signed in with recovery token");
  void bootstrap();
});

els.btnClear.addEventListener("click", () => {
  setRecoveryToken("");
  els.token.value = "";
  if (authMode === "recovery") {
    authMode = null;
    setAuthedUi(false);
  }
});

els.searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = els.searchQ.value.trim();
  if (q.length < 2) {
    els.searchError.hidden = false;
    els.searchError.textContent = "Enter at least 2 characters";
    return;
  }
  void runSearch(q);
});

els.btnBack.addEventListener("click", () => {
  location.hash = "";
});

els.imageDialog.addEventListener("close", () => {
  if (dialogObjectUrl) {
    revokeObjectUrl(dialogObjectUrl);
    dialogObjectUrl = null;
  }
  els.imageImg.removeAttribute("src");
  els.imageDownload.removeAttribute("href");
});

window.addEventListener("hashchange", () => {
  void route();
});

window.addEventListener("pagehide", () => {
  revokeAllObjectUrls();
});

void bootstrap();
