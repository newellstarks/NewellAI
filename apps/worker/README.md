# Cloudflare Worker (`@newellai/worker`)

**Authenticated ingest API, validation, and D1 persistence.**

Does **not** own the durable queue — that lives in the extension ([ADR-0002](../../docs/ADRs/0002-durable-queue-in-extension.md)).

## Status

Scaffold only. No routes or persistence logic yet.

## Docs

- [API.md](../../docs/API.md)
- [Database.md](../../docs/Database.md)
- [Architecture.md](../../docs/Architecture.md)

## Develop

```bash
# from repo root
npm install
cd apps/worker
npx wrangler dev
```
