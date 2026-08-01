# Shared Contracts (Wire Protocol)

**Chapter 5 — Shared Contracts (Wire Protocol)**

| | |
|---|---|
| **Status** | Stable |
| **Purpose** | The wire protocol every capture client and the Worker must speak. |
| **Prerequisites** | [Chapter 4 — Architecture](./Architecture.md) |
| **Related chapters** | [API](./API.md), [TurnCapture](./TurnCapture.md), [Database](./Database.md) |
| **Nav** | [← Prev](./Architecture.md) · [TOC](./README.md#table-of-contents) · [Next →](./API.md) |

---

## Purpose

`packages/contracts` defines the **wire protocol** between every capture client and the backend.

Every client—Chrome today, Safari tomorrow, Cursor someday—must speak this language on the wire. The Worker accepts and returns these shapes; clients must not invent private upload schemas.

## Requirements

| ID | Requirement |
|----|-------------|
| C-1 | Export `TurnPayload`, `ConversationMetadata`, `CaptureMetadata`, `UploadRequest`, `UploadResponse`, `ApiError` |
| C-2 | Types are client-agnostic (no Chrome-only fields required) |
| C-3 | Idempotency via `client_turn_id` on each turn |
| C-4 | Optional client timestamps; Worker may fill server time |
| C-5 | `UploadRequest` supports one or more turns in a single call |
| C-6 | Errors use a stable `ApiError` shape (`code`, `message`, optional `details`) |
| C-7 | Export read response types `ConversationSummary`, `TurnRecord`, `ConversationsResponse`, `ConversationTurnsResponse` — **additive**; `UploadRequest` / `UploadResponse` unchanged |

### Non-requirements

- Wire encryption
- Client-specific queue envelopes (those stay in the client package)

Runtime validation of these shapes lives in `apps/worker` (ingest slice).

## Types

### `TurnPayload`

One half-turn (user or assistant message).

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `client_turn_id` | `string` | yes | Idempotency key; stable across retries |
| `speaker` | `"user" \| "assistant"` | yes | |
| `text` | `string` | yes | Message body (`turn_text` in older notes → `text` here) |
| `captured_at` | `string` | no | ISO-8601 from client; server may override/fill |
| `sequence` | `number` | no | Client-assigned order hint within conversation |
| `parent_client_turn_id` | `string` | no | Link request ↔ response |
| `message_type` | `string` | no | Optional classification |
| `topic` | `string` | no | Optional label |

### `ConversationMetadata`

Conversation / session context shared by turns in an upload.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `conversation_id` | `string` | yes | Stable session id (maps to prior `session_id`) |
| `user_id` | `string` | yes | Account identity (Phase 1: customer zero) |
| `title` | `string` | no | Optional display title |
| `source_model` | `string` | no | e.g. model name if known |
| `started_at` | `string` | no | ISO-8601 |

### `CaptureMetadata`

How and where the turns were captured (adapter identity—not Chrome-specific required fields).

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `capture_client` | `string` | yes | e.g. `chrome-extension`, `safari`, `cursor`, `manual` |
| `capture_client_version` | `string` | no | Semver or build id |
| `surface` | `string` | no | e.g. `chatgpt-web`, `chatgpt-desktop` |
| `captured_batch_id` | `string` | no | Optional batch / sync id |

### `UploadRequest`

Body for authenticated `POST /v1/turns` (and manual Phase 1 tests).

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `conversation` | `ConversationMetadata` | yes | |
| `capture` | `CaptureMetadata` | yes | |
| `turns` | `TurnPayload[]` | yes | One or more; must be non-empty |

### `UploadResponse`

Successful ingest result.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `accepted` | `number` | yes | Count of turns accepted |
| `duplicate` | `number` | yes | Count skipped as idempotent duplicates |
| `conversation_id` | `string` | yes | Echo of conversation id |
| `turn_ids` | `string[]` | no | Server ids if assigned |
| `server_time` | `string` | yes | ISO-8601 |

### `ConversationSummary`

One conversation in the `GET /v1/conversations` list ([API.md](./API.md#read-endpoints-fr-f6)). **Summary only — no turn content.**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `conversation_id` | `string` | yes | |
| `user_id` | `string` | yes | Stored account identity (existing field; not tenancy) |
| `title` | `string` | no | Absent when not stored |
| `source_model` | `string` | no | Absent when not stored |
| `started_at` | `string` | no | Client-supplied ISO-8601, absent when not stored |
| `created_at` | `string` | yes | Server time of first insert |
| `last_turn_at` | `string \| null` | yes | `MAX(turns.created_at)` — list sort key (DESC, NULLs last); `null` when the conversation has no stored turns |
| `turn_count` | `number` | yes | Turns stored for this conversation; `0` for an orphaned row |

### `ConversationsResponse`

Body for `GET /v1/conversations`.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `conversations` | `ConversationSummary[]` | yes | Ordered `last_turn_at` DESC with NULLs last, then `conversation_id` ASC; empty array allowed |
| `server_time` | `string` | yes | ISO-8601 |

### `TurnRecord`

One stored turn as returned by `GET /v1/conversations/:id/turns` — the persisted form of `TurnPayload` plus server fields and capture metadata.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `turn_id` | `string` | yes | Server-assigned UUID |
| `conversation_id` | `string` | yes | |
| `client_turn_id` | `string` | yes | Idempotency key as uploaded |
| `speaker` | `"user" \| "assistant"` | yes | |
| `text` | `string` | yes | |
| `captured_at` | `string` | no | Absent when not stored |
| `sequence` | `number` | no | Absent when not stored |
| `parent_client_turn_id` | `string` | no | |
| `message_type` | `string` | no | |
| `topic` | `string` | no | |
| `capture_client` | `string` | yes | |
| `capture_client_version` | `string` | no | |
| `surface` | `string` | no | |
| `captured_batch_id` | `string` | no | |
| `created_at` | `string` | yes | Server ingest time |

### `ConversationTurnsResponse`

Body for `GET /v1/conversations/:id/turns`.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `conversation_id` | `string` | yes | Echo of the requested id |
| `turns` | `TurnRecord[]` | yes | Ordered `sequence` ASC (NULLs last), `created_at` ASC, `turn_id` ASC |
| `server_time` | `string` | yes | ISO-8601 |

### `ApiError`

Stable error envelope for 4xx/5xx JSON bodies.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `error` | `object` | yes | |
| `error.code` | `string` | yes | Machine-readable, e.g. `VALIDATION_ERROR` |
| `error.message` | `string` | yes | Human-readable |
| `error.details` | `unknown` | no | Field errors, etc. |

## Failure modes (contract-level)

| Case | Expected |
|------|----------|
| Empty `turns` | Reject with `ApiError` validation |
| Missing `client_turn_id` | Reject with `ApiError` validation |
| Unknown required field / wrong type | Reject with `ApiError` validation |
| Duplicate `client_turn_id` | Success path: counted in `duplicate` (Worker behavior) |

## Performance goals

- Types-only package: negligible cost; no runtime deps required for this milestone
- Prefer small JSON payloads suitable for batch upload of a handful of turns

## Test cases

| ID | Case | Expected |
|----|------|----------|
| CT-1 | Package exports all six upload/error types | TypeScript compiles |
| CT-2 | Sample `UploadRequest` satisfies types | Assignable without `any` |
| CT-3 | Sample `ApiError` satisfies types | Assignable without `any` |
| CT-4 | Sample `ConversationsResponse` / `ConversationTurnsResponse` satisfy types | Assignable without `any` |

## Open questions

1. Rename wire field `text` vs keep legacy `turn_text`? **Decision for this milestone: `text`.**
2. Should `user_id` move only to auth context later? Keep on `ConversationMetadata` for Phase 1 explicitness.
3. Runtime schema validation library — defer until Worker implementation.

## Related

- [Roadmap](./Roadmap.md)
- [API](./API.md)
- [TurnCapture](./TurnCapture.md)
- [Architecture](./Architecture.md)
- Code: `packages/contracts`
