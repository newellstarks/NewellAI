# API

**Chapter 6 — API**

| | |
|---|---|
| **Status** | Active |
| **Purpose** | Worker HTTP surface: ingest routes, validation, and error envelopes. |
| **Prerequisites** | [Chapter 5 — Shared Contracts](./Contracts.md) |
| **Related chapters** | [Authentication](./Authentication.md), [Architecture](./Architecture.md), [Database](./Database.md), [Roadmap](./Roadmap.md) |
| **Nav** | [← Prev](./Contracts.md) · [TOC](./README.md#table-of-contents) · [Next →](./Authentication.md) |

---

## Role

The Cloudflare Worker exposes a **client-agnostic ingest API** over the [wire protocol](./Contracts.md).

**Current slices:** ingest skeleton + shared-secret authentication. D1 persistence remains next.

**Authentication design and policy** live in [Chapter 7 — Authentication](./Authentication.md). This page only summarizes route-level behavior.

## Goals (this subsystem)

1. **Accept** an upload request (`POST /v1/turns`)
2. **Authenticate** callers of protected routes per [Authentication.md](./Authentication.md) before touching the body
3. **Validate** structure against the wire protocol
4. **Return** appropriate success (`UploadResponse`) or error (`ApiError`) responses
5. Leave **TODOs** where D1 persistence will be added later
6. **Do not** write to the database yet

## Authentication (route-level)

| Route | Auth |
|-------|------|
| `GET /health` | Public |
| `POST /v1/turns` | `Authorization: Bearer <token>` validated against `CAPTURE_API_TOKEN` |

On `/v1/turns`: server `X-Request-Id` first → authenticate → then body parse / validation / (future) D1. Failures: sanitized `401` + `WWW-Authenticate: Bearer`, or fail-closed `500` if the secret is missing.

Full policy (header parsing, timing-safe compare, request-id rules, misconfiguration logging, test cases AUTH-1…15): **[Authentication.md](./Authentication.md)**.

## Endpoints

| Method | Path | Auth | Status |
|--------|------|------|--------|
| `GET` | `/health` | Public | Implemented (liveness) |
| `POST` | `/v1/turns` | Bearer — see [Authentication](./Authentication.md) | Implemented (auth + validate + skeleton response) |
| `GET` | `/v1/sessions` | — | Not yet |
| `GET` | `/v1/sessions/:id/turns` | — | Not yet |

## Error codes (this slice)

| `error.code` | HTTP | When |
|--------------|------|------|
| `UNAUTHORIZED` | 401 | Auth failure on protected routes — see [Authentication](./Authentication.md) |
| `NOT_FOUND` | 404 | Unknown route |
| `METHOD_NOT_ALLOWED` | 405 | Wrong method on known path |
| `INVALID_JSON` | 400 | Body is not JSON (only after successful auth) |
| `VALIDATION_ERROR` | 400 | Body fails `UploadRequest` shape rules (only after successful auth) |
| `INTERNAL_ERROR` | 500 | Unexpected failure or auth misconfiguration — see [Authentication](./Authentication.md) |

## Principles

- Wire protocol from [Contracts.md](./Contracts.md) only
- Auth policy from [Authentication.md](./Authentication.md) — do not re-specify it here
- Validate before any future persist step
- Idempotent persist on `client_turn_id` comes with durable upload / D1 — not this slice

## Related

- [Authentication](./Authentication.md) — authoritative auth design
- [Contracts](./Contracts.md)
- [Roadmap](./Roadmap.md)
- [Architecture](./Architecture.md)
- [Database](./Database.md)
- Code: `apps/worker/`
