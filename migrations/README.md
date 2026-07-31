# D1 migrations

Versioned SQL for Cloudflare D1 (authoritative turn store).

Local SQLite mirror strategy is described in [Database.md](../docs/Database.md).

## Status

Scaffold only. First migration lands after schema is locked in the notebook / ADR.

## Conventions

- Name files `NNNN_description.sql` (e.g. `0001_init_turns.sql`)
- Apply with Wrangler once `apps/worker` D1 bindings are configured
- Prefer idempotent ingest keys (`client_turn_id`) as required by the extension durable queue
