# API

## Role

The Cloudflare Worker exposes a **client-agnostic ingest API** over the [wire protocol](./Contracts.md).

Full Phase 1 eventually includes authentication and D1 persistence. **This slice implements ingest skeleton only.**

## Goals (this subsystem — modest)

1. **Accept** an upload request (`POST /v1/turns`)
2. **Validate** its structure against the wire protocol
3. **Return** appropriate success (`UploadResponse`) or error (`ApiError`) responses
4. Leave **TODOs** where authentication and D1 persistence will be added later
5. **Do not** write to the database yet

That keeps a clean, testable API surface before adding complexity.

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
