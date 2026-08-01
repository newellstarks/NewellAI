# Cloudflare Worker (`@newellai/worker`)

**Authenticated ingest API, validation, and D1 persistence.**

`POST /v1/turns`: authenticate → validate → persist conversation + turns to D1 (idempotent on `client_turn_id`) → real `accepted` / `duplicate` counts. No queue logic, no retries.

Read endpoints (FR-F6): `GET /v1/conversations` (summaries) and `GET /v1/conversations/:id/turns` (ordered turns) — same Bearer auth, no pagination in Phase 1.

Does **not** own the durable queue — Capture Client v1 ([ADR-0002](../../docs/ADRs/0002-durable-queue-in-extension.md)).

## Docs

- [Authentication.md](../../docs/Authentication.md) — auth design and test cases
- [Database.md](../../docs/Database.md) — schema and persistence behavior
- [API.md](../../docs/API.md) — routes (links to Authentication / Database)
- [Contracts.md](../../docs/Contracts.md)
- [Roadmap.md](../../docs/Roadmap.md)

## Auth (local)

Set the shared secret for Wrangler:

```bash
# apps/worker/.dev.vars (gitignored)
CAPTURE_API_TOKEN=dev-secret
```

Protected routes: `POST /v1/turns`, `GET /v1/conversations`, and `GET /v1/conversations/:id/turns` with `Authorization: Bearer <token>`.  
`GET /health` stays public.

## Develop

```bash
# from repo root
npm install
npm test -w @newellai/worker

# local dev (D1 binding runs against a local SQLite automatically)
cd apps/worker
npx wrangler d1 migrations apply newellai --local
npx wrangler dev
```

For production: `npx wrangler d1 create newellai`, put the id in `wrangler.toml`, then `npx wrangler d1 migrations apply newellai --remote`.
