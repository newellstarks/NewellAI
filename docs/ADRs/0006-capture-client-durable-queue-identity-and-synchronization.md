# ADR-0006: Capture Client v1 Durable Queue, Identity, and Synchronization

## Status

Accepted

## Date

2026-08-01

## Deciders

Newell Starks (System Owner)

## Context

Phase 1 (contracts → ingest → auth → D1 → read API) is closed. Phase 2 begins with the Capture Client v1 Durable Queue ([DurableQueue.md](../DurableQueue.md)), which [ADR-0002](./0002-durable-queue-in-extension.md) places in the Chrome extension. The chapter left open questions (local store, MV3 service-worker lifetime, batch size, dead-letter UX, sequence authority) to be resolved via ADR before implementation. Design review surfaced adjacent decisions that shape the same module: turn identity, retry classification, crash recovery, and credential storage.

Terminology: the ordering unit is the **conversation** (`conversation_id`, per the wire protocol). Earlier drafts said "session"; this ADR and the chapter use *conversation* consistently.

## Constraints

- MV3 service workers are suspended after ~30 s idle: no in-memory timers or long-lived loops survive.
- `UploadRequest` is structurally one-conversation-per-request; Phase 1 contracts are locked (additive changes only).
- The Worker is idempotent on `(conversation_id, client_turn_id)`; delivery is at-least-once by design (DQ-4).
- No hard-coded credentials (DQ-8, NFR-1); single operator in Phase 2 but multi-user-ready fields throughout.
- Conversation text is content and must not leak into logs or diagnostics.
- The architectural contract must not be coupled to any specific source DOM attribute; capture surfaces change.

## Options Considered

### Queue storage

- **`chrome.storage.local`** — simple API; no transactions, so state transitions race across `await` points; ~10 MB default quota.
- **IndexedDB** — transactional, indexable (`conversation_id`, `sequence`, source identity), effectively unlimited; more verbose API. Available in MV3 service workers.

### Turn identity (`client_turn_id`)

- **Random UUID per observation** — simple, but re-observing the same source turn (page reload, rescan, reinstall) mints a new id and creates real duplicates in D1.
- **Hard-coded DOM attribute (e.g., a specific `data-*` attribute)** — couples the architectural contract to one surface's markup; brittle across UI changes and future adapters.
- **Stable source-provided identifier when available and validated, else a locally created identity persisted before first enqueue** — adapter-specific extraction stays in the capture adapter; the contract only requires stability.

### MV3 lifetime strategy

- **Event-driven only** (enqueue, startup, network regained) — misses scheduled retries while idle.
- **Alarm sweep only** — adds up to one sweep interval of latency to every sync.
- **Both** — immediate attempt on enqueue plus periodic `chrome.alarms` sweep of persisted schedules.

### Sequence authority

- **Worker-assigned on ingest** — requires an API/contract change; ingest order across retried batches is not capture order.
- **Extension-assigned at acceptance into durable storage** — uses the existing optional `sequence` wire field and the existing `(conversation_id, sequence)` D1 index; the client is the only party that knows true capture order.

### Batch shape

- **One turn per POST** — simplest; chatty; slow to drain after offline periods.
- **Per-conversation batch (capped)** — matches the contract exactly; duplicate-within-batch semantics already specified and tested server-side (DB-5).
- **Mixed-conversation batches** — requires a contract change; rejected.

### Retry classification

- **Uniform retry for all failures** — burns the retry budget on permanent rejections and hides capture bugs.
- **Classified handling** — transient (network/5xx) retries; auth (`401`) holds in a distinct state; permanent 4xx dead-letters.

## Decision

