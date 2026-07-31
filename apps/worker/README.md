# Cloudflare Worker (`@newellai/worker`)

**Authenticated ingest API, validation, and D1 persistence** (roadmap).

Current slices: **ingest skeleton** + **shared-secret authentication** (`CAPTURE_API_TOKEN`). No D1 writes yet.

Does **not** own the durable queue — Capture Client v1 ([ADR-0002](../../docs/ADRs/0002-durable-queue-in-extension.md)).

## Docs

- [Authentication.md](../../docs/Authentication.md) — auth design and test cases
- [API.md](../../docs/API.md) — routes (links to Authentication)
- [Contracts.md](../../docs/Contracts.md)
- [Roadmap.md](../../docs/Roadmap.md)

## Auth (local)

Set the shared secret for Wrangler:

```bash
# apps/worker/.dev.vars (gitignored)
CAPTURE_API_TOKEN=dev-secret
```

Protected route: `POST /v1/turns` with `Authorization: Bearer <token>`.  
`GET /health` stays public.

## Develop

```bash
# from repo root
npm install
npm test -w @newellai/worker
cd apps/worker && npx wrangler dev
```
