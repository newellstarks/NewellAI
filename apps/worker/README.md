# Cloudflare Worker (`@newellai/worker`)

**Authenticated ingest API, validation, and D1 persistence** (roadmap).

Current slice: **ingest skeleton** — `POST /v1/turns` validates the wire protocol and returns a skeleton `UploadResponse`. No auth, D1, or retries yet.

Does **not** own the durable queue — Capture Client v1 ([ADR-0002](../../docs/ADRs/0002-durable-queue-in-extension.md)).

## Docs

- [API.md](../../docs/API.md)
- [Contracts.md](../../docs/Contracts.md)
- [Roadmap.md](../../docs/Roadmap.md)

## Develop

```bash
# from repo root
npm install
npm test -w @newellai/worker
cd apps/worker && npx wrangler dev
```
