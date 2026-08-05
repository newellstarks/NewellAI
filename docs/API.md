# API

**Chapter 6 — API**

| | |
|---|---|
| **Status** | Active |
| **Purpose** | Worker HTTP surface: ingest routes, validation, and error envelopes. |
| **Prerequisites** | [Chapter 5 — Shared Contracts](./Contracts.md) |
| **Related chapters** | [Authentication](./Authentication.md), [Architecture](./Architecture.md), [Database](./Database.md), [Artifacts](./Artifacts.md), [Roadmap](./Roadmap.md) |
| **Nav** | [← Prev](./Contracts.md) · [TOC](./README.md#table-of-contents) · [Next →](./Authentication.md) |

---

## Role

The Cloudflare Worker exposes a **client-agnostic ingest API** over the [wire protocol](./Contracts.md).

**Current slices:** authenticated ingest + D1 persistence ([Database.md](./Database.md)) + minimal authenticated read API (FR-F6).

**Authentication design and policy** live in [Chapter 7 — Authentication](./Authentication.md). This page only summarizes route-level behavior.

## Goals (this subsystem)

1. **Accept** an upload request (`POST /v1/turns`)
2. **Authenticate** callers of protected routes per [Authentication.md](./Authentication.md) before touching the body
3. **Validate** structure against the wire protocol
4. **Persist** conversation + turns to D1 per [Database.md](./Database.md) (idempotent on `client_turn_id`)
5. **Return** `UploadResponse` with real `accepted` / `duplicate` counts, or `ApiError`
6. **Serve** minimal authenticated read endpoints for inspection (FR-F6) — see [Read endpoints](#read-endpoints-fr-f6)

## Authentication (route-level)

| Route | Auth |
|-------|------|
| `GET /health` | Public |
| `POST /v1/turns` | `Authorization: Bearer <token>` validated against `CAPTURE_API_TOKEN` |
| `GET /v1/conversations` | Same Bearer policy (responses expose conversation metadata) |
| `GET /v1/conversations/:id/turns` | Same Bearer policy (responses expose turn content) |
| `POST /v1/dev/pair` | **No Bearer.** Local-only pairing gate (loopback + `ALLOW_LOCAL_PAIRING` + exact extension `Origin`). See [CaptureClient.md](./CaptureClient.md) and [Authentication.md](./Authentication.md#local-development-pairing). |

On Bearer-protected `/v1/*` routes: server `X-Request-Id` first → authenticate → then body parse / validation / D1 access. Authentication always precedes database access. Failures: sanitized `401` + `WWW-Authenticate: Bearer`, or fail-closed `500` if the secret is missing. `/v1/dev/pair` does not use Bearer; it is unavailable unless local pairing env is explicitly enabled.

Full policy (header parsing, timing-safe compare, request-id rules, misconfiguration logging, test cases AUTH-1…15): **[Authentication.md](./Authentication.md)**.

## Endpoints

| Method | Path | Auth | Status |
|--------|------|------|--------|
| `GET` | `/health` | Public | Implemented (liveness) |
| `POST` | `/v1/turns` | Bearer — see [Authentication](./Authentication.md) | Implemented (auth + validate + D1 persist) |
| `GET` | `/v1/conversations` | Bearer | Implemented (conversation summaries) |
| `GET` | `/v1/conversations/:id/turns` | Bearer | Implemented (ordered turns for one conversation) |
| `POST` | `/v1/dev/pair` | Local pairing gate (no Bearer) | Slice 2.1 — local development only |

## Read endpoints (FR-F6)

Minimal authenticated inspection of stored data. The earlier draft name `sessions` is retired; the entity is **conversations** everywhere (routes, schema, wire protocol). Response shapes live in [Contracts.md](./Contracts.md) (`ConversationSummary`, `TurnRecord`, `ConversationsResponse`, `ConversationTurnsResponse`) — additive; `UploadRequest` / `UploadResponse` are unchanged.

### `GET /v1/conversations`

Returns `ConversationsResponse`: summaries of all conversations reachable with the bearer token (Phase 1 has one operator; no tenancy or user filtering).

- **Summaries only** — never includes turn text.
- Each summary carries the stored conversation columns plus two aggregates from the same query: `last_turn_at` (`MAX(turns.created_at)`) and `turn_count`.
- **LEFT JOIN on `turns`:** the non-transactional persistence path can theoretically leave a conversation row without turns after a mid-write failure. The inspection API exposes that condition rather than hiding it — such a conversation is returned with `last_turn_at: null` and `turn_count: 0`.
- **Ordering (deterministic):** conversations with non-null `last_turn_at` first; `last_turn_at` DESC; then `conversation_id` ASC.
- Empty store → `200` with an empty `conversations` array.

### `GET /v1/conversations/:id/turns`

Returns `ConversationTurnsResponse`: every stored turn for one conversation.

- **Ordering (deterministic):** `sequence` ASC with NULLs last, then `created_at` ASC, then `turn_id` ASC (uses the `(conversation_id, sequence)` index).
- Unknown `conversation_id` → `404` `NOT_FOUND`.
- `:id` is URL-decoded before lookup; all SQL is parameterized.

### Shared behavior

- Bearer auth per [Authentication.md](./Authentication.md), **before any D1 access**; sanitized `401` + `WWW-Authenticate: Bearer` on failure.
- Fresh server `X-Request-Id` on every response; standard `ApiError` envelope.
- Missing `DB` binding → `500` `INTERNAL_ERROR`, internal log `DB_CONFIGURATION_MISSING` only (same policy as writes).
- `GET` only; other methods → `405` `METHOD_NOT_ALLOWED`.
- **No pagination in Phase 1** — explicitly a later capability (single operator, bounded data). Revisit when list sizes or multi-user needs demand it.

### Test cases (read slice)

| ID | Case | Expected |
|----|------|----------|
| READ-1 | Two conversations with different last-turn times | Ordered by `last_turn_at` DESC, then `conversation_id` ASC |
| READ-2 | Equal `last_turn_at` | Tie broken by `conversation_id` ASC |
| READ-3 | Empty store | `200`, `conversations: []` |
| READ-4 | List response content | Summaries only — no turn `text` anywhere; `turn_count` / `last_turn_at` correct |
| READ-5 | Turns with mixed / missing `sequence` | `sequence` ASC NULLs last, then `created_at`, then `turn_id` |
| READ-6 | Unknown conversation id | `404` `NOT_FOUND`, sanitized envelope, `X-Request-Id` present |
| READ-7 | Missing / wrong / non-Bearer token on either read route | Sanitized `401` + `WWW-Authenticate: Bearer`; no D1 access |
| READ-8 | Missing `DB` binding (after valid auth) | `500` `INTERNAL_ERROR`; log `DB_CONFIGURATION_MISSING` |
| READ-9 | `POST /v1/conversations` | `405` `METHOD_NOT_ALLOWED` |
| READ-10 | Optional turn columns round-trip | `TurnRecord` returns stored optional fields; absent when NULL |
| READ-11 | Orphaned conversation (row without turns) | Returned with `last_turn_at: null`, `turn_count: 0`; sorts after all conversations with turns |

## Error codes (this slice)

| `error.code` | HTTP | When |
|--------------|------|------|
| `UNAUTHORIZED` | 401 | Auth failure on protected routes — see [Authentication](./Authentication.md) |
| `NOT_FOUND` | 404 | Unknown route, or unknown `conversation_id` on `/v1/conversations/:id/turns` |
| `METHOD_NOT_ALLOWED` | 405 | Wrong method on known path |
| `INVALID_JSON` | 400 | Body is not JSON (only after successful auth) |
| `VALIDATION_ERROR` | 400 | Body fails `UploadRequest` shape rules (only after successful auth) |
| `INTERNAL_ERROR` | 500 | Unexpected failure, auth misconfiguration ([Authentication](./Authentication.md)), or DB misconfiguration / failure ([Database](./Database.md)) |

## Principles

- Wire protocol from [Contracts.md](./Contracts.md) only
- Auth policy from [Authentication.md](./Authentication.md) — do not re-specify it here
- Persistence behavior from [Database.md](./Database.md) — validate before persist; idempotent on `client_turn_id`
- No queue logic or retries in the Worker (queue stays in the client — [ADR-0002](./ADRs/0002-durable-queue-in-extension.md))
- Artifact ingest / content routes are **Accepted** for design: `POST /v1/artifacts`, `PUT /v1/artifacts/:artifact_id/content`, proxied `GET .../content` — [Artifacts.md](./Artifacts.md), [ADR-0009](./ADRs/0009-artifact-delivery-retry-and-recovery-pipeline.md); not yet implemented.

## Related

- [Authentication](./Authentication.md) — authoritative auth design
- [Contracts](./Contracts.md)
- [Roadmap](./Roadmap.md)
- [Architecture](./Architecture.md)
- [Database](./Database.md)
- [Artifacts](./Artifacts.md) — proposed artifact routes
- Code: `apps/worker/`
