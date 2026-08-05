# ADR-0012: Import / version semantics

## Status

Proposed

## Date

2026-08-05

## Deciders

Newell Starks (System Owner)

## Context

Structured Excel import must pin exact workbook versions from the **authoritative local artifact lineage**, preview before apply, support partial apply with conflicts, and keep v0 data in staging tables only ([StructuredSources.md](../StructuredSources.md), [ADR-0011](./0011-canonical-source-ownership.md)).

## Decision

| Topic | Decision |
|-------|----------|
| Authoritative input | Pin imports to `artifact_id` + checksum from the preserved workbook **artifact lineage** (local-file and/or ChatGPT-captured versions of that lineage) |
| Registration manifest | Source name, lineage root, workbook version, worksheets/tables/ranges, ownership per table, identity columns, validation rules, deletion policy, last successful import, schema version |
| Preview | Mandatory before apply for same `artifact_id` + `schema_version` |
| Modes | `preview` \| `apply` \| `revert` |
| Cell values | Displayed value → claims; formula text → provenance; unresolved cache → reject or operator choice |
| Journal | Apply writes before-images for revert |
| Export | New workbook artifact only; never overwrite prior versions |
| v0 persistence | D1 staging/control-plane only (registrations, versions, import runs, staged records, claims, provenance, validation errors, conflicts, review decisions) — **no** canonical domain tables |
| Apply result | May complete as `completed_with_conflicts` when some rows apply and conflicts remain ([ADR-0014](./0014-conflict-resolution.md)) |

## Alternatives considered

| Option | Outcome |
|--------|---------|
| Auto-apply on every ChatGPT revision | **Rejected** |
| Import “latest ChatGPT file” without pin | **Rejected** |
| Canonical domain tables in v0 | **Rejected** ([ADR-0011](./0011-canonical-source-ownership.md)) |
| All-or-nothing apply only | **Rejected** — partial apply locked in ADR-0014 |

## Consequences

- Import_run status includes `completed_with_conflicts`.
- v0 APIs review staged claims, not People/Events product tables.
- ChatGPT provenance fields optional on versions that also exist via local ingest.

## Failure and recovery behavior

- Preview/apply always references a stored artifact; missing bytes → fail run, retry artifact recovery ([ADR-0009](./0009-artifact-delivery-retry-and-recovery-pipeline.md)).
- Revert restores staged acceptance state from journal; does not delete artifacts.

## Security and privacy implications

- Preview/claim payloads are PII-bearing; authenticated only.
- Manifest is control-plane — protect writes.

## Migration and reversal strategy

- **Forward:** v0 staging → later domain tables after Accepted knowledge ADRs + design.
- Manifest `schema_version` retained on each run for audit.

## Acceptance criteria

1. Apply without matching preview rejected.
2. Import pins checksummed `artifact_id` from lineage.
3. v0 schema has no canonical People/Events/Places/Relationships tables.
4. Run can end `completed_with_conflicts` with audit of applied/skipped/rejected/conflicted rows.
5. Export creates new artifact; prior versions remain.

## Relationship to artifact ADRs (0007–0010)

Import never reads ChatGPT CDN directly for authority; it reads **stored** artifact bytes via Worker/private store after capture or local ingest.
