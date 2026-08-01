# Roadmap

**Chapter 2 — Roadmap**

| | |
|---|---|
| **Status** | Active |
| **Purpose** | Phases and the inside-out build sequence; what is done vs next. |
| **Prerequisites** | [Chapter 0](./README.md), [Chapter 1 — Vision](./Vision.md) |
| **Related chapters** | [Requirements](./Requirements.md), [Architecture](./Architecture.md), [API](./API.md), [Authentication](./Authentication.md), [CaptureClient](./CaptureClient.md) |
| **Nav** | [← Prev](./Vision.md) · [TOC](./README.md#table-of-contents) · [Next →](./Requirements.md) |

---
The engineering notebook is authoritative. This page tracks **phases and the build order**—not implementation detail.

## Incremental stack (inside-out)

Each step builds on the previous one **without forcing a redesign** of earlier work. That is the process that tends to produce reliable systems instead of big rewrites.

```
✅ Shared Contracts (wire protocol)
✅ Worker ingest          — accept → validate → respond
✅ Authentication         — shared Bearer / CAPTURE_API_TOKEN
✅ D1 persistence         — conversations + turns, idempotent on client_turn_id
✅ Read API (FR-F6)       — GET /v1/conversations, GET /v1/conversations/:id/turns
✅ Phase 1 exit           — manual end-to-end upload test passed (2026-08-01, local only)
→  Durable queue integration
→  Capture Client v1 (Chrome extension)
```

Capture Client v1 remains the **last** major subsystem—not the first.

## Engineering sequence (detail)

| Step | Milestone | Status | Spec |
|------|-----------|--------|------|
| 0 | Foundation scaffold | Done (`v0.1-foundation`) | [Architecture](./Architecture.md) |
| 1 | Shared Contracts (wire protocol) | Done | [Contracts.md](./Contracts.md) |
| 2 | Worker ingest | Done | [API.md](./API.md) — accept, validate, respond |
| 3 | Authentication | Done | [Authentication.md](./Authentication.md) — shared Bearer; route summary in [API.md](./API.md) |
| 4 | D1 persistence | Done | [Database.md](./Database.md) — schema + idempotent writes (`0001_init.sql`) |
| 5 | Minimal read API (FR-F6) | Done | [API.md](./API.md#read-endpoints-fr-f6) — `GET /v1/conversations`, `GET /v1/conversations/:id/turns` |
| 6 | Durable queue integration | **Next** — design accepted | [DurableQueue.md](./DurableQueue.md) + [ADR-0006](./ADRs/0006-capture-client-durable-queue-identity-and-synchronization.md); queue stays in client ([ADR-0002](./ADRs/0002-durable-queue-in-extension.md)) |
| 7 | Capture Client v1 | Phase 2 | [CaptureClient.md](./CaptureClient.md) |

### Layer notes

- **Worker ingest** — clean, testable API surface; no database writes yet.
- **Authentication** — protect `/v1/turns` with shared Bearer (`CAPTURE_API_TOKEN`); policy in [Authentication.md](./Authentication.md).
- **D1 persistence** — conversations + turns persisted; real `accepted` / `duplicate` from storage; no queue or retries ([Database.md](./Database.md)).
- **Read API** — authenticated inspection of stored conversations and turns; summaries + deterministic ordering; no pagination in Phase 1 ([API.md](./API.md#read-endpoints-fr-f6)).
- **Durable queue integration** — connect Capture Client v1’s local queue to auth + D1 ingest (still not a Worker-owned queue).
- **Capture Client v1** — full adapter (observe ChatGPT, enqueue, sync, operator status).

## Phase map

### Phase 1 — Foundation (closed 2026-08-01)

Goal met: working backend (contracts → ingest → auth → D1 → read API). Any authorized client can upload and read back turns. FR-F1 through FR-F6 are implemented.

Non-goals (unchanged): DOM scraping, multi-client polish, treating the extension as the product.

**Exit record — manual end-to-end upload test (2026-08-01), all 11 checks passed:**

- Local Worker (`wrangler dev`) and local D1 only; no deployment, login, or remote Cloudflare resources
- First upload: `accepted: 2, duplicate: 0`; identical retry: `accepted: 0, duplicate: 2` (idempotency, FR-F5)
- Authenticated conversation-list and turn-list readback matched the stored data (FR-F6)
- Direct D1 counts: `users = 1`, `conversations = 1`, `turns = 2` — no extra rows from the retry
- Request-ID generation, unauthorized handling (sanitized 401), unknown-conversation 404, and secret/configuration checks all passed

The next milestone is **Phase 2 — durable queue and capture-client integration**.

### Phase 2 — Capture Client v1

**Capture Client v1 (Chrome Extension)** — one adapter on the finished backend. See [ADR-0004](./ADRs/0004-why-browser-extension-capture.md).

### Phase 3 — Additional clients

Safari, Firefox, Cursor, Claude Desktop, ChatGPT Desktop, macOS app, OpenAI API (if available), export/import — **same** contracts, auth, upload API, D1.

## Later (platform)

- Local SQLite mirror / inspection UX
- Commercial multi-user onboarding
- Optional user-held encryption

## Related

- [Contracts](./Contracts.md) — wire protocol
- [API](./API.md) — Worker ingest routes
- [Authentication](./Authentication.md) — auth policy
- [Requirements](./Requirements.md)
- [Architecture](./Architecture.md)
- [CaptureClient](./CaptureClient.md)
