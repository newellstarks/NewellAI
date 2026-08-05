# ADR-0014: Conflict resolution

## Status

Proposed

## Date

2026-08-05

## Deciders

Newell Starks (System Owner)

## Context

Import will surface collisions between extracted claims and accepted staged/canonical facts, duplicate ids, and unresolved references ([StructuredSources.md](../StructuredSources.md)). Owner locks **partial apply** semantics.

## Decision

| Case | Resolution |
|------|------------|
| Duplicate explicit id within one sheet | Reject/quarantine those rows; no invented merge |
| Claim vs accepted fact (`database_authoritative`) | Conflict; accepted unchanged until operator accepts claim |
| Claim vs accepted fact (`workbook_authoritative`) | May apply only via explicit apply after preview — never from background capture alone |
| **Partial apply** | **Allowed** for non-conflicting rows |
| Conflicting rows | Remain **unapplied** and visible for review |
| Import run outcome | May end as `completed_with_conflicts` |
| Referential integrity | **Do not** apply a row if applying it would break referential integrity |
| Unresolved references | **Do not** apply dependent records whose referenced identity remains unresolved |
| Audit trail | Retain complete audit of **applied**, **skipped**, **rejected**, and **conflicted** rows |
| Silent overwrite | **Forbidden** |
| Entity-match suggestions | No identity/fact change without operator action ([ADR-0013](./0013-source-record-identity.md)) |

## Alternatives considered

| Option | Outcome |
|--------|---------|
| All-or-nothing apply | **Rejected** — owner chose partial apply |
| Last-write-wins | **Rejected** |
| Drop conflicts silently | **Rejected** |

## Consequences

- Apply engine must topologically respect reference readiness.
- UI/API must list conflicted vs applied subsets per `import_run_id`.
- v0 stages conflicts in D1 without domain tables ([ADR-0011](./0011-canonical-source-ownership.md)).

## Failure and recovery behavior

- Partial success is success-with-conflicts, not a failed run.
- Operator can re-preview/apply after resolving conflicts or fixing workbook.
- Revert applies to the applied subset via journal ([ADR-0012](./0012-import-version-semantics.md)).

## Security and privacy implications

- Conflict payloads contain PII — authenticate; avoid verbose logs.
- No bulk-accept-all without confirmation in v1.

## Migration and reversal strategy

- Policy changes require superseding ADR.
- Compensating apply or revert for mistaken accepts.

## Acceptance criteria

1. Non-conflicting rows apply while conflicts remain unapplied.
2. Run status `completed_with_conflicts` when applicable.
3. Dependent row with unresolved referenced identity is skipped/not applied.
4. Audit enumerates applied/skipped/rejected/conflicted.
5. Accepted facts never change without explicit accept/apply path.

## Relationship to artifact ADRs (0007–0010)

Conflicts are about **claims vs accepted staged facts**, not artifact binary identity. Artifact duplicates remain ADR-0008 concerns.
