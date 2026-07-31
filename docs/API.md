# API

## Role

The Cloudflare Worker exposes an **authenticated ingest API**, performs **validation**, and handles **D1 persistence**.

The Chrome extension is the write client and owns the **Durable Queue**. The Worker does not run the primary queue.

## Principles

- Keep contracts small and versionable
- Config / secrets via environment bindings—not hard-coded values
- Validate payloads before writing to D1
- Idempotent ingest on `client_turn_id` (extension may retry)
- Design routes so multi-user auth can replace Phase 1 shared-secret auth later

## Draft endpoints (to be implemented)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/v1/turns` | Authenticated ingest of one or more turns → validate → D1 |
| `GET` | `/v1/sessions` | List sessions for the authenticated user |
| `GET` | `/v1/sessions/:id/turns` | Retrieve turns for a session |
| `GET` | `/health` | Liveness check |

Payload shapes and auth headers will be locked in ADRs as implementation starts.

## Related

- [Architecture](./Architecture.md)
- [Database](./Database.md)
- [TurnCapture](./TurnCapture.md)
- [DurableQueue](./DurableQueue.md)
- [ChromeExtension](./ChromeExtension.md)
- [ADR-0002](./ADRs/0002-durable-queue-in-extension.md)
- Code: `apps/worker/`
