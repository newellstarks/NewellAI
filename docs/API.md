# API

## Role

The Cloudflare Worker exposes HTTP endpoints for turn ingest and retrieval. The Chrome extension is the primary write client in Phase 1.

## Principles

- Keep contracts small and versionable
- Config / secrets via environment bindings—not hard-coded values
- Validate payloads before writing to D1
- Design routes so multi-user auth can replace Phase 1 shared-secret auth later

## Draft endpoints (to be implemented)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/v1/turns` | Ingest one or more turns |
| `GET` | `/v1/sessions` | List sessions for the authenticated user |
| `GET` | `/v1/sessions/:id/turns` | Retrieve turns for a session |
| `GET` | `/health` | Liveness check |

Payload shapes and auth headers will be locked in ADRs as implementation starts.

## Related

- [Architecture](./Architecture.md)
- [Database](./Database.md)
- [TurnCapture](./TurnCapture.md)
- [ChromeExtension](./ChromeExtension.md)
- Code: `worker/`
