# ADR-0007: Object storage platform

## Status

Accepted

## Date

2026-08-05

## Deciders

Newell Starks (System Owner)

## Context

Chapter 14 ([Artifacts.md](../Artifacts.md)) requires first-class conversation binaries (images, `.xlsx`) with metadata in D1 and bytes **outside** D1. Phase 1 already runs on Cloudflare Workers + D1 ([ADR-0005](./0005-use-cloudflare-d1-for-turn-persistence.md)). Local development needs a simple object store before any cloud bucket exists. V1 enforces a configurable **25 MB** per-artifact limit and an allowlisted MIME set.

This ADR chooses **where bytes live** and how the Worker addresses them. Identity/linkage is [ADR-0008](./0008-artifact-identity-lineage-and-turn-linkage.md). Delivery/queue is [ADR-0009](./0009-artifact-delivery-retry-and-recovery-pipeline.md). Read access is [ADR-0010](./0010-binary-access-control.md).

## Decision

| Topic | Decision |
|-------|----------|
| Abstraction | Object storage accessed only through a **storage adapter** interface (`put`, `get`, `head`, optional `delete`). Callers never depend on filesystem paths or R2 APIs directly. |
| Local development | Filesystem-backed adapter under a gitignored Worker data root (e.g. `apps/worker/.data/artifacts/`). |
| Deployed target | Private **Cloudflare R2** bucket; Worker binding only; **no** public bucket ACL. |
| Forbidden | D1 BLOB columns; binaries in `turns` / turn JSON; embedding bytes in the turn Durable Queue. |
| Object keys | **Immutable** opaque keys (e.g. derived from `artifact_id` and/or content checksum). Never reuse a key for different bytes. |
| Checksums | SHA-256 of stored bytes recorded on artifact metadata only when **finalize** succeeds (`capture_status = stored`) after put confirmation ([ADR-0009](./0009-artifact-delivery-retry-and-recovery-pipeline.md) two-phase ingest). |
| Finalize | Bytes become readable/`stored` only after checksum validation **and** storage adapter confirmation at end of `PUT /v1/artifacts/:artifact_id/content` ([ADR-0009](./0009-artifact-delivery-retry-and-recovery-pipeline.md)). |
| Size limit | Configurable maximum; **v1 default 25 MB** per artifact (enforced before/at put). |
| MIME (enforcement locus) | Allowlist from Artifacts.md (`image/png`, `image/jpeg`, `image/webp`, `.xlsx`); reject macros/archives/executables/password-protected workbooks in the delivery pipeline ([ADR-0009](./0009-artifact-delivery-retry-and-recovery-pipeline.md)). |
| Immutability | Never overwrite bytes for an existing accepted identity; checksum conflict semantics are [ADR-0008](./0008-artifact-identity-lineage-and-turn-linkage.md). |

## Alternatives considered

| Option | Outcome |
|--------|---------|
| D1 BLOB / base64 in SQL | **Rejected** — wrong cost/size model; violates chapter hard rule. |
| R2-only even for local | **Deferred** — workable later; filesystem-first keeps Artifact v1 local loop simple. |
| External S3/MinIO as primary cloud | **Rejected** as primary — extra vendor; Cloudflare-native preferred. Optional local S3-compatible backend may implement the same adapter. |
| Store CDN URLs only, fetch later | **Rejected** — ChatGPT URLs are short-lived; capture must own bytes once `stored`. |
| Mutable keys (overwrite in place) | **Rejected** — breaks lineage and checksum integrity ([ADR-0008](./0008-artifact-identity-lineage-and-turn-linkage.md)). |

## Consequences

- Worker gains a storage adapter module + local disk dependency for dev.
- Deploy checklist: private R2 bucket + binding + secrets.
- Metadata schema stores `storage_backend`, `storage_location`, `checksum`, `byte_size` — never the bytes.
- Structured Sources later pin imports to immutable `artifact_id` / checksum pairs ([StructuredSources.md](../StructuredSources.md)).

## Failure and recovery behavior

| Failure | Behavior |
|---------|----------|
| Put fails mid-write | No successful `stored` status; no checksum committed; adapter must be fail-clean or upload-to-temp-then-finalize so partial objects are not served. |
| Metadata accepted, bytes not finalized | Expected two-phase state ([ADR-0009](./0009-artifact-delivery-retry-and-recovery-pipeline.md)); recover by retrying phase-2 put + finalize for the same identity when checksum matches. |
| Object without metadata | Treat as stray blob; do not serve via API until metadata exists; optional GC later. |
| Checksum mismatch on finalize | Fail finalize; do not mark `stored`; do not silently replace any prior object. |
| Checksum mismatch on read | Fail the read; do not silently serve. |
| Oversize / disallowed type | Reject before durable `stored`; no object retained. |

## Security and privacy implications

- Private storage only; credentials only in Worker bindings/secrets — never in the extension or config export.
- Opaque keys must not embed conversation text or sensitive filenames in logs.
- Adapter must not log byte bodies.
- Local `.data/` must be gitignored and treated as sensitive as D1 contents.

## Migration and reversal strategy

- **Forward:** ship filesystem adapter; add R2 adapter behind the same interface when deploying.
- **Backend switch:** copy objects; rewrite `storage_backend` / `storage_location`; checksums validate the copy.
- **Reversal:** if R2 abandoned, remap keys to another adapter implementing the same interface; metadata remains valid.

## Acceptance criteria

1. Local put/get of allowlisted image and `.xlsx` ≤ 25 MB succeeds without D1 binary columns.
2. Put > configured max fails without creating a `stored` artifact.
3. Object key is immutable: a new artifact version uses a new key ([ADR-0008](./0008-artifact-identity-lineage-and-turn-linkage.md)).
4. SHA-256 on metadata matches bytes returned by get only after finalize.
5. Content API does not serve artifacts that have not finalized storage + checksum.
6. Tests exercise the adapter interface with the local backend; no production code path writes blobs to D1.
7. Deployed design docs/config show private R2 only (no public ACL).

## Relationship to ADR-0006 and the turn pipeline

- **ADR-0006** governs the **turn** Durable Queue and turn identity/sync. It does **not** store binaries.
- Object storage is a **Worker-side** concern for artifact bytes after (or during) artifact ingest. The turn pipeline continues to POST JSON turns to `POST /v1/turns` unchanged.
- Artifact queue items ([ADR-0009](./0009-artifact-delivery-retry-and-recovery-pipeline.md)) may reference storage outcomes but must not embed file bytes in turn queue envelopes.
- Turn idempotency on `client_turn_id` remains independent of artifact object keys; linkage is via metadata ([ADR-0008](./0008-artifact-identity-lineage-and-turn-linkage.md)).