| Topic | Decision |
|-------|----------|
| Queue storage | IndexedDB for queue items and dead letters; `chrome.storage.local` for configuration and token |
| Envelope | Versioned, self-contained queue envelope (`schema_version`, state, attempts, `next_attempt_at`, payload, conversation/capture metadata) |
| Turn identity | Use a stable **source-provided** message identifier when available and validated; the capture adapter may extract source-specific identifiers, but the contract is **not** hard-coded to any specific DOM attribute. Otherwise create and persist a local identity **before first enqueue**. Retries and rescans **must reuse** the same `client_turn_id`. |
| Sequence | Extension assigns a monotonic per-conversation `sequence` **once**, when a previously unseen source turn is accepted into durable storage. Re-observing an existing source turn reuses its identity and sequence; a rescan must not create another queue item or increment the sequence. |
| Storage failure | Fail the enqueue visibly; never silently evict |
| Retry | Persisted exponential backoff, 5 s doubling to a 5-minute cap, default 5 attempts |
| `401` | Hold queued items in a **distinct auth-blocked status**, visibly separate from ordinary pending/retrying; surface the auth error; do not consume retry budget |
| Permanent 4xx (`VALIDATION_ERROR`, `INVALID_JSON`, `404`, `405`) | Immediate dead-letter |
| Duplicate response | Any valid `200` is successful delivery — dequeue regardless of `accepted`/`duplicate` split |
| Sync concurrency | One batch in flight globally for v1 |
| Crash recovery | Abandoned in-flight items revert to pending on service-worker startup |
| Dead letters | Retained in a dedicated store until manually cleared by the operator |
| MV3 lifecycle | Immediate sync attempt on enqueue + one-minute `chrome.alarms` sweep of due `next_attempt_at` + startup recovery |
| Credentials | `CAPTURE_API_TOKEN` in `chrome.storage.local` only — never `chrome.storage.sync`, never bundled into the build |
| Diagnostics | Badge (pending + dead counts) and options page (counts incl. auth-blocked, last error, clear dead letters); never store or log conversation text or the token |
| Batch shape | One conversation per request, maximum 25 turns, oldest conversation first |

## Rationale

- IndexedDB's transactions make queue state transitions and identity/sequence assignment atomic, which `chrome.storage.local` cannot guarantee; the split keeps simple config on the simple API.
- Stable turn identity is the client half of the server's idempotency contract: re-capture becomes harmless (`duplicate`) instead of corrupting history, while keeping surface-specific extraction out of the architecture.
- Assigning sequence exactly once at durable acceptance makes ordering immune to rescans and re-renders, and uses the wire field and D1 index that already exist — no contract change.
- Persisting `next_attempt_at` per item and sweeping with `chrome.alarms` is the only retry mechanism that survives MV3 suspension; the immediate attempt keeps the happy path fast.
- Classified failure handling protects the retry budget for failures retrying can fix; the distinct auth-blocked state stops credential problems from masquerading as network flakiness.
- At-least-once delivery plus server idempotency makes `duplicate` a success signal and makes crash recovery a simple state reset — no two-phase acknowledgement needed.
- Single global in-flight batch is the simplest arrangement that satisfies per-conversation FIFO (DQ-3) at single-operator volume.

## Consequences

- **Easier:** deterministic queue tests (fake IndexedDB); crash recovery is trivial; capture bugs surface as inspectable dead letters; rescans are idempotent end to end; the Worker remains unchanged.
- **Harder / accepted costs:** IndexedDB boilerplate; a seen-identity index must be maintained alongside the queue; up to one alarm interval of retry latency while idle; global serial sync caps throughput (irrelevant at v1 volume).
- The capture adapter (next slice) must define how it extracts and validates the source identifier for ChatGPT specifically — an implementation detail under this contract, not a new architectural decision.

## Evidence Required to Revisit

- Sustained capture volume where one global in-flight batch cannot drain the queue (persistent backlog growth while online).
- Measured IndexedDB unavailability or corruption in the field.
- A capture surface without any stable source identifier where local identity assignment demonstrably produces duplicates.
- MV3 platform changes (or `chrome.alarms` minimum changes) that invalidate the lifetime strategy.
- A contract change that adds server-side ordering, making extension-assigned `sequence` redundant.
- Multi-user onboarding requirements that change credential storage or diagnostics policy.
