# ADR-0009: Artifact delivery, retry, and recovery pipeline

## Status

Accepted

## Date

2026-08-05

## Deciders

Newell Starks (System Owner)

## Context

Binary capture needs a durable client pipeline for discovery → validated download → metadata ingest → byte put, with recoverable partial states ([Artifacts.md](../Artifacts.md)). The turn Durable Queue ([ADR-0006](./0006-capture-client-durable-queue-identity-and-synchronization.md)) must **not** carry binary-transfer state. Identity/linkage is [ADR-0008](./0008-artifact-identity-lineage-and-turn-linkage.md). Object store is [ADR-0007](./0007-object-storage-platform.md). Authorized byte **read** is [ADR-0010](./0010-binary-access-control.md).

## Decision

### Sibling Artifact Queue

- Capture Client maintains a **sibling Artifact Queue** in IndexedDB, separate from the turn queue.
- Same durability principles as ADR-0006: versioned envelopes, persisted backoff, crash recovery, distinct auth-blocked state, dedicated dead-letter / **conflict** store.
- **No loss after durable acceptance** into the Artifact Queue.

### Explicit two-phase ingest (only v1 path)

| Step | API | Action |
|------|-----|--------|
| Phase 1 | `POST /v1/artifacts` | Create or **idempotently return** metadata identity |
| Phase 2 | `PUT /v1/artifacts/:artifact_id/content` | Upload bytes |
| Finalize | (server, end of PUT) | Worker **recomputes** SHA-256, stores via object-storage adapter, finalizes **only** after storage confirmation + checksum verify |

- **No upload sessions** in v1.
- **No multipart convenience** in Artifact v1 — deferred entirely beyond v1. The only ingest path is `POST` metadata then `PUT` content.
- **Do not** overload `POST /v1/turns` with binaries.
- Byte upload depends on **metadata acceptance**, not on all turn sync completing.

### Checksum declaration (SHA-256)

When bytes are **already available** at Phase 1, metadata **must** include:

- `declared_sha256`
- `declared_byte_size`
- `mime_type`

Phase 2 recomputes checksum/size and **verifies** against declared values (mismatch ⇒ hard conflict / reject finalize; no overwrite — [ADR-0008](./0008-artifact-identity-lineage-and-turn-linkage.md)).

Allow **metadata discovery before bytes** with nullable checksum and an explicit `metadata_discovered` (or equivalent) capture status. Such an artifact **cannot finalize** or be treated as byte-confirmed until Phase 2 succeeds with verified bytes.

### Separate durable states

| Plane | States (logical) |
|-------|------------------|
| Metadata | pending → in_flight → acked / dead_letter / auth_blocked / **conflict** |
| Bytes | `discovered` / `metadata_discovered` → `pending_download` → PUT → `stored` \| `failed_download` \| `rejected` |

### Hard-conflict UX (v1)

| Rule | Policy |
|------|--------|
| State | Dedicated artifact **conflict** / dead-letter state |
| Visibility | Options status |
| Show | Filename, artifact type, conversation id, conflict reason, **shortened** checksum fingerprints |
| Never show | Bytes, sensitive URLs |
| Actions | Acknowledge/dismiss notice only — **no** automatic replacement, **no** replace-identity button |
| Storage | Dismiss does **not** change stored identity or bytes |

### Capture-time page origins and download hosts

**Frozen approved page origins:**

- `https://chatgpt.com`
- `https://chat.openai.com`

**Artifact download hosts:** freeze the **smallest exact allowlist** after a **read-only live DOM/network reconnaissance** (see [Artifacts.md](../Artifacts.md) § Artifact v1 implementation plan). Exact hosts only; no wildcard internet access. Source URL must be tied to an accepted ChatGPT artifact element. Allowlist changes are documented configuration changes; new ADR only if trust model changes.

Also: Capture Off ⇒ no download; user gesture not required when association + validation succeed; MIME/size allowlist (png/jpeg/webp/xlsx; default max **25 MB**).

### Retry and concurrency

| Topic | Decision |
|-------|----------|
| Retry | ADR-0006-aligned backoff (5 s → 5 min cap; default 5 attempts) unless evidence requires tuning |
| `401` | Auth-blocked; do not burn retry budget |
| Permanent 4xx / validation / checksum hard conflict | Conflict or dead-letter; no infinite retry |
| Same identity + same checksum | Success (duplicate) |
| Concurrency | Turn ≤1 in-flight batch; artifact ≤1 in-flight transfer; **pipelines may run concurrently** |

## Alternatives considered

| Option | Outcome |
|--------|---------|
| Single metadata+bytes POST / multipart in v1 | **Rejected** — deferred beyond v1 |
| Upload sessions | **Rejected** for v1 |
| Time-based orphaning in delivery | **Rejected** — [ADR-0008](./0008-artifact-identity-lineage-and-turn-linkage.md) combined rule |
| Replace-identity UX | **Rejected** for v1 |
| Unlimited parallel transfers | **Rejected** for v1 |

## Consequences

- Contracts: `POST /v1/artifacts` + `PUT /v1/artifacts/:artifact_id/content` + proxied `GET .../content`.
- Options UI surfaces conflict notices with safe fields only.
- Download-host allowlist filled from reconnaissance before coding fetch.

## Failure and recovery behavior

| Partial state | Recovery |
|---------------|----------|
| Phase 1 not acked | Retry `POST /v1/artifacts` |
| `metadata_discovered`, no bytes | Download then `PUT`; cannot finalize until bytes verified |
| Phase 1 with declared checksum, Phase 2 mismatch | Hard conflict; no overwrite |
| `failed_download` | Idempotent retry |
| Auth-blocked | Resume after token repair |
| SW killed mid-PUT | Startup recovery; no silent loss |

## Security and privacy implications

- Exact origin + download-host allowlists; no open proxy.
- Conflict UI never shows sensitive URLs or bytes.
- Token in `chrome.storage.local` only (ADR-0006).

## Migration and reversal strategy

- **Forward:** POST+PUT only; multipart remains out of scope until a later ADR/slice.
- Download-host allowlist edits are config changelogs (unless trust model changes).
- Disable artifact sync without affecting turns.

## Acceptance criteria

1. Only v1 ingest path is `POST /v1/artifacts` then `PUT /v1/artifacts/:artifact_id/content`.
2. Finalize only after recomputed SHA-256 matches (when declared) and storage confirmation.
3. `metadata_discovered` without bytes cannot be `stored`.
4. Hard conflict visible in Options with safe fields; dismiss does not mutate identity.
5. Concurrent ≤1+≤1 pipelines; byte upload after metadata accept only.
6. Page origins frozen; download hosts exact-allowlisted post-reconnaissance.
7. Tests cover two-phase machine, declared checksum verify, conflict UX data shape, allowlist rejection.

## Relationship to ADR-0006 and the turn pipeline

| Concern | Turn (ADR-0006) | Artifact (this ADR) |
|---------|-----------------|---------------------|
| Queue | Turn Durable Queue | Sibling Artifact Queue |
| In-flight | ≤1 batch | ≤1 transfer |
| Parallelism | Concurrent with artifact pipeline | Concurrent with turn pipeline |
| API | `POST /v1/turns` | `POST /v1/artifacts` + `PUT .../content` |
| Watermark | Combined rule fields feed orphan reconciliation ([ADR-0008](./0008-artifact-identity-lineage-and-turn-linkage.md)) | Bytes do not wait for orphan reconciliation |
