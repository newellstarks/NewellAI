# ADR-0015: Deletion behavior

## Status

Proposed

## Date

2026-08-05

## Deciders

Newell Starks (System Owner)

## Context

When a later workbook version omits a previously seen `source_record_id`, the system must not silently destroy accepted records or source artifacts ([StructuredSources.md](../StructuredSources.md)).

## Decision

| Topic | Decision |
|-------|----------|
| Missing row in candidate workbook | Emit a **proposed deletion** (or proposed tombstone) in preview |
| Default while `workbook_authoritative` | **`propose_only`** — requires review; **must not** silently delete accepted records |
| Apply of deletion | Only when operator accepts the proposal (or a future explicit policy change per table) |
| Hard delete | Not used for imported Framework rows in v0/v1 |
| Source artifacts | **Never** deleted because a row vanished |
| `database_authoritative` | Workbook omission remains a proposal until accepted under that table’s rules |
| Revert | Restores prior accepted/staged state from journal; does not delete workbook artifacts |
| Manifest | Per-table `deletion_policy`; default for workbook-authoritative tables = `propose_only` |

## Alternatives considered

| Option | Outcome |
|--------|---------|
| `soft_delete_on_apply` as default while workbook-authoritative | **Rejected** as default — owner chose `propose_only` |
| Hard-delete on missing row | **Rejected** |
| Ignore missing rows always | **Rejected** as sole policy |

## Consequences

- Preview shows delete proposals; apply without accepting them does not remove accepted records.
- Search defaults exclude only rows whose deletion was **accepted** (when soft-delete/tombstone is later used); under `propose_only`, accepted rows stay active until review accepts deletion.

## Failure and recovery behavior

- Spurious omission in a bad workbook version → reject delete proposal; accepted records remain.
- Artifact recovery unrelated to row deletion.

## Security and privacy implications

- Proposed deletions and tombstones still contain PII — same access controls.
- True erasure/GDPR purge is out of scope (future ADR).

## Migration and reversal strategy

- Changing a table from `propose_only` to `soft_delete_on_apply` does not retroactively delete.
- Accepted deletion can be undone via revert or compensating import.

## Acceptance criteria

1. Row in v1 absent in v2 → preview lists proposed deletion; accepted records unchanged until review accepts.
2. Default workbook-authoritative policy is `propose_only`.
3. No API deletes object-store workbook bytes as a side effect of row omission.
4. Audit records proposed vs accepted deletions.

## Relationship to artifact ADRs (0007–0010)

Row deletion proposals never remove artifact lineage nodes in object storage.
