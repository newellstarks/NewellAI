# API

## Role

The Cloudflare Worker exposes a **client-agnostic ingest API** over the [wire protocol](./Contracts.md).

Full Phase 1 eventually includes authentication and D1 persistence. **This slice implements ingest skeleton only.**

## Current slice — Worker ingest (no auth / no persistence)

| In scope | Out of scope (later) |
|----------|----------------------|
| `GET /health` | Authentication |
| `POST /v1/turns` routing | D1 / durable upload persistence |
| Parse + validate `UploadRequest` | Retries / queue logic |
| `UploadResponse` / `ApiError` envelopes | Session list / turn recall handlers |
| Tests for request parsing / validation | Business rules beyond shape validation |

After a valid `POST /v1/turns`, the Worker returns a **skeleton** `UploadResponse` (`accepted` = turn count, `duplicate` = 0) without writing storage. That proves the wire protocol end-to-end before auth and D1 land.

## Endpoints

| Method | Path | Status |
|--------|------|--------|
| `GET` | `/health` | Implemented (liveness) |
| `POST` | `/v1/turns` | Implemented (validate + skeleton response) |
| `GET` | `/v1/sessions` | Not yet |
| `GET` | `/v1/sessions/:id/turns` | Not yet |

## Error codes (this slice)

| `error.code` | HTTP | When |
|--------------|------|------|
| `NOT_FOUND` | 404 | Unknown route |
| `METHOD_NOT_ALLOWED` | 405 | Wrong method on known path |
| `INVALID_JSON` | 400 | Body is not JSON |
| `VALIDATION_ERROR` | 400 | Body fails `UploadRequest` shape rules |
| `INTERNAL_ERROR` | 500 | Unexpected failure |

## Principles

- Wire protocol from [Contracts.md](./Contracts.md) only
- Validate before any future persist step
- No hard-coded secrets in this slice (auth comes next)
- Idempotent persist on `client_turn_id` comes with durable upload — not this slice

## Related

- [Contracts](./Contracts.md)
- [Roadmap](./Roadmap.md)
- [Architecture](./Architecture.md)
- [Database](./Database.md)
- Code: `apps/worker/`
