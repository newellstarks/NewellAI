# Structured Sources and Canonical Knowledge

**Chapter 15 — Structured Sources and Canonical Knowledge**

| | |
|---|---|
| **Status** | Draft |
| **Purpose** | Database-bearing files: ordinary artifacts vs structured sources vs canonical DB; Framework import, provenance, staged hybrid ownership. |
| **Prerequisites** | [Chapter 4 — Architecture](./Architecture.md), [Chapter 8 — Database](./Database.md), [Chapter 14 — Artifacts](./Artifacts.md) (ADRs 0007–0010 Accepted) |
| **Related chapters** | [DigitalNewellFrameworkInventory](./DigitalNewellFrameworkInventory.md), [Requirements](./Requirements.md), [Roadmap](./Roadmap.md), [ADRs](./ADRs/) |
| **Nav** | [← Prev](./Artifacts.md) · [TOC](./README.md#table-of-contents) · [Next →](./ADRs/README.md) |

---

## Purpose

Chapter 14 preserves conversation binaries. This chapter covers **database-bearing** workbooks—especially the **Digital Newell Framework**—and how imports produce **extracted claims** and later **accepted** facts.

**Artifact binary capture** may proceed under Accepted ADRs **0007–0010**.  
**Structured import** waits until ADRs **0011–0015** are Accepted (0013 gated on workbook inventory).

## Three layers

| Layer | Role |
|-------|------|
| **1. Ordinary artifact** | Preserve conversation-linked binary |
| **2. Structured source file** | Registered, versioned workbook; authoritative **local artifact lineage** |
| **3. Canonical application database** | Normalized domain records — **not in Structured Source v0** |

Hard rules: every structured source version is an artifact; no silent overwrite of accepted facts; no binaries in D1; ownership **per table/domain**.

**Document fidelity** ([Architecture](./Architecture.md), [ADR-0016](./ADRs/0016-document-and-workbook-fidelity.md) — **Accepted**): preserve (1) exact immutable binary, (2) structural/formatting model, (3) extracted claims. Extraction never replaces layers 1–2. **Editing:** change only what was requested; new version + change manifest; Word/Excel lists in ADR-0016; warn when fidelity is not guaranteed. Checksums must prove the original binary unchanged after revision.

## Framework home (owner decision)

| Path | Role |
|------|------|
| **Preserved local workbook artifact lineage** | **Authoritative structured-source input** |
| **ChatGPT** | Transport, provenance, conversation context — **not** canonical home |
| **Local-file ingest** | First-class way to attach versions to the same `source_id` |

## Structured Source v0 (D1 staging only)

Use D1 from the start **only** for:

- structured-source registrations / manifests  
- source artifact versions  
- import runs  
- staged source records  
- extracted claims  
- row/cell provenance  
- validation errors  
- conflicts  
- review and acceptance decisions  

**Do not** create or promote canonical People, Events, Relationships, Places, or other domain tables in v0.

## Source-of-truth ownership (staged hybrid)

Per **registered table or domain** in the manifest. Default: `workbook_authoritative`. Promote to `database_authoritative` only after review + identity gate (no provisional ids). See [ADR-0011](./ADRs/0011-canonical-source-ownership.md) (Proposed).

## Registration manifest

Source name; `source_id`; artifact lineage root; workbook version (`artifact_id` + checksum); registered worksheets/tables/ranges; **ownership mode per table**; identity column(s); import validation rules; **deletion policy** (default `propose_only` while workbook-authoritative); last successful import; schema version.

## Identity (Framework)

Prefer explicit ids (`person_id`, `event_id`, …) **when present**. Never row number. Sort/edit must not change identity. Missing ids → provisional; block DB-canonical promotion until persisted back into a workbook version. Matching ≠ identity.

**Inventory (read-only):** [DigitalNewellFrameworkInventory.md](./DigitalNewellFrameworkInventory.md). ADR-0013 stays Proposed until owner confirms workbook-of-record and registrations.

## Import runs

Preview mandatory. Partial apply of non-conflicting rows allowed; conflicts stay unapplied; run may end `completed_with_conflicts`. Do not apply rows that break referential integrity or depend on unresolved identities. Full audit: applied / skipped / rejected / conflicted ([ADR-0014](./ADRs/0014-conflict-resolution.md)).

## Deletion

While workbook-authoritative: default **`propose_only`**. Missing row → proposed deletion/tombstone for review — never silent delete of accepted records ([ADR-0015](./ADRs/0015-deletion-behavior.md)).

## Accepted facts vs extracted claims

Claims from parse/preview are evidence. Accepted facts (including staged acceptance in v0) change only via explicit review/apply under ownership rules.

## ADRs

| ADR | Status |
|-----|--------|
| [0007](./ADRs/0007-object-storage-platform.md)–[0010](./ADRs/0010-binary-access-control.md) | **Accepted** (Artifact v1) |
| [0016](./ADRs/0016-document-and-workbook-fidelity.md) | **Accepted** (Word/Excel fidelity) |
| [0011](./ADRs/0011-canonical-source-ownership.md)–[0015](./ADRs/0015-deletion-behavior.md) | **Proposed** (keep separate; 0013 inventory-gated) |

## Open questions

1. Confirm workbook-of-record: Master Archive vs another path.  
2. Which sheets are registered for v0.  
3. Whether to add `Person ID` to Master Archive via export workflow before heavy People import.  
4. Treat Timeline year-grid rows vs Event ID rows as one table or two ranges in the manifest.

## Related

- [Artifacts](./Artifacts.md)  
- [DigitalNewellFrameworkInventory](./DigitalNewellFrameworkInventory.md)  
- [Architecture](./Architecture.md)  
- [Database](./Database.md)  
- [ADRs](./ADRs/)  
