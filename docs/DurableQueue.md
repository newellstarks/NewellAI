# Durable Queue

**Chapter 11 — Durable Queue**

| | |
|---|---|
| **Status** | Draft |
| **Purpose** | Capture Client v1 local buffer, order, retry, and sync (not Worker-owned). |
| **Prerequisites** | [Chapter 9 — Capture Client v1](./CaptureClient.md), [Chapter 10 — Turn Capture](./TurnCapture.md), [Chapter 6 — API](./API.md), [Chapter 7 — Authentication](./Authentication.md) |
| **Related chapters** | [ADR-0002](./ADRs/0002-durable-queue-in-extension.md), [Contracts](./Contracts.md), [Roadmap](./Roadmap.md) |
| **Nav** | [← Prev](./TurnCapture.md) · [TOC](./README.md#table-of-contents) · [Next →](./SubsystemTemplate.md) |

---
> **Status:** Notebook draft — **Phase 2** (Capture Client v1). Do not implement before Phase 1 Foundation is done.  
> **Location:** Capture Client v1 / Chrome extension (`apps/extension`) — **not** the Cloudflare Worker.  
> **Implement only after this page is accepted and Foundation exists.** Prompt: *Implement the Durable Queue exactly as specified in the engineering notebook (`docs/DurableQueue.md`).*

## Purpose

Why does this queue exist?

Turn capture must not lose messages when the network drops, the Worker is briefly unavailable, or ChatGPT fires turns faster than sync can complete. For **Capture Client v1**, the Durable Queue lives **in the Chrome extension** so that:

1. Captured turns are stored on the device immediately (survive browser restarts where storage allows)
2. This client can retry authenticated ingest without asking the operator to re-speak the conversation
3. Per-session order is preserved on the client before sync
4. The Worker stays a simple, reliable **ingest + validate + D1 persist** service—not a queue runtime

**Crystal-clear split:**

| Component | Owns |
|-----------|------|
| Capture Client v1 Durable Queue | Buffer, order, retry, local durability (this adapter) |
| Cloudflare Worker | Authenticated ingest API, validation, and D1 persistence |

Without a client-side durable queue for v1, failed syncs become silent gaps in conversation history.

## Requirements

What must it do?

| ID | Requirement |
|----|-------------|
| DQ-1 | Accept normalized turn payloads from the extension capture path |
| DQ-2 | Persist queue items locally in the extension (survive service-worker restarts; prefer durable extension storage) |
| DQ-3 | Preserve **per-session order** when syncing |
| DQ-4 | Deliver each item to the Worker ingest API **at least once**; server must be idempotent |
| DQ-5 | Retry failed ingest with bounded backoff |
| DQ-6 | Expose status to the operator (pending count, last error) |
| DQ-7 | Work for customer zero first; remain multi-user-ready (`user_id` on every item) |
| DQ-8 | Config via extension options / env-backed build—no hard-coded credentials |

### Non-requirements (for Capture Client v1 queue)

- Server-side / Cloudflare Queues or Durable Object as the primary buffer
- Exactly-once delivery (idempotent ingest instead)
- Priority queues
- Full queue browser UI (badge / simple status enough)

## Inputs / Outputs

### Inputs (enqueue — local)

From extension capture after normalize (see [TurnCapture.md](./TurnCapture.md)):

| Field | Required | Notes |
|-------|----------|-------|
| `user_id` | yes | |
| `session_id` | yes | Ordering key |
| `speaker` | yes | `user` \| `assistant` |
| `turn_text` | yes | |
| `client_turn_id` | yes | Idempotency key for Worker / D1 |
| `timestamp` | no | Extension or server may fill |
| `sequence` | no | Extension may assign local sequence |
| `message_type`, `topic`, `parent_turn_id`, `context_blob` | no | Pass-through |

### Outputs (dequeue → sync)

| Destination | Output |
|-------------|--------|
| Worker `POST /v1/turns` (or equivalent) | Authenticated ingest of one or more turns |
| D1 (via Worker) | Persisted after Worker validation |
| Extension status | Pending depth, last sync error, last success time |

### Interface sketch (logical — extension)

```
enqueue(turn) → { queue_id, accepted_at }
sync_batch(limit) → { delivered, retried, failed }
status() → { depth, oldest_age_ms, last_error }
```

Local backing store (chrome.storage / IndexedDB / etc.) is an open question—record via ADR before coding.

## Failure modes

| Failure | Expected behavior |
|---------|-------------------|
| Invalid local payload | Do not enqueue; log for developer |
| Local storage full / unavailable | Surface error to operator; do not claim capture succeeded |
| Network / Worker 5xx | Remain in queue; retry with backoff |
| Worker 4xx validation | After policy (fix vs poison): fix or dead-letter locally; do not spin forever |
| Auth failure | Remain queued; surface auth error; retry after credentials fixed |
| Duplicate sync (same `client_turn_id`) | Worker returns success; dequeue |
| Extension restart with pending items | Pending items still sync in order |

## Performance goals

| Goal | Target (Capture Client v1) |
|------|------------------|
| Local enqueue latency | p95 &lt; 50 ms |
| Sync to Worker (happy path) | p95 &lt; 2 s after enqueue when online |
| Sustained capture | ≥ 5 turns/sec burst without dropping |
| Ordering | Strict FIFO **per `session_id`** on sync |
| Durability | No locally acknowledged turn lost across normal extension restarts |
| Retry budget | Exponential backoff; max attempts configurable (default 5) then local dead-letter |

## Test cases

| ID | Case | Expected |
|----|------|----------|
| T1 | Enqueue user + assistant turns for one session; online | Both reach D1 via Worker in order |
| T2 | Enqueue while offline | Items pending; sync when online |
| T3 | Duplicate `client_turn_id` sync | Single D1 row; queue item cleared |
| T4 | Worker fails twice then succeeds | Delivered after retries |
| T5 | Worker always 500 | Dead-letter after max attempts; queue unblocked for other items |
| T6 | Extension restart with pending queue | Pending items still process |
| T7 | Two sessions interleaved | Per-session order preserved |
| T8 | `status()` with pending | Reports depth / last error usefully |

## Open questions

1. **Local store:** `chrome.storage.local` vs IndexedDB vs both?
2. **Service worker lifetime:** How do we guarantee sync continues when the SW is suspended?
3. **Batch size:** One turn per request vs batched `POST`?
4. **Dead-letter UX:** Badge only vs options-page list for Capture Client v1?
5. **Sequence authority:** Extension-assigned sequence vs Worker-assigned on ingest?

Resolve via ADR under `docs/ADRs/` before implementation.

## Related

- [TurnCapture](./TurnCapture.md)
- [CaptureClient](./CaptureClient.md)
- [Architecture](./Architecture.md)
- [API](./API.md)
- [Database](./Database.md)
- [ADRs](./ADRs/)
- Code (future): `apps/extension` (Capture Client v1 queue + sync), `apps/worker` (ingest only—no queue)
