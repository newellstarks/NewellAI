# Database

**Chapter 8 — Database**

| | |
|---|---|
| **Status** | Active |
| **Purpose** | D1 schema and persistence behavior for Worker ingest; local SQLite mirror strategy. |
| **Prerequisites** | [Chapter 5 — Shared Contracts](./Contracts.md), [Chapter 6 — API](./API.md), [Chapter 7 — Authentication](./Authentication.md) |
| **Related chapters** | [Architecture](./Architecture.md), [TurnCapture](./TurnCapture.md), [Roadmap](./Roadmap.md) |
| **Nav** | [← Prev](./Authentication.md) · [TOC](./README.md#table-of-contents) · [Next →](./CaptureClient.md) |

---

## Strategy

| Store | Role |
|-------|------|
| Cloudflare **D1** | Authoritative cloud store for turns (via Worker ingest) |
| Local **SQLite** | Periodic mirror for inspection, backup, and offline review (later) |

Schema SQL lives in `migrations/`. Worker config: `apps/worker/wrangler.toml` (binding `DB`).

## Scope (this slice — persistence only)

```
Authenticated request → Validate → Insert conversation → Insert turns → UploadResponse
```

### Non-goals (this slice)

- Queue logic (stays in Capture Client v1 — [ADR-0002](./ADRs/0002-durable-queue-in-extension.md))
- Retries (clients retry; server is idempotent)
- Synchronization / read APIs (`GET /v1/sessions*` remain "not yet")
- Local SQLite mirror
- Extension work

## Schema (migration `0001_init.sql`)

Multi-user capable from day one; Phase 1 has one operator row.

| Table | Purpose |
|-------|---------|
| `users` | Account identity (Phase 1: one row, created on first upload) |
| `conversations` | Chat sessions (fulfills the earlier draft entity name `sessions`; named to match the wire protocol's `conversation_id`) |
| `turns` | Ordered user/assistant messages within a conversation |

### `users`

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | TEXT PK | From `ConversationMetadata.user_id` |
| `created_at` | TEXT NOT NULL | ISO-8601 server time |

### `conversations`

| Column | Type | Notes |
|--------|------|-------|
| `conversation_id` | TEXT PK | From wire protocol |
| `user_id` | TEXT NOT NULL → `users` | |
| `title` | TEXT | Optional |
| `source_model` | TEXT | Optional |
| `started_at` | TEXT | Optional ISO-8601 from client |
| `created_at` | TEXT NOT NULL | ISO-8601 server time |

### `turns`

| Column | Type | Notes |
|--------|------|-------|
| `turn_id` | TEXT PK | Server-assigned UUID |
| `conversation_id` | TEXT NOT NULL → `conversations` | |
| `client_turn_id` | TEXT NOT NULL | Idempotency key from client |
| `speaker` | TEXT NOT NULL | `user` or `assistant` (CHECK) |
| `text` | TEXT NOT NULL | Message body |
| `captured_at` | TEXT | Optional ISO-8601 from client |
| `sequence` | INTEGER | Optional client order hint |
| `parent_client_turn_id` | TEXT | Optional request↔response link |
| `message_type` | TEXT | Optional |
| `topic` | TEXT | Optional |
| `capture_client` | TEXT NOT NULL | From `CaptureMetadata` |
| `capture_client_version` | TEXT | Optional |
| `surface` | TEXT | Optional |
| `captured_batch_id` | TEXT | Optional |
| `created_at` | TEXT NOT NULL | ISO-8601 server time |

**Constraint:** `UNIQUE (conversation_id, client_turn_id)` — the idempotency contract.
**Index:** `(conversation_id, sequence)` for future ordered reads.

## Write behavior (`POST /v1/turns`, after auth + validation)

1. `INSERT OR IGNORE` the `users` row (`user_id`)
2. `INSERT OR IGNORE` the `conversations` row — **first write wins**; later uploads do not update conversation metadata in this slice
3. For each turn, `INSERT ... ON CONFLICT (conversation_id, client_turn_id) DO NOTHING` with a fresh server `turn_id` UUID
4. Count per-turn insert results: inserted → `accepted`, conflict (already stored) → `duplicate`
5. Return `UploadResponse` with real `accepted` / `duplicate` counts

### Decisions

| Topic | Decision |
|-------|----------|
| Idempotency scope | `client_turn_id` unique **per conversation** (same id in another conversation is a distinct turn) |
| Duplicate within one batch | First occurrence accepted, repeats counted as `duplicate` (same conflict path) |
| `turn_ids` in `UploadResponse` | **Not returned** in this slice (optional field stays absent) |
| Conversation metadata drift | Ignored in this slice; reconciliation is a later capability |
| D1 failure | `500` `INTERNAL_ERROR` (sanitized); **no retries** — clients retry against the idempotent ingest |
| Missing `DB` binding | Fail closed like auth misconfig: `500` `INTERNAL_ERROR`; internal log `DB_CONFIGURATION_MISSING` only |

## Failure modes

| Case | Expected |
|------|----------|
| Duplicate `client_turn_id` (retry) | `200`; counted in `duplicate`; no second row |
| Same `client_turn_id`, different conversation | `200`; accepted as a new turn |
| D1 insert error | `500` `INTERNAL_ERROR`; no partial-batch retry logic |
| `DB` binding missing | `500` `INTERNAL_ERROR`; log `DB_CONFIGURATION_MISSING` |

## Test cases

| ID | Case | Expected |
|----|------|----------|
| DB-1 | Valid upload | Rows in `users`, `conversations`, `turns`; `accepted` = turn count, `duplicate` = 0 |
| DB-2 | Re-upload identical batch | No new rows; `accepted` = 0, `duplicate` = turn count |
| DB-3 | Mixed batch (one new, one already stored) | `accepted` = 1, `duplicate` = 1 |
| DB-4 | Same `client_turn_id` in a different conversation | Accepted (idempotency is per conversation) |
| DB-5 | Duplicate `client_turn_id` twice within one batch | First accepted, second counted `duplicate` |
| DB-6 | Second upload with different conversation `title` | Conversation row unchanged (first write wins) |
| DB-7 | Missing `DB` binding | `500` `INTERNAL_ERROR`, sanitized body, log `DB_CONFIGURATION_MISSING` |
| DB-8 | D1 error during insert | `500` `INTERNAL_ERROR`, sanitized body |
| DB-9 | Turn columns round-trip | Optional fields (`sequence`, `topic`, …) persisted as sent |

## Migrations

- Files: `migrations/NNNN_description.sql`, applied with Wrangler:

```bash
npx wrangler d1 create newellai            # once; put the id in wrangler.toml
npx wrangler d1 migrations apply newellai --local   # local dev
npx wrangler d1 migrations apply newellai --remote  # production
```

## Later capabilities

- Read/inspect APIs (`GET /v1/sessions`, `GET /v1/sessions/:id/turns`)
- Local SQLite mirror (inspection / backup)
- Preload from ChatGPT history export
- Optional per-user encryption with a user-held key

## Related

- [Architecture](./Architecture.md)
- [API](./API.md)
- [Authentication](./Authentication.md)
- [TurnCapture](./TurnCapture.md)
- [ADRs](./ADRs/)
- Code: `migrations/`, `apps/worker/src/db/`
