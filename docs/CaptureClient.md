# Capture Client v1 (Chrome Extension)

**Chapter 9 — Capture Client v1 (Chrome Extension)**

| | |
|---|---|
| **Status** | Active |
| **Purpose** | First capture adapter (Chrome extension)—not the product architecture. |
| **Prerequisites** | [Chapter 2 — Roadmap](./Roadmap.md), [Chapter 4 — Architecture](./Architecture.md), [Chapter 6 — API](./API.md), [Chapter 7 — Authentication](./Authentication.md), [Chapter 11 — Durable Queue](./DurableQueue.md) |
| **Related chapters** | [TurnCapture](./TurnCapture.md), [DurableQueue](./DurableQueue.md), [ADR-0004](./ADRs/0004-why-browser-extension-capture.md), [ADR-0006](./ADRs/0006-capture-client-durable-queue-identity-and-synchronization.md) |
| **Nav** | [← Prev](./Database.md) · [TOC](./README.md#table-of-contents) · [Next →](./TurnCapture.md) |

---

## Role

**Phase 2 — first capture client** (not Phase 1 Foundation, not the product itself).

NewellAI is a **platform** with a client-agnostic backend. This page describes **Capture Client v1**, implemented as a Chrome extension because it is the fastest path to a working end-to-end system.

> The system is not a Chrome extension.  
> The Chrome extension is simply the first implementation of the capture client.

It owns **capture** and the **Durable Queue** (local buffer, order, retry, sync) for this client only. Other clients (Phase 3) talk to the **same** Worker upload API.

## Phase 2 slices

| Slice | Scope | Status |
|-------|--------|--------|
| **1** | Durable IndexedDB queue, sync engine, options (endpoint/token/status), synthetic enqueue, MV3 alarms/recovery | **Done** (Chrome runtime verified) |
| **2** | ChatGPT DOM capture adapter → existing queue (this chapter’s capture design) | **Done** (Chrome runtime verified) |
| **2.1** | Operator config persistence — defaults, capture UI consistency, export/import (no token), local pairing, Restore local setup | **Next** — design accepted |
| Later | Additional surfaces, richer operator UX, optional capture polish | Not started |

## Phase 2 scope

- Desktop / Chromium **ChatGPT only** for Slice 2 (`chatgpt.com`, `chat.openai.com`)
- Reliable turn extraction over clever UI scraping
- Local durable queue + sync (see [DurableQueue.md](./DurableQueue.md), [ADR-0006](./ADRs/0006-capture-client-durable-queue-identity-and-synchronization.md))
- Configuration for Worker base URL, auth token, `user_id`, and **explicit capture enablement** via extension options

## Out of scope here

- Treating this client as the only possible client
- Phase 3 adapters (Safari, Firefox, Cursor, Claude Desktop, ChatGPT Desktop, macOS app, OpenAI API, …)
- Server-side primary queue
- **Slice 2 non-goals:** tool cards as turns, citations as separate turns, voice artifacts, canvas content, hidden branches, Custom GPT / Projects specialization, non-ChatGPT surfaces

## Responsibilities (Phase 2)

1. Detect new turns in the conversation UI (when capture is enabled)
2. Normalize to the shared turn schema (`packages/contracts`)
3. **Enqueue** into this client’s Durable Queue
4. **Sync** queued turns to the Worker authenticated ingest API
5. Surface queue / sync status and errors to the operator

## Slice 2 — ChatGPT capture (accepted design)

Prompt: *Implement ChatGPT turn capture exactly as specified in the engineering notebook (`docs/CaptureClient.md`, `docs/TurnCapture.md`).*

### Enablement (privacy boundary)

| Rule | Behavior |
|------|----------|
| Toggle | Options control **Capture ChatGPT turns: Off / On** |
| Default | **Off** |
| Storage | `chrome.storage.local` |
| While Off | Content script may load; it **must not enqueue** |
| Turning On | Triggers a **bounded rescan** of the current visible conversation |
| Status | Options and badge must make enabled vs disabled obvious |

Automatic capture must be a deliberate operator action, not a side effect of installing the extension or configuring the Worker.

### Operator identity

- `user_id` is configurable in `chrome.storage.local`
- Default: `user-1`
- No account, tenancy, or authentication system beyond the existing Worker bearer token

### Architecture (content → queue)

```
ChatGPT DOM (approved origins only)
  → static content script (manifest content_scripts)
  → ChatGPT capture adapter (selectors isolated here)
  → runtime message captureEnqueue (validated by service worker)
  → existing enqueue() + sync (ADR-0006)
  → Worker / D1
```

- Use **static** `manifest.json` `content_scripts`. Do **not** add the `scripting` permission unless implementation evidence proves it is required.
- ChatGPT-specific selectors and completion probes live **only** in the capture adapter module.

### Conversation id

1. Prefer URL path `/c/<id>` when present.
2. If a new chat has not yet received an id, buffer completed observations until the URL stabilizes, then enqueue with that `conversation_id`.
3. Do not mint a random `conversation_id` per turn.

### Turn identity (under ADR-0006)

**Strongly preferred:** validated **source-provided** message identifier extracted by the adapter (e.g. a page `data-message-id` or equivalent). The architectural contract is **not** hard-coded to any specific DOM attribute.

**Fallback** (when no validated source id): deterministic synthetic `source_key`:

```
conversation_id
| speaker
| normalizedText
| occurrenceIndexAmongSameSpeakerAndSameNormalizedText
```

- Occurrence index is among turns with the **same speaker and same normalized text** in the visible scan set (0-based or 1-based — pick one convention in code and keep it stable).
- Do **not** use a global ordinal among all completed turns (insertions / branches / regenerates would shift later identities).
- Random UUID-only fallback is **rejected** for Slice 2 (rescans would duplicate).

Re-observation of a known `(conversation_id, source_key)` reuses identity and sequence via the existing queue registry — no new queue item.

### Append-only history policy

| Event | Behavior |
|-------|----------|
| New source ID | New historical turn (new sequence) |
| Same source ID after first acceptance | Ignore subsequent in-place text changes |
| Visible branch only | Capture currently visible completed content |
| Regenerate with new source ID | Separate historical turn |
| Edited user message with new source ID | Separate historical turn |
| Deleted in UI | Do **not** delete previously captured history from D1 |

No ADR required: this remains append-only identity under [ADR-0006](./ADRs/0006-capture-client-durable-queue-identity-and-synchronization.md). Replacing earlier turns in place would require a later ADR.

### Assistant completion

An assistant turn is complete only when **all** of:

1. No applicable stop / generating affordance applies to it
2. No known streaming / incomplete marker is present
3. Its normalized text has remained unchanged for **at least 1 second**

The stability window is supporting evidence alongside affordance/marker checks. A sub-second window (e.g. 400 ms) is too aggressive for rendering and late-arriving citations.

User turns: enqueue when the committed user message node is present with final plain text.

### Content-script → service-worker messaging

The background `captureEnqueue` handler **must** validate before accepting text:

- `sender.id === chrome.runtime.id`
- Sender tab URL is an approved ChatGPT origin (`https://chatgpt.com/*` or `https://chat.openai.com/*`)
- Message schema and bounded field lengths
- `speaker` is only `user` or `assistant`
- `conversation_id` and `source_key` meet bounded length/format rules

Malformed messages are rejected. Diagnostics never include turn text or the token.

### Observation

- `MutationObserver` on the conversation root (debounced)
- Bounded periodic rescan while the tab is visible
- Rescan on `pageshow` / visibility regain and when capture is turned **On**
- Rescan on `/c/...` URL change (reset page-session maps)

### Plain text only

Normalize to plain text for `TurnPayload.text`. Do not store HTML. Do not capture tool cards, citation chrome as separate turns, voice artifacts, canvas content, or hidden branches.

### Selector strategy

Ordered fallbacks inside the adapter only (live-verified at implement time), typically:

1. `[data-message-author-role]` / `[data-message-id]` message roots
2. `article[data-testid^="conversation-turn-"]` / `[data-testid*="conversation-turn"]`
3. `.group\/conversation-turn` where needed

Role from `data-message-author-role` or equivalent turn role attribute. Prefer message content nodes (e.g. `.whitespace-pre-wrap` / `.markdown`) for text.

### Slice 2 acceptance (manual)

1. Capture toggle **On**; Worker configured; new ChatGPT conversation
2. Two user turns and two assistant turns with unique test phrases
3. All four completed halves enqueue, sync, and appear in D1/read API with correct speaker, text, identity, and sequences 1–4
4. Reload / rescan → no duplicates
5. Toggle **Off** → no further enqueue
6. No token or turn text in extension logs

### Automated tests (Slice 2)

- Fixture DOM HTML for completed / streaming / rescan idempotency / fallback identity
- Adapter unit tests (no live ChatGPT in CI)
- Enqueue via fake-indexeddb proving `already_known` on rescan
- Message-validation unit tests for the SW boundary

## Operator configuration persistence (Slice 2.1 — accepted design)

### What survives vs what is lost

| Event | `chrome.storage.local` (URL, token, capture On/Off, `user_id`) | IndexedDB queue / identities |
|-------|------------------------------------------------------------------|------------------------------|
| Extension **Reload**, SW restart, browser restart | **Kept** | **Kept** |
| **Remove** extension / clear extension data, then Load unpacked | **Wiped** | **Wiped** |

Recovery after Remove: **Import configuration** (non-secrets) + **Pair with local Worker** (or clipboard token), or **Restore local development setup** (sets URL + enables capture, then pairs if possible).

### Defaults and capture UI

- Default / Restore Worker URL: `http://127.0.0.1:8787`
- Capture checkbox **immediate-saves** on change; “Capture: Enabled/Disabled” updates only after a successful storage write; on failure the checkbox reverts to the last saved value
- Token is never placed in source control, `manifest.json`, README, or exported plaintext configuration

### Export / Import configuration

Export JSON (`schema_version`, `kind`, `worker_base_url`, `capture_chatgpt_enabled`, `user_id`) only. **Never** includes the API token. Import restores those fields and leaves any existing token unchanged unless the operator pairs or imports a token separately. Options copy: “Export does not include the API token.”

### Local pairing — `POST /v1/dev/pair`

Extension-only cannot read `.dev.vars`. Local development uses a **user-initiated** one-click pair:

| Rule | Behavior |
|------|----------|
| Method | `POST` only (`GET` rejected) |
| Availability | Only when `ALLOW_LOCAL_PAIRING=true` in local Worker env; **unavailable** in production / remote deployment configuration |
| Loopback | Request URL host must be `127.0.0.1` or `localhost` |
| Origin | Exact `PAIRING_EXTENSION_ORIGIN` (`chrome-extension://<this-extension-id>`). No wildcard CORS. Reject missing `Origin`, `Origin: null`, normal web origins, and other extension origins |
| One-shot | At most one successful pair per Worker process start (then pairing closes for that isolate) |
| Cache | `Cache-Control: no-store` |
| Logging | Never log the token or response body |
| Fallback | Clipboard token import remains |

Unpacked extension ID stability: Chrome derives the unpacked extension ID from the **absolute path** of the load directory. **Remove → Load unpacked from the same folder** yields the **same** ID. Options shows the current `chrome.runtime.id` so `.dev.vars` can set `PAIRING_EXTENSION_ORIGIN=chrome-extension://<id>` once. Loading from a different path produces a different ID (update `.dev.vars`).

### Restore local development setup

One options action that:

1. Sets Worker URL to `http://127.0.0.1:8787`
2. Enables capture
3. Defaults empty `user_id` to `user-1`
4. If a valid token is already stored → report token present; else attempt **Pair with local Worker** once; if pair fails → report that the token still needs pairing (Pair / clipboard remain available)

### Automated tests (Slice 2.1)

- Reload simulation preserves settings
- Checkbox/status consistency after save / failed save
- Default / Restore Worker URL is `http://127.0.0.1:8787`
- Export excludes token
- Import restores non-secrets without clearing token
- Restore local setup sets URL + capture On and reports unpaired when no token
- Worker pair: loopback + flags + matching origin → 200 once; then reject; bad/missing origin and non-loopback reject

## Related

- [Roadmap](./Roadmap.md) — Phase 2 vs Phase 3
- [Requirements](./Requirements.md) — FR-C1–FR-C3
- [Architecture](./Architecture.md)
- [TurnCapture](./TurnCapture.md)
- [DurableQueue](./DurableQueue.md)
- [API](./API.md)
- [ADR-0002](./ADRs/0002-durable-queue-in-extension.md)
- [ADR-0004](./ADRs/0004-why-browser-extension-capture.md)
- [ADR-0006](./ADRs/0006-capture-client-durable-queue-identity-and-synchronization.md)
- Code: `apps/extension/`
