# Authentication

**Chapter 7 — Authentication**

| | |
|---|---|
| **Status** | Active |
| **Purpose** | Full design and policy for Phase 1 Worker authentication (shared bearer token). |
| **Prerequisites** | [Chapter 5 — Shared Contracts](./Contracts.md), [Chapter 6 — API](./API.md) |
| **Related chapters** | [API](./API.md) (route-level summary), [Roadmap](./Roadmap.md), [Architecture](./Architecture.md), [Database](./Database.md) |
| **Nav** | [← Prev](./API.md) · [TOC](./README.md#table-of-contents) · [Next →](./Database.md) |

---

This chapter is the **authoritative authentication design**. [API.md](./API.md) keeps only concise route-level behavior and links here—do not duplicate policy in both places.

## Purpose

Protect Worker ingest so only holders of a configured shared secret can upload turns, without introducing OAuth, JWT, sessions, users, or roles in Phase 1.

## Requirements

| ID | Requirement |
|----|-------------|
| AUTH-R1 | `GET /health` remains public (no `Authorization`) |
| AUTH-R2 | `POST /v1/turns` requires `Authorization: Bearer <token>` |
| AUTH-R3 | Validate the presented token against Worker env / binding `CAPTURE_API_TOKEN` (never hard-coded) |
| AUTH-R4 | Create server `X-Request-Id` **before** authentication on `/v1/turns` |
| AUTH-R5 | Authenticate **before** body parsing, validation, or any future D1 access |
| AUTH-R6 | Auth failures return sanitized `401` with `WWW-Authenticate: Bearer` |
| AUTH-R7 | Missing / empty `CAPTURE_API_TOKEN` fails closed: `500` `INTERNAL_ERROR`, generic client message, internal log `AUTH_CONFIGURATION_MISSING` only |

### Non-requirements

- OAuth / OIDC
- JWT validation
- Sessions / cookies
- Users, roles, or per-caller identity stores
- D1 writes (out of scope for this chapter)

## Credential and header policy

| Topic | Policy |
|-------|--------|
| Scheme | `Bearer` only; scheme match is **case-insensitive** (`bearer` / `BEARER` / `Bearer`) |
| Spacing | Extra spaces after the scheme are allowed; leading/trailing header whitespace may be trimmed as **format** only |
| Token | No further normalization of the token (no case-folding, stripping, or partial compares) |
| Empty token | `Bearer` / `Bearer ` → unauthorized |
| Unsupported schemes | `Basic`, `Token`, `Digest`, bare secrets, etc. → unauthorized (same sanitized 401) |
| Multi-value | Combined / comma-joined `Authorization` values → unauthorized |
| Compare | Timing-safe compare in the Worker (hash both sides, then constant-time digest compare—no naive `===` on the secret) |

## Request ID policy

| Topic | Policy |
|-------|--------|
| Generator | Server creates an opaque UUID **before** authentication |
| Scope | Every `/v1/turns` response (200 / 400 / 401 / 405 / 500) includes `X-Request-Id` |
| Client header | Client-supplied `X-Request-Id` is **ignored** (overwritten) |
| Contents | IDs never include body content, credentials, or other request material |

## Processing order (`POST /v1/turns`)

```
create X-Request-Id
  → authenticate (Bearer / CAPTURE_API_TOKEN)
  → parse JSON body
  → validate UploadRequest
  → (future) D1 persist
  → UploadResponse
```

Wrong method on `/v1/turns` returns `405` **with** `X-Request-Id` (id is still created first). Auth is not required for the method check, but auth always runs before any body access on `POST`.

## Failure modes

| Case | HTTP | `error.code` | Notes |
|------|------|--------------|-------|
| Missing / malformed / wrong Bearer | 401 | `UNAUTHORIZED` | Same sanitized body; `WWW-Authenticate: Bearer`; `X-Request-Id` |
| Missing / empty `CAPTURE_API_TOKEN` | 500 | `INTERNAL_ERROR` | Message: `Unexpected server error`; no token-related detail; log `AUTH_CONFIGURATION_MISSING`; fail closed before body parse |
| Valid auth + bad JSON | 400 | `INVALID_JSON` | Only after successful auth |
| Valid auth + invalid shape | 400 | `VALIDATION_ERROR` | Only after successful auth |

Do **not** leak which auth check failed (missing vs wrong vs unsupported scheme).

## Inputs / Outputs

| Direction | Detail |
|-----------|--------|
| Input | `Authorization` header; env `CAPTURE_API_TOKEN` |
| Output (success path) | Proceed to ingest validation (see [API.md](./API.md)) |
| Output (auth failure) | `ApiError` with `UNAUTHORIZED` + `WWW-Authenticate: Bearer` |
| Output (misconfig) | `ApiError` with `INTERNAL_ERROR` (generic) |

Wire payload shapes are unchanged—auth is transport/header policy only ([Contracts.md](./Contracts.md)).

## Performance goals

- Auth overhead negligible vs JSON parse/validate
- Timing-safe compare must not regress to early `===` exits on the raw secret

## Test cases

| ID | Case | Expected |
|----|------|----------|
| AUTH-1 | `GET /health` without `Authorization` | `200`, body ok |
| AUTH-2 | `POST /v1/turns` missing `Authorization` | `401`, `UNAUTHORIZED`, `WWW-Authenticate: Bearer`, `X-Request-Id`; sanitized message |
| AUTH-3 | `POST /v1/turns` wrong Bearer token | `401`, same sanitized shape as AUTH-2 |
| AUTH-4 | `POST /v1/turns` malformed / non-Bearer scheme | `401`, same sanitized shape as AUTH-2 |
| AUTH-5 | `POST /v1/turns` valid Bearer + valid body | `200` `UploadResponse` + server `X-Request-Id` |
| AUTH-6 | Missing/invalid auth + invalid JSON body | `401` — **not** `INVALID_JSON` |
| AUTH-7 | Valid Bearer + invalid JSON | `400` `INVALID_JSON` + `X-Request-Id` |
| AUTH-8 | Valid Bearer + empty `turns` | `400` `VALIDATION_ERROR` + `X-Request-Id` |
| AUTH-9 | Client sends `X-Request-Id` | Ignored; response id is a fresh server UUID |
| AUTH-10 | Missing / empty `CAPTURE_API_TOKEN` + any body | `500` `INTERNAL_ERROR`, no token detail; log `AUTH_CONFIGURATION_MISSING`; not `INVALID_JSON` |
| AUTH-11 | Scheme case variants (`bearer` / `BEARER`) | Accepted when token matches |
| AUTH-12 | Extra spaces after `Bearer`; trailing header whitespace | Accepted when token matches |
| AUTH-13 | Empty Bearer token (`Bearer` / `Bearer `) | `401` sanitized |
| AUTH-14 | Unsupported schemes (`Basic`, `Token`, …) | `401` sanitized |
| AUTH-15 | Combined / multi-value `Authorization` (comma) | `401` sanitized |

## Local development pairing

`POST /v1/dev/pair` is **not** a Bearer route. It exists only so Capture Client v1 can obtain `CAPTURE_API_TOKEN` on loopback without Terminal copy/paste. Full operator policy: [CaptureClient.md](./CaptureClient.md).

| Gate | Requirement |
|------|-------------|
| Env | `ALLOW_LOCAL_PAIRING=true` (absent/false → behave as unavailable / `404`) |
| Env | `PAIRING_EXTENSION_ORIGIN=chrome-extension://<exact-id>` |
| Host | Request URL host is `127.0.0.1` or `localhost` |
| Origin | Exact match to `PAIRING_EXTENSION_ORIGIN`; reject missing, `null`, web, and other extensions |
| CORS | Reflect **only** that exact origin — never `*` |
| Method | `POST` (+ `OPTIONS` preflight for that origin); `GET` rejected |
| One-shot | One successful response per Worker process start |
| Headers | `Cache-Control: no-store` |
| Logging | Never log token or response body |
| Production | Must remain disabled / unavailable in remote deployment configuration |

## Local Desktop Recall session

Desktop Recall (`/recall/`) must not require pasting `CAPTURE_API_TOKEN` for normal local use.

| Item | Behavior |
|------|----------|
| Mint | `POST /v1/dev/recall/session` — loopback + `ALLOW_LOCAL_PAIRING=true` only |
| Cookie | `recall_session` — opaque id; `HttpOnly; SameSite=Strict; Path=/`; not `Secure` on plain `http://127.0.0.1` |
| Body | Mint/revoke responses never include `CAPTURE_API_TOKEN` |
| Scope `recall_read` | Cookie authorizes **GET** Recall read APIs only (status, conversations, turns, artifacts metadata/content, search) |
| Scope `capture_full` | `Authorization: Bearer <CAPTURE_API_TOKEN>` — unchanged full capture/write |
| Revoke | `POST /v1/dev/recall/session/revoke` clears cookie + server session |
| Restart | In-memory sessions die with the Worker isolate; Connect once again |
| Remote | Non-loopback mint unavailable (`404`); pairing flag off → unavailable |
| Fallback | Recall UI may offer Advanced paste of capture Bearer for recovery only; never embed the capture token in static HTML/JS |

Read APIs accept either `capture_full` or `recall_read`. Ingest and artifact **writes** require `capture_full` only.

## Open questions

1. When does Phase 1 graduate from shared secret to per-user credentials? Defer via ADR when multi-user onboarding starts.
2. Should `user_id` on `ConversationMetadata` remain client-asserted while auth is only a shared secret? See [Contracts.md](./Contracts.md) open questions—unchanged for this slice.

## Related

- [API](./API.md) — route table and concise auth summary
- [CaptureClient](./CaptureClient.md) — operator pairing / export-import
- [Contracts](./Contracts.md)
- [Roadmap](./Roadmap.md)
- [Architecture](./Architecture.md)
- [Database](./Database.md)
- Code: `apps/worker/src/auth.ts`, `apps/worker/src/requestId.ts`
