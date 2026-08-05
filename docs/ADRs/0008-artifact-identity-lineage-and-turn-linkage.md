# ADR-0008: Artifact identity, lineage, and turn linkage

## Status

Accepted

## Date

2026-08-05

## Deciders

Newell Starks (System Owner)

## Context

Artifacts must survive reload/rescan without duplication, support Excel/image version history without overwrite, and link to conversations/turns even when server `turn_id` is not yet known ([Artifacts.md](../Artifacts.md)). Turn identity precedent is [ADR-0006](./0006-capture-client-durable-queue-identity-and-synchronization.md). **Delivery, retry, and queue mechanics are out of scope** — see [ADR-0009](./0009-artifact-delivery-retry-and-recovery-pipeline.md) (kept separate).

## Decision

### Stable client identity

- Server `artifact_id`: UUID primary key once metadata is accepted (phase 1 of two-phase ingest).
- Client `client_artifact_id`: **stable** idempotency key across retries and rescans; assigned before first durable enqueue.
- Prefer validated **source-provided** file/message id when available.
- Else deterministic synthetic key, e.g.  
  `conversation_id | client_turn_id | direction | artifact_type | checksumOrFilenameFingerprint | occurrenceIndex`  
  (hash long segments; never embed full message text).

### Checksum conflict (same `client_artifact_id`)

| Observation | Behavior |
|-------------|----------|
| Same checksum | **Idempotent duplicate** — success; no new artifact; no byte replace |
| Different checksum | **Hard conflict** — reject; **never** overwrite prior artifact; **never** silently replace bytes |
| Real new version / revision | **New** `client_artifact_id` (and new server `artifact_id`); set `parent_artifact_id` when it is a revision or derivative |
| Operator “replace identity” | **Not in v1** |

### Turn linkage and unresolved → orphan

- Accept artifact metadata with `conversation_id` + `client_turn_id` **before** server `turn_id` exists.
- `turn_id` is **nullable**.
- Explicit `linkage_status`: `unresolved` | `resolved` | `orphan`.
- Never discard an artifact solely because `turn_id` is missing.

**Do not** transition `unresolved` → `orphan` based on elapsed time, queue-empty alone, or sequence alone.

#### Combined reconciliation rule (locked)

An unresolved artifact may become `orphan` only when **all** of the following hold:

1. The conversation **turn queue is drained** (no in-flight / pending turn items for that `conversation_id`)
2. The latest successful turn sync records a **maximum sequence watermark** for that conversation
3. **No pending local turn** exists for that conversation (including not-yet-enqueued adapter buffers that still belong to the conversation)
4. An **explicit reconciliation pass** confirms the referenced `client_turn_id` is **absent** from the server (D1)

Track at least:

| Field | Purpose |
|-------|---------|
| `conversation_id` | Scope of the watermark |
| `turn_sequence_watermark` | Max sequence from latest successful turn sync |
| `turn_sync_generation` | Monotonic sync generation / epoch for that conversation |
| `reconciled_at` | When the reconciliation pass ran |
| `reconciliation_result` | Outcome (e.g. still_unresolved / orphaned / resolved) |

**Orphan is not terminal.** If the referenced turn later arrives, the artifact may reconcile back to `resolved` (linked).

#### Forbidden orphan triggers

- Elapsed time alone  
- Queue-empty alone  
- Sequence watermark alone  


### Lineage vs duplicates

| Concept | Rule |
|---------|------|
| **Duplicate** | Same `client_artifact_id` + same checksum ⇒ already known |
| **Hard conflict** | Same `client_artifact_id` + different checksum ⇒ error; no overwrite |
| **Lineage** | New `client_artifact_id` for new bytes; optional `parent_artifact_id` for revision/derivative |
| **Overwrite** | **Forbidden** at existing storage keys ([ADR-0007](./0007-object-storage-platform.md)) |

Image provenance (`uploaded` / `generated` / `screenshot` / `edited_derived`) is descriptive metadata only.

## Alternatives considered

| Option | Outcome |
|--------|---------|
| Random UUID per observation | **Rejected** |
| Require resolved `turn_id` before metadata accept | **Rejected** |
| Time-based / queue-empty-alone / sequence-alone orphaning | **Rejected** — combined rule only |
| Operator replace-identity for checksum conflict | **Rejected** for v1 |
| Overwrite bytes on checksum mismatch | **Rejected** |
| Single POST metadata+bytes as primary | **Rejected** — two-phase is primary ([ADR-0009](./0009-artifact-delivery-retry-and-recovery-pipeline.md)) |

## Consequences

- Metadata schema includes `client_artifact_id`, nullable `turn_id`, `client_turn_id`, `linkage_status`, `parent_artifact_id`, checksum, conflict signaling.
- Sync/UI surfaces unresolved/orphan/conflict counts.
- Clients that revise Excel must mint a new `client_artifact_id` and set `parent_artifact_id`.

## Failure and recovery behavior

| Failure | Behavior |
|---------|----------|
| Metadata accepted, bytes missing | Identity retained; phase-2 retry ([ADR-0009](./0009-artifact-delivery-retry-and-recovery-pipeline.md)). |
| Checksum conflict on phase 2 | Hard fail; prior `stored` (if any) untouched; client must use new identity for true new content. |
| Turn not yet present | Stay `unresolved`; continue binary pipeline. |
| Watermark + absent turn | May become `orphan`; still listable/servable if `stored`. |
| Turn appears after orphan | Reconcile to `resolved`. |
| Parent missing on lineage create | Reject invalid parent link; first version has null parent. |

## Security and privacy implications

- Identity strings must not embed full turn text.
- Linkage resolution and reads enforce conversation ownership ([ADR-0010](./0010-binary-access-control.md)).
- Orphan artifacts use the same authz as resolved ones.

## Migration and reversal strategy

- **Forward:** additive D1 artifact tables; watermark + reconciler jobs/paths.
- Synthetic `client_artifact_id` algorithm bumps are versioned.
- Reversal of non-terminal orphan would be a superseding ADR (should not be needed).

## Acceptance criteria

1. Same `client_artifact_id` + same checksum → idempotent duplicate.
2. Same `client_artifact_id` + different checksum → hard conflict; no byte replace.
3. Revision uses new `client_artifact_id` + `parent_artifact_id`; parent unchanged.
4. Metadata accepted with null `turn_id` is `unresolved` and listable.
5. Orphan only when combined rule (drained + sequence watermark + no pending local turn + explicit absent confirmation) holds; never time/queue/sequence alone.
6. Orphan re-links when turn later appears.
7. Watermark records include `conversation_id`, `turn_sequence_watermark`, `turn_sync_generation`, `reconciled_at`, `reconciliation_result`.
8. Tests cover conflict, lineage, combined watermark gate, and re-link.

## Relationship to ADR-0006 and the turn pipeline

- Reuse: stable client identity, rescans, server idempotency, duplicates as success.
- Artifact identity ≠ `client_turn_id`.
- Turn pipeline progress feeds the **reconciliation watermark**; artifact byte upload does **not** wait for all turns to sync ([ADR-0009](./0009-artifact-delivery-retry-and-recovery-pipeline.md)).
- `POST /v1/turns` unchanged; artifact metadata/bytes are separate two-phase APIs.
