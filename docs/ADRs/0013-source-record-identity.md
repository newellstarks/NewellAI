# ADR-0013: Source-record identity

## Status

Proposed — **blocked on Framework workbook inventory**

## Date

2026-08-05

## Deciders

Newell Starks (System Owner)

## Context

Imported Framework rows need stable identity across workbook versions. Owner direction: **do not infer or invent** which tables already have explicit IDs. Before this ADR can be Accepted, inspect the current Digital Newell Framework workbook and document per-sheet findings ([DigitalNewellFrameworkInventory.md](../DigitalNewellFrameworkInventory.md)).

## Decision (direction — not final until inventory Accepted)

### Rules (locked in principle)

| Rule | Policy |
|------|--------|
| Prefer explicit persistent IDs | e.g. `person_id`, `event_id`, `place_id`, `document_id`, `relationship_id` **when present in the workbook** |
| Never use worksheet row number | Provenance only |
| Sort / move rows | Must not change identity |
| Edits to names, dates, descriptions | Must not change identity |
| No explicit ID | Provisional `source_record_id` during import; table **cannot** be promoted to database-canonical until id persisted into a later workbook version |
| Matching ≠ identity | Duplicate detection / entity matching are separate; no silent identity rewrite |

### Inventory gate

- Per registered sheet/table, record: name, domain, columns, whether explicit ID exists, ID column name, uniqueness/null results, sort/edit stability, whether provisional IDs required, duplicates/ambiguities.
- **Read-only** inspection only; do not modify the workbook.
- **Do not Accept this ADR** until inventory is reviewed and identity column mappings are filled into the registration manifest design.

### Inventory status (2026-08-05)

Read-only inventory performed against Downloads copies (see inventory doc). Summary: several sheets define ID **columns** but most are empty; **People** in Master Archive has data **without** `Person ID`; **Timeline** has sparse `Event ID`. Provisional IDs will be required for populated tables lacking filled explicit IDs. Full tables → [DigitalNewellFrameworkInventory.md](../DigitalNewellFrameworkInventory.md).

## Alternatives considered

| Option | Outcome |
|--------|---------|
| Invent which tables have IDs without inspection | **Rejected** by owner |
| Row number identity | **Rejected** |
| Accept ADR-0013 before inventory | **Rejected** — remains Proposed |

## Consequences

- Manifest identity columns must be set from inventory, not guesswork.
- People (Master Archive) needs provisional ids or a future `Person ID` column backfill via export.
- Entity matching for duplicate person names is a separate workflow.

## Failure and recovery behavior

- Import of rows without required explicit ID (when manifest demands explicit) → provisional or reject per manifest rules once Accepted.
- Promotion with provisional ids → hard fail ([ADR-0011](./0011-canonical-source-ownership.md)).

## Security and privacy implications

- Prefer opaque ids; avoid encoding names into ids when generating provisional values.
- Inventory docs may cite sample names — treat as sensitive.

## Migration and reversal strategy

- Export provisional ids into workbook → re-import as explicit → then consider promotion.
- Re-key only via controlled migration.

## Acceptance criteria (for future Accept)

1. Inventory complete for every registered sheet/table.
2. Manifest draft lists identity column or `provisional` per table.
3. Tests prove row-number/sort/name-edit non-identity once implementation starts.
4. Owner signs off that inventory matches the workbook of record.

## Relationship to artifact ADRs (0007–0010)

Identity applies to **imported staged records**, not to `client_artifact_id`. Workbook versions remain artifact lineage nodes.
