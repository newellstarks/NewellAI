# ADR-0005: Use Cloudflare D1 for turn persistence

## Status

Accepted

## Date

2026-08-01

## Context

Phase 1 needs an authoritative cloud store for captured turns behind the Worker ingest API (`POST /v1/turns`). The schema is relational (users → conversations → turns) and the wire protocol requires idempotent writes on `client_turn_id` ([Contracts.md](../Contracts.md), [Database.md](../Database.md)).

## Constraints

- Ingest already runs on a Cloudflare Worker; the store must be reachable from Workers with low latency
- Single operator in Phase 1, but schema and access must stay multi-user capable
- Low cost at Phase 1 scale (a handful of turns per session, batch uploads)
- Idempotency must be enforceable in the store itself (unique constraint), not in application memory
- Users of a commercial service are expected to keep a paid Cloudflare account ([Database.md](../Database.md))

## Options Considered

### Option A — Cloudflare D1

SQLite-dialect SQL database with native Worker bindings.
Benefits: relational schema + `UNIQUE` constraint enforce the idempotency contract directly; native `env.DB` binding (no connection management or secrets); Wrangler migrations; local dev runs against local SQLite automatically; effectively free at Phase 1 scale; SQLite dialect matches the planned local SQLite mirror.
Risks: Cloudflare lock-in; D1 size/throughput limits; single-primary (no read replicas yet); younger product than managed Postgres.

### Option B — Workers KV

Key-value store, native to Workers.
Benefits: simple, fast reads.
Risks: no relational structure, no unique constraints (idempotency pushed to application logic), eventually consistent — wrong shape for ordered conversational data.

### Option C — Durable Objects storage

Per-object transactional storage.
Benefits: strong consistency per conversation.
Risks: data sharded per object with no cross-conversation SQL; queries/inspection much harder; more moving parts than Phase 1 needs.

### Option D — External managed Postgres (e.g. Neon, Supabase)

Benefits: mature SQL, fewer platform limits, portable.
Risks: connection management from Workers (pooling/HTTP drivers), an extra vendor and secret to manage, cost and latency overhead unjustified at Phase 1 scale.

## Decision

Use **Cloudflare D1** as the authoritative store for users, conversations, and turns (binding `DB`, schema in `migrations/`, behavior in [Database.md](../Database.md)).

## Rationale

D1 is the only option that satisfies all constraints with no new infrastructure: the `UNIQUE (conversation_id, client_turn_id)` constraint implements the idempotency contract in the store; the native binding keeps the Worker free of connection and credential management; migrations and local development are already part of the existing Wrangler toolchain; and the SQLite dialect aligns with the planned local SQLite mirror. Postgres-class capabilities are not needed at Phase 1 scale.

## Consequences

- Deeper Cloudflare commitment (Worker + D1); acceptable given the platform decision already made for ingest
- Schema stays in the SQLite dialect; the local mirror can share migration SQL where practical
- D1 platform limits (database size, write throughput, single primary) become the scaling boundary to watch
- No queue in the database layer: clients retry against idempotent ingest ([ADR-0002](./0002-durable-queue-in-extension.md))

## Evidence Required to Revisit

- Sustained write throughput or database size approaching documented D1 limits
- Measured multi-region read latency that materially degrades the product
- Reliability evidence: recurring D1 outages or data-integrity incidents
- A required capability D1 cannot provide (e.g. read replicas, cross-database queries) blocking a committed roadmap item
- Cost at commercial scale exceeding a managed-Postgres alternative
