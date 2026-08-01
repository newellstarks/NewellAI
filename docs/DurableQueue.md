# Durable Queue

**Chapter 11 — Durable Queue**

| | |
|---|---|
| **Status** | Active |
| **Purpose** | Capture Client v1 local buffer, order, retry, and sync (not Worker-owned). |
| **Prerequisites** | [Chapter 9 — Capture Client v1](./CaptureClient.md), [Chapter 10 — Turn Capture](./TurnCapture.md), [Chapter 6 — API](./API.md), [Chapter 7 — Authentication](./Authentication.md) |
| **Related chapters** | [ADR-0002](./ADRs/0002-durable-queue-in-extension.md), [ADR-0006](./ADRs/0006-capture-client-durable-queue-identity-and-synchronization.md), [Contracts](./Contracts.md), [Roadmap](./Roadmap.md) |
| **Nav** | [← Prev](./TurnCapture.md) · [TOC](./README.md#table-of-contents) · [Next →](./SubsystemTemplate.md) |

---
> **Status:** Active — **Phase 2** (Capture Client v1). Phase 1 Foundation is closed ([Roadmap](./Roadmap.md)); design decisions are recorded in [ADR-0006](./ADRs/0006-capture-client-durable-queue-identity-and-synchronization.md).  
> **Location:** Capture Client v1 / Chrome extension (`apps/extension`) — **not** the Cloudflare Worker.  
> Prompt: *Implement the Durable Queue exactly as specified in the engineering notebook (`docs/DurableQueue.md`).*

## Purpose

Why does this queue exist?

Turn capture must not lose messages when the network drops, the Worker is briefly unavailable, or ChatGPT fires turns faster than sync can complete. For **Capture Client v1**, the Durable Queue lives **in the Chrome extension** so that:

1. Captured turns are stored on the device immediately (survive browser restarts where storage allows)
2. This client can retry authenticated ingest without asking the operator to re-speak the conversation
3. Per-conversation order is preserved on the client before sync
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
| DQ-3 | Preserve **per-conversation order** when syncing |
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
| `conversation_id` | yes | Ordering key (wire protocol; earlier drafts said `session_id`) |
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

Backing store, identity, and lifetime strategy are decided in [ADR-0006](./ADRs/0006-capture-client-durable-queue-identity-and-synchronization.md); the policy table below is normative.

## Design decisions (accepted — [ADR-0006](./ADRs/0006-capture-client-durable-queue-identity-and-synchronization.md))

| Topic | Decision |
|-------|----------|
| Queue storage | IndexedDB for queue items and dead letters; `chrome.storage.local` for configuration and token |
| Envelope | Versioned, self-contained queue envelope (`schema_version`, state, attempts, `next_attempt_at`, payload, conversation/capture metadata) |
| Turn identity | Stable source-provided message identifier when available and validated (adapter-extracted; the contract is not hard-coded to any specific DOM attribute); otherwise a local identity created and persisted **before first enqueue**. Retries and rescans reuse the same `client_turn_id`. |
| Sequence | Assigned once, per conversation, when a previously unseen source turn is accepted into durable storage. Re-observation reuses identity and sequence; a rescan never creates another queue item or increments the sequence. |
| Storage failure | Fail the enqueue visibly; never silently evict |
| Retry | Persisted exponential backoff: 5 s doubling to a 5-minute cap; default 5 attempts, then dead-letter |
| `401` | Hold queued items in a **distinct auth-blocked status** (separate from pending/retrying); surface auth error; do not consume retry budget |
| Permanent 4xx (`VALIDATION_ERROR`, `INVALID_JSON`, `404`, `405`) | Immediate dead-letter |
| Duplicate response | Any valid `200` is successful delivery — dequeue regardless of `accepted`/`duplicate` split |
| Sync concurrency | One batch in flight globally for v1 |
| Crash recovery | Abandoned in-flight items revert to pending on service-worker startup |
| Dead letters | Retained in a dedicated store until manually cleared by the operator |
| MV3 lifecycle | Immediate sync attempt on enqueue + one-minute `chrome.alarms` sweep of due `next_attempt_at` + startup recovery |
| Credentials | Token in `chrome.storage.local` only — never `chrome.storage.sync`, never bundled into the build |
| Diagnostics | Badge (pending + dead counts) + options page (counts incl. auth-blocked, last error, clear dead letters); never store or log conversation text or the token |
| Batch shape | One conversation per `POST /v1/turns`, maximum 25 turns, oldest conversation first |

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
| Ordering | Strict FIFO **per `conversation_id`** on sync |
| Durability | No locally acknowledged turn lost across normal extension restarts |
| Retry budget | Exponential backoff; max attempts configurable (default 5) then local dead-letter |

## Test cases

| ID | Case | Expected |
|----|------|----------|
| T1 | Enqueue user + assistant turns for one conversation; online | Both reach D1 via Worker in order |
| T2 | Enqueue while offline | Items pending; sync when online |
| T3 | Duplicate `client_turn_id` sync | Single D1 row; queue item cleared |
| T4 | Worker fails twice then succeeds | Delivered after retries |
| T5 | Worker always 500 | Dead-letter after max attempts; queue unblocked for other items |
| T6 | Extension restart with pending queue | Pending items still process |
| T7 | Two conversations interleaved | Per-conversation order preserved |
| T8 | `status()` with pending | Reports depth / last error usefully |

## Open questions

None. The original five open questions (local store, service-worker lifetime, batch size, dead-letter UX, sequence authority) and turn identity are all **resolved** — see the design-decisions table above and [ADR-0006](./ADRs/0006-capture-client-durable-queue-identity-and-synchronization.md).

How the ChatGPT capture adapter extracts and validates its source identifier is an implementation detail of the DOM-capture slice under the identity contract above — not a new architectural decision.

## Related

- [TurnCapture](./TurnCapture.md)
- [CaptureClient](./CaptureClient.md)
- [Architecture](./Architecture.md)
- [API](./API.md)
- [Database](./Database.md)
- [ADRs](./ADRs/)
- Code (future): `apps/extension` (Capture Client v1 queue + sync), `apps/worker` (ingest only—no queue)
