# Database

**Chapter 7 — Database**

| | |
|---|---|
| **Status** | Draft |
| **Purpose** | D1 and local SQLite strategy; schema direction before migrations land. |
| **Prerequisites** | [Chapter 5 — Shared Contracts](./Contracts.md), [Chapter 6 — API](./API.md) |
| **Related chapters** | [Architecture](./Architecture.md), [TurnCapture](./TurnCapture.md), [Roadmap](./Roadmap.md) |
| **Nav** | [← Prev](./API.md) · [TOC](./README.md#table-of-contents) · [Next →](./CaptureClient.md) |

---

## Strategy

| Store | Role |
|-------|------|
| Cloudflare **D1** | Authoritative cloud store for turns (via Worker ingest) |
| Local **SQLite** | Periodic mirror for inspection, backup, and offline review |

Schema SQL lives in `migrations/`. Worker config: `apps/worker/wrangler.toml`.

Users of a commercial service are expected to keep a paid Cloudflare account for reliability and scope.

## Design constraints

- Schemas must support multiple users and sessions even if Phase 1 has one operator
- Avoid embedding a single permanent user identity in table or column assumptions
- Prefer migrations under `migrations/` that apply cleanly to both D1 and local SQLite where practical

## Planned entities (draft)

| Entity | Purpose |
|--------|---------|
| `users` | Account identity (Phase 1: one row) |
| `sessions` | Conversation / chat sessions |
| `turns` | Ordered user/assistant messages within a session |

Exact columns and indexes will be defined in migrations under `migrations/` and recorded via ADRs when locked.

## Later capabilities

- Preload from ChatGPT history export into SQLite / D1
- Optional per-user encryption with a key held only by the user

## Related

- [Architecture](./Architecture.md)
- [API](./API.md)
- [TurnCapture](./TurnCapture.md)
- [ADRs](./ADRs/)
- Code: `migrations/`
- Worker: `apps/worker/`
