# Digital Newell Framework — Identity Inventory

**Status:** Draft (read-only inspection)  
**Date:** 2026-08-05  
**Purpose:** Evidence gate for [ADR-0013](./ADRs/0013-source-record-identity.md). Do not invent ID assumptions without this inventory.  
**Workbook modified:** No (read-only).

## Files inspected

| File | Path | Size | Notes |
|------|------|------|-------|
| **Primary (data-richer)** | `/Users/newellstarks/Downloads/Digital_Newell_Master_Archive.xlsx` | 33 639 bytes | Used as inventory baseline |
| Related / earlier schema | `/Users/newellstarks/Downloads/Digital_Newell_Knowledge_Base_v1.xlsx` | 23 608 bytes | Same sheet set; People schema differs; less Timeline data |

**Not found in repo** (`NewellAI/`): no Framework `.xlsx` checked in. Operator should confirm which file is the **workbook of record** for structured-source lineage (recommend treating Master Archive as current working copy until confirmed).

Both workbooks share sheets: Documents, Timeline, Patterns, People, Organizations, Places, Decisions, Satisfaction, Time Allocation, Quotes, Questions, Cross References, Digital Framework.

---

## Inventory — `Digital_Newell_Master_Archive.xlsx`

### Documents

| Field | Finding |
|-------|---------|
| Sheet/table | `Documents` |
| Apparent domain | Documents / life writings |
| Columns | Document ID, Title, Version, Date Written, Life Period, Age Range, Status, Summary, Primary Categories, Related Documents, Notes |
| Explicit persistent ID? | **Column exists:** `Document ID` |
| ID populated? | **No data rows** — cannot assess uniqueness/nulls on values |
| Sort/edit preserve identity? | N/A (empty); column design supports stable id if filled |
| Provisional IDs required? | Yes for any future rows until `Document ID` filled |
| Duplicates / ambiguity | None (empty) |

### Timeline

| Field | Finding |
|-------|---------|
| Sheet/table | `Timeline` |
| Apparent domain | Chronology / life timeline (age-year grid + events) |
| Columns | Age, Year, *(unnamed col — quarterly markers 2Q/3Q/4Q)*, Grade, Grade Name, School, Employer, Home Address, Own?, City, State, Zip, Event ID, Start Date, End Date, Primary Activity, Document ID, Notes |
| Explicit persistent ID? | **`Event ID`** (event rows); **`Document ID`** (reference, empty) |
| ID populated? | `Event ID`: **3 / 137** non-null (`1000`, `20000`, `0.05`) — unique among those three; **134 null**. `Document ID`: all null |
| Sort/edit preserve identity? | Only for the 3 rows with Event ID. Most rows have **no** event id — identity would break under sort if provisional/fingerprint used poorly. Age+Year pairs among filled age/year rows: **119 unique / 119** (natural key candidate for year-grid rows only — **not** adopted as identity without owner approval) |
| Provisional IDs required? | **Yes** for nearly all rows |
| Duplicates / ambiguity | 3 groups of identical sparse “quarter marker” rows (2Q/3Q/4Q repeated). Event ID `0.05` looks atypical vs integer-like ids |

### Patterns

| Field | Finding |
|-------|---------|
| Sheet/table | `Patterns` |
| Apparent domain | Recurring patterns / heuristics |
| Columns | Pattern ID, Pattern Name, Description, Confidence, First Document, Last Document, Decision Rule, Evidence, Counterexamples, Status |
| Explicit persistent ID? | **`Pattern ID`** column; **no data rows** |
| Provisional IDs required? | Yes when data appears until IDs filled |
| Duplicates / ambiguity | None (empty) |

### People

| Field | Finding |
|-------|---------|
| Sheet/table | `People` |
| Apparent domain | People |
| Columns | Name, First Name I used, Date, Location / Company, Significant Events, Huge Impact or Pivot Point, My Age, More Explanation, Knew Very Well (at one time), World Class, I knew WC when I first met, Alive |
| Explicit persistent ID? | **No `Person ID` (or similar) column** in Master Archive |
| Contrast | `Digital_Newell_Knowledge_Base_v1.xlsx` **has** `Person ID` column but **0 data rows** |
| Data rows | 66 |
| ID uniqueness | N/A — no id column. **Name** is not unique: 65 named rows → 51 unique names; duplicates include Bill Murto×4, Dennis Stanfill×3, Gabe Payes×3, etc. |
| Sort/edit preserve identity? | **No stable id** — sorting/moving or renaming duplicate-named people is ambiguous |
| Provisional IDs required? | **Yes** for all people rows before any database-canonical promotion |
| Duplicates / ambiguity | Duplicate names (likely multiple encounters/roles). 1 blank-name row (Significant Events=`Born`, My Age=`1951`) — ambiguous entity |

### Organizations

