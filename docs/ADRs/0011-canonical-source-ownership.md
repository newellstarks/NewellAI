# ADR-0011: Canonical source ownership

## Status

Proposed

## Date

2026-08-05

## Deciders

Newell Starks (System Owner)

## Context

Database-bearing workbooks (especially the Digital Newell Framework) need a clear source of truth for operational data. Ownership cannot be only “the workbook” or only “the database” during migration ([StructuredSources.md](../StructuredSources.md)). Artifact preservation remains independent ([Artifacts.md](../Artifacts.md), Accepted ADRs 0007–0010).

## Decision

### Staged hybrid, per table/domain

Ownership is assigned **per registered table or domain** in the registration manifest (`workbook_authoritative` | `database_authoritative`). Staged hybrid (C) remains the direction.

Defaults: new registered Framework tables start **workbook_authoritative**. Promotion to database_authoritative requires owner review and the identity gate in [ADR-0013](./0013-source-record-identity.md) (blocked while provisional ids remain).

### Framework home and authoritative input

| Path | Role |
|------|------|
| **Local workbook artifact lineage** | **Authoritative structured-source input** — preserved local (and captured) workbook versions are what import pins to |
| **ChatGPT capture** | Transport, conversation/turn provenance, and context — **not** the canonical home of the Framework workbook |
| **Local-file ingest** | First-class path to register/attach workbook versions to the same `source_id` |

Both ChatGPT and local-file ingestion are supported. Structured-source version authority is the **preserved artifact lineage** of the workbook, not “whatever ChatGPT currently shows.”

### Structured Source v0 scope (D1)

Use D1 from the beginning **only** for staging/control-plane data:

- structured-source registrations / manifests  
- source artifact versions  
- import runs  
- staged source records  
- extracted claims  
- row/cell provenance  
- validation errors  
- conflicts  
- review and acceptance decisions  

**v0 must not** create or promote canonical domain tables (People, Events, Relationships, Places, etc.). Those wait for a later milestone after ADRs 0011–0015 are Accepted and domain design is approved.

No silent overwrite of accepted facts (including staged accepted claims under review workflows).

## Alternatives considered

| Option | Outcome |
|--------|---------|
| ChatGPT as canonical Framework home | **Rejected** — transport/provenance only |
| Workbook-only ownership forever | **Rejected** as sole end-state |
| DB-canonical immediately with domain tables in v0 | **Rejected** — premature |
| Ownership only at workbook granularity | **Rejected** — tables mature differently |

## Consequences

- Manifest stores ownership per table/domain and points at artifact lineage root/versions.
- Import/apply ([ADR-0012](./0012-import-version-semantics.md)) targets pinned artifact versions from the authoritative lineage.
- v0 schema is staging-only; product search over canonical People/Events waits.

## Failure and recovery behavior

- Missing ChatGPT copy does not invalidate local lineage authority.
- Failed ChatGPT capture still allows local-file version registration.
- Promotion attempted with provisional ids → rejected ([ADR-0013](./0013-source-record-identity.md)).

## Security and privacy implications

- Manifest and staged claims contain Framework PII — same auth class as turns/artifacts.
- ChatGPT is not trusted as sole storage for the Framework.

## Migration and reversal strategy

- **Forward:** workbook_authoritative + staging D1 → later per-table promotion.
- **Demote** DB→workbook: explicit owner action only.
- Reversal of “local lineage authoritative” requires superseding ADR.

## Acceptance criteria

1. Manifest can set mixed ownership modes per table.
2. Docs/tests treat local artifact lineage as structured-source input of record.
3. ChatGPT-associated versions carry conversation provenance but do not redefine lineage root alone.
4. v0 migrations create staging/control tables only — no People/Events/Places domain tables.
5. Promotion blocked while provisional identities remain on that table.

## Relationship to artifact ADRs (0007–0010)

Structured sources **consume** preserved workbook artifacts (object storage + metadata). They do not change Artifact v1 binary capture rules. ChatGPT capture uses ADR-0009/0010; local ingest attaches bytes through the same artifact store ([ADR-0007](./0007-object-storage-platform.md)) with optional null conversation linkage ([ADR-0008](./0008-artifact-identity-lineage-and-turn-linkage.md)).
