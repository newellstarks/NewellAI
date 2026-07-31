# API

## Role

The Cloudflare Worker exposes an **authenticated ingest API**, performs **validation**, and handles **D1 persistence**.

This API is **client-agnostic**. Capture Client v1 (Chrome extension) is one caller; Phase 3 clients use the same contracts. The Worker does not run the durable queue (that is a Capture Client v1 concern — see [DurableQueue.md](./DurableQueue.md)).

## Principles

- Keep contracts small and versionable
- Config / secrets via environment bindings—not hard-coded values
- Validate payloads before writing to D1
- Idempotent ingest on `client_turn_id` (any client may retry)
- Design routes so multi-user auth can replace Phase 1 shared-secret auth later

## Draft endpoints (to be implemented)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/v1/turns` | Authenticated ingest of one or more turns → validate → D1 |
| `GET` | `/v1/sessions` | List sessions for the authenticated user |
| `GET` | `/v1/sessions/:id/turns` | Retrieve turns for a session |
| `GET` | `/health` | Liveness check |

Payload shapes are the **wire protocol** defined in [Contracts.md](./Contracts.md) (`UploadRequest`, `UploadResponse`, `ApiError`, …). Every future client uses the same protocol.

## Related

- [Contracts](./Contracts.md)
- [Architecture](./Architecture.md)
- [Database](./Database.md)
- [TurnCapture](./TurnCapture.md)
- [DurableQueue](./DurableQueue.md)
- [CaptureClient](./CaptureClient.md)
- [Roadmap](./Roadmap.md)
- [ADR-0002](./ADRs/0002-durable-queue-in-extension.md)
- Code: `apps/worker/`
