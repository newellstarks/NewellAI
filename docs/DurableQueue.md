# Durable Queue

> **Status:** Notebook draft — not implemented yet.  
> **Implement only after this page is accepted.** Prompt: *Implement the Durable Queue exactly as specified in the engineering notebook (`docs/DurableQueue.md`).*

## Purpose

Why does this queue exist?

Turn capture must not lose messages when the Worker is briefly unavailable, D1 is slow, or the browser fires turns faster than we can persist them. The Durable Queue sits between ingest acceptance and durable storage so that:

1. The capture client gets a fast, reliable ACK
2. Turns are ordered (especially per session)
3. Persistence to D1 can retry without asking the operator to resend
4. We retain the sequencing role previously explored with Cloudflare Durable Objects / `/collect-turn`

Without a durable queue, failed or raced writes become silent gaps in conversation history—the opposite of Phase 1’s reliability goal.

## Requirements

What must it do?

| ID | Requirement |
|----|-------------|
| DQ-1 | Accept validated turn payloads from the Worker ingest path |
| DQ-2 | Persist queue items durably (survive Worker isolate restarts) |
| DQ-3 | Preserve **per-session order** for turns |
| DQ-4 | Deliver each item to the D1 writer **at least once**; consumers must be idempotent |
| DQ-5 | Retry failed D1 writes with bounded backoff |
| DQ-6 | Expose enough status for ops (depth, oldest age, last error) |
| DQ-7 | Work for customer zero first; remain multi-user-ready (`user_id` on every item) |
| DQ-8 | Config via env / bindings—no hard-coded credentials or user identity |

### Non-requirements (Phase 1)

- Exactly-once delivery across all failure modes (idempotent upserts instead)
- Cross-region multi-master queue
- Priority / weighted queues
- UI for queue browsing (API/metrics enough)

## Inputs / Outputs

### Inputs (enqueue)

From Worker after auth + schema validation (see [TurnCapture.md](./TurnCapture.md) draft payload):

| Field | Required | Notes |
|-------|----------|-------|
| `user_id` | yes | |
| `session_id` | yes | Partition / ordering key |
| `speaker` | yes | `user` \| `assistant` |
| `turn_text` | yes | |
| `client_turn_id` | yes | Client-generated idempotency key |
| `timestamp` | no | Server fills if missing |
| `sequence` | no | Queue / sequencer may assign |
| `message_type`, `topic`, `parent_turn_id`, `context_blob` | no | Pass-through |

### Outputs (dequeue → persist)

| Destination | Output |
|-------------|--------|
| D1 `turns` (and related tables) | Upserted row keyed for idempotency (`user_id` + `client_turn_id` or equivalent) |
| Metrics / logs | Enqueued, delivered, retried, dead-lettered counts |
| Dead-letter store (Phase 1 minimal) | Items that exhaust retries, with last error |

### Interface sketch (logical)

```
enqueue(turn) → { queue_id, accepted_at }
process_batch(limit) → { delivered, retried, dead_lettered }
status() → { depth, oldest_age_ms, last_error }
```

Concrete Cloudflare binding (Durable Object vs Queues vs D1-backed table) is an open question—see below. Record the choice as an ADR before coding.

## Failure modes

| Failure | Expected behavior |
|---------|-------------------|
| Invalid payload | Reject at Worker; **do not** enqueue |
| Auth failure | Reject at Worker; **do not** enqueue |
| Enqueue storage unavailable | Return retryable error to client; extension surfaces it |
| D1 write transient error | Remain in queue; retry with backoff |
| D1 write permanent / schema error | After max attempts → dead-letter; alert via logs |
| Duplicate enqueue (same `client_turn_id`) | Treat as success; do not double-write meaningful duplicates |
| Worker crash mid-process | Item remains queued; redelivered; consumer idempotent |
| Poison message (always fails) | Dead-letter after N attempts; do not block the session forever |

## Performance goals

| Goal | Target (Phase 1) |
|------|------------------|
| Enqueue ACK latency | p95 &lt; 100 ms under light load |
| End-to-end to D1 (happy path) | p95 &lt; 2 s after enqueue |
| Sustained throughput | ≥ 5 turns/sec for customer zero (burst OK) |
| Ordering | Strict FIFO **per `session_id`**; no global order required |
| Durability | No acknowledged turn lost across Worker restarts |
| Retry budget | Exponential backoff; max attempts configurable (default 5) |

## Test cases

| ID | Case | Expected |
|----|------|----------|
| T1 | Enqueue valid user + assistant turns for one session | Both persisted to D1 in order |
| T2 | Enqueue missing timestamp | Server timestamp set; item delivered |
| T3 | Duplicate `client_turn_id` | Single D1 row; second ACK success |
| T4 | D1 fails twice then succeeds | Item delivered after retries; no gap |
| T5 | D1 always fails | Item dead-lettered after max attempts; queue unblocked |
| T6 | Invalid payload | Not enqueued; 4xx |
| T7 | Worker restart with pending items | Pending items still process |
| T8 | Two sessions interleaved | Per-session order preserved for each |
| T9 | `status()` with pending + DLQ | Reports non-zero depth / errors usefully |

## Open questions

1. **Backing technology:** Cloudflare Queues, Durable Object (sequencer + storage), or D1 table as queue—what is Phase 1 default?
2. **Where does sequencing live?** Queue-assigned `sequence` vs separate Durable Object sequencer (as in earlier `/collect-turn` experiments)?
3. **Dead-letter storage:** D1 table vs R2 object vs log-only for Phase 1?
4. **Client retry policy:** Should the extension retry enqueue on 5xx, or rely on local outbound buffer first?
5. **Batch vs one-at-a-time** process loop for D1 writes?
6. **Multi-tenant isolation:** Shared queue with `user_id` filter vs per-user DO/queue later?

Resolve these in an ADR under `docs/ADRs/` before implementation.

## Related

- [TurnCapture](./TurnCapture.md)
- [Architecture](./Architecture.md)
- [API](./API.md)
- [Database](./Database.md)
- [ADRs](./ADRs/)
- Code (future): `worker/` (queue + consumer), `database/` (idempotent turns schema)
