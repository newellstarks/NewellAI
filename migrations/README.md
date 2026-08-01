# D1 migrations

Versioned SQL for Cloudflare D1 (authoritative turn store).

Schema and write behavior: [Database.md](../docs/Database.md). Local SQLite mirror strategy lives there too.

## Migrations

| File | Contents |
|------|----------|
| `0001_init.sql` | `users`, `conversations`, `turns` + idempotency constraint |

## Apply

```bash
# from apps/worker (uses wrangler.toml migrations_dir)
npx wrangler d1 migrations apply newellai --local    # local dev
npx wrangler d1 migrations apply newellai --remote   # production
```

## Conventions

- Name files `NNNN_description.sql` (e.g. `0001_init.sql`)
- Idempotent ingest key: `UNIQUE (conversation_id, client_turn_id)` on `turns`