| Field | Finding |
|-------|---------|
| Sheet/table | `Organizations` |
| Apparent domain | Organizations |
| Columns | Organization, Industry, Role, Years, Related Documents, Notes |
| Explicit persistent ID? | **No** |
| Data rows | 0 |
| Provisional IDs required? | Yes when populated |
| Duplicates / ambiguity | None (empty) |

### Places

| Field | Finding |
|-------|---------|
| Sheet/table | `Places` |
| Apparent domain | Places |
| Columns | Place, Country/State, Years, Related Documents, Notes |
| Explicit persistent ID? | **No** |
| Data rows | 0 |
| Provisional IDs required? | Yes when populated |
| Duplicates / ambiguity | None (empty) |

### Decisions

| Field | Finding |
|-------|---------|
| Sheet/table | `Decisions` |
| Apparent domain | Decisions |
| Columns | Decision ID, Decision, Approx Date, Outcome, Related Pattern, Document ID, Notes |
| Explicit persistent ID? | **`Decision ID`** (+ optional `Document ID` ref); **no data** |
| Provisional IDs required? | Yes until IDs filled |
| Duplicates / ambiguity | None (empty) |

### Satisfaction

| Field | Finding |
|-------|---------|
| Sheet/table | `Satisfaction` |
| Apparent domain | Per-document satisfaction scores |
| Columns | Document ID, Joy (1-10), Satisfaction (1-10), Meaning (1-10), Learning (1-10), Stress (1-10), Freedom (1-10), Creativity (1-10), Family Impact, Health Impact, Comments |
| Explicit persistent ID? | **`Document ID`** as row key (1:1 with document); **no data** |
| Provisional IDs required? | Depends on Document ID fill |
| Duplicates / ambiguity | None (empty) |

### Time Allocation

| Field | Finding |
|-------|---------|
| Sheet/table | `Time Allocation` |
| Apparent domain | Per-document time allocation % |
| Columns | Document ID + percentage columns |
| Explicit persistent ID? | **`Document ID`**; **no data** |
| Provisional IDs required? | Depends on Document ID fill |
| Duplicates / ambiguity | None (empty) |

### Quotes

| Field | Finding |
|-------|---------|
| Sheet/table | `Quotes` |
| Apparent domain | Quotes |
| Columns | Quote, Speaker, Document ID, Theme |
| Explicit persistent ID? | **No quote_id**; only optional `Document ID` ref; **no data** |
| Provisional IDs required? | **Yes** for quote rows (Document ID is FK-like, not quote identity) |
| Duplicates / ambiguity | None (empty) |

### Questions

| Field | Finding |
|-------|---------|
| Sheet/table | `Questions` |
| Apparent domain | Open questions |
| Columns | Question, Raised In Doc, Resolved?, Resolution Doc, Notes |
| Explicit persistent ID? | **No** |
| Data rows | 0 |
| Provisional IDs required? | Yes when populated |
| Duplicates / ambiguity | None (empty) |

### Cross References

| Field | Finding |
|-------|---------|
| Sheet/table | `Cross References` |
| Apparent domain | Document relationships |
| Columns | Source Doc, Target Doc, Relationship, Notes |
| Explicit persistent ID? | **No** `relationship_id`; composite of source/target/relationship if used later |
| Data rows | 0 |
| Provisional IDs required? | Likely yes unless composite key declared in manifest |
| Duplicates / ambiguity | None (empty) |

### Digital Framework

| Field | Finding |
|-------|---------|
| Sheet/table | `Digital Framework` |
| Apparent domain | Framework themes / heuristics |
| Columns | Framework ID, Theme, Pattern, Heuristic, Decision Rule, Confidence, Supporting Docs, Open Questions |
| Explicit persistent ID? | **`Framework ID`**; **no data** |
| Provisional IDs required? | Yes until filled |
| Duplicates / ambiguity | None (empty) |

---

## Cross-file schema drift (People)

| Workbook | People ID column | People data |
|----------|------------------|-------------|
| Master Archive | **Missing** | 66 rows |
| Knowledge Base v1 | **`Person ID` present** | 0 rows |

Registration manifest must pick a workbook-of-record and pin schema_version; do not assume Master Archive and Knowledge Base are interchangeable without a mapping.

---

## Implications for ADR-0013 (still Proposed)

1. Do **not** Accept ADR-0013 until owner confirms workbook-of-record and which sheets are registered.  
2. Populated tables today (**Timeline**, **People**) largely require **provisional** ids.  
3. Empty sheets with ID columns are “explicit-ID-ready” only after values exist.  
4. Duplicate person **names** require entity-matching separate from identity.  
5. No `relationship_id` column on Cross References yet.

## Missing source file?

If the true Framework workbook lives elsewhere (ChatGPT Project files, iCloud, another filename), provide that path. Inventory above used the only `Digital_Newell_*.xlsx` files found under Downloads; **nothing in the NewellAI git repo**.
