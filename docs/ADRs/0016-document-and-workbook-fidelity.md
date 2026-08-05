# ADR-0016: Document and workbook fidelity

## Status

Accepted

## Date

2026-08-05

## Deciders

Newell Starks (System Owner)

## Context

NewellAI will capture, analyze, version, edit, export, and review **Word and Excel** documents. For Newell, formatting is part of authorial meaning. Fidelity governs the **editing process**, not merely archival storage. Artifact binary capture ([ADR-0007](./0007-object-storage-platform.md)–[0010](./0010-binary-access-control.md)) preserves exact bytes; structured import ([ADR-0011](./0011-canonical-source-ownership.md)–[0015](./0015-deletion-behavior.md)) extracts claims. This ADR is the fidelity contract so extracts and edits never become the only truth.

## Scope

**In scope:** Word (DOCX) and Excel (XLSX) fidelity across:

- capture  
- analysis  
- editing  
- versioning  
- export  
- review  

**Out of scope (initially):** choosing a specific library; PDF print pixel-perfection; OCR of images-as-documents; changing Artifact v1 ingest (0007–0010). Analogous document types may be added later under this ADR or a follow-on.

## Decision

### 1. Formatting is semantic data

> **Visual presentation and formatting are human-facing semantic data and preserved latent semantic information.**

### 2. Three preserved layers

| Layer | Content | Rule |
|-------|---------|------|
| **1** | Exact **immutable** binary | Retained in object storage; never overwritten |
| **2** | Structural and formatting model | Preserved for open/analyze/edit/export |
| **3** | Extracted text, values, claims, entities | Machine layer only |

**Extraction never replaces** the original binary or the structural/formatting representation.

### 3. Editing rule

> **Change only what was requested. Preserve all unrelated content, formatting, structure, and rendered presentation.**

For every Word or Excel edit the system must:

| Requirement | Detail |
|-------------|--------|
| Classify | content / formatting / structural / **mixed** |
| Scope | **Smallest affected region** |
| Preserve | All unrelated content, formatting, structure, and rendered presentation |
| No silent normalize | Spacing, punctuation, decimal precision, styles, widths, heights, breaks, alignment, borders, grouping — unless explicitly requested |
| Version | **New artifact version**; **never overwrite** the parent |
| Change manifest | Required (see §6) |
| Fidelity warnings | Explicit when preservation is not guaranteed (§9) |
| Compare | Original-versus-revised rendered output supported |
| Review | **Human review** required before marking a revision **preferred** |

### 4. Versioning

Every AI (or automated) modification creates a **new artifact version** linked to its parent (`parent_artifact_id`). **Never overwrite** the source file.

### 5. Change classification

Every edit must distinguish:

- **content** change  
- **formatting** change  
- **structural** change  
- **mixed** change  

### 6. Change manifest

Record at least:

| Field | Purpose |
|-------|---------|
| Affected location | Paragraph/range, sheet!cell, named region, etc. |
| Before value and format | Prior content and/or formatting |
| After value and format | Resulting content and/or formatting |
| Change type | content \| formatting \| structural \| mixed |
| User instruction or reason | Why the edit was made |
| Tool/library used | Implementation that performed the edit |
| Fidelity confidence and warnings | e.g. exact / best_effort / lossy + explicit warnings |

### 7. Word fidelity

Preserve, **where present**:

- paragraph and line spacing  
- blank lines  
- indentation and tabs  
- styles and runs  
- page and section breaks  
- margins  
- headers and footers  
- numbering  
- tables  
- comments and tracked changes  
- images and placement  
- rendered pagination within defined tolerances  

### 8. Excel fidelity

Preserve, **where present**:

- formulas and displayed values  
- number formats  
- decimal places and trailing zeros  
- sheet order  
- widths and heights  
- hidden rows, columns, and sheets  
- merged cells  
- alignment and wrapping  
- borders and fills  
- conditional formatting  
- named ranges  
- tables and filters  
- freeze panes  
- validation  
- comments  
- charts  
- print settings  

### 9. Fidelity warnings

When a tool or library **cannot guarantee** preservation, the system must **warn explicitly** and must **not** claim exact fidelity.

### 10. Extra storage

Extra storage is **acceptable** when required to preserve human meaning and latent semantic information.

### Relationship to Artifact v1

Artifact v1 (Accepted ADRs 0007–0010) satisfies layer 1 for captured **images and XLSX**. Sequencing:

1. Image binary capture  
2. XLSX binary capture  
3. **DOCX binary capture** immediately after the artifact pipeline is proven (still out of first Artifact v1 acceptance test)  
4. **DOCX structural editing** later under this ADR  

Word/Excel edit, export-beyond-bytes, and round-trip fidelity checks are mandatory before those edit pipelines ship; they do not block image/XLSX binary capture.

## Implementation notes (locked — 2026-08-05)

### 1. Round-trip tolerances

Do **not** use one global numeric tolerance.

Define tolerances **per chosen library/pipeline and document class**, using:

- **Structural comparison**  
- **Rendered visual comparison**  
- **Explicit expected-reflow exceptions**  
- **Human review** for material presentation changes  

**Page count alone** is insufficient for DOCX. **Pixel comparison alone** is insufficient for XLSX.

### 2. Library selection

Preferred libraries remain **open** pending a bounded technical evaluation.

Evaluate candidates against:

- Preservation of untouched OOXML package parts  
- Surgical-edit capability  
- No rewrite of unrelated styles or structures  
- Preservation of comments, tracked changes, formulas, formats, named ranges, charts, print settings, and custom XML where present  
- Explicit reporting of unsupported fidelity  
- No-op round-trip behavior  

**Prefer minimal OOXML package manipulation** over reconstructing documents from a simplified object model.

### 3. Comparison artifacts

Require **both**:

- Structural diff  
- Rendered visual comparison  

Store comparison outputs as **separate review artifacts** linked to the **revised** artifact version.

### 4. DOCX timing

Keep **DOCX out of the first Artifact v1 acceptance test**. Sequence as under Relationship to Artifact v1 above.

### 5. Excel formula / value manifest

For **every edited cell**, record independently:

| Field | Notes |
|-------|--------|
| Formula before / after | Including absent formula |
| Stored value before / after | Cached/stored value in the package |
| Displayed text before / after | What the user sees |
| Number format before / after | |
| Recalculation requirement / state | |
| Change classification | `formula-only` \| `value-only` \| `format-only` \| `mixed` |

A **formula change remains substantive** even if displayed output is unchanged.

### 6. Tracked changes and comments

- **Preserve** tracked changes and comments **in place** whenever technically possible.  
- **Also surface** them in the change manifest when an edit: touches nearby content; resolves or deletes a comment; changes tracked-change boundaries; accepts or rejects revisions; or changes author/timestamp metadata.  
- **Never** silently accept revisions or remove comments.  

## Alternatives considered

| Option | Outcome |
|--------|---------|
| Archival-only fidelity | **Rejected** — editing must obey the same contract |
| Chapter-only (no ADR) | **Rejected** — too soft |
| Fold into 0007 or 0011–0015 only | **Rejected** — cross-cuts all Word/Excel paths |
| Whole-document regenerate per edit | **Rejected** — violates smallest-region editing |
| Global numeric round-trip tolerance | **Rejected** — per library/class + structural + visual + human review |
| Reconstruct from simplified object model as default | **Rejected** — prefer minimal OOXML package manipulation |
| Structural-only or visual-only comparison | **Rejected** — both required |
| DOCX in first Artifact v1 acceptance | **Rejected** — after pipeline proven |
| Silently accept/remove tracked changes or comments | **Rejected** |

## Consequences

- Library selection must be fidelity-aware or must warn; evaluation precedes lock-in.  
- Change manifests and preferred-revision review are part of edit UX/API.  
- Cell edits carry formula/value/display/format/recalc detail.  
- Comparison review artifacts increase storage; accepted.  
- No-op and narrow-edit fidelity tests are required for DOCX/XLSX edit pipelines.  
- Artifact v1 first acceptance stays image + XLSX only.

## Failure and recovery behavior

| Failure | Behavior |
|---------|----------|
| Tool cannot guarantee scoped edit / round trip | Explicit warning; fidelity confidence ≠ exact; parent binary remains authoritative |
| Broad reflow risk | Warn before apply; review required before preferred |
| Silent normalize / silent accept-revision / silent comment removal | Defect — do not ship as preserved |
| Unsupported OOXML feature touched | Report unsupported fidelity; warn; do not claim exact |

## Security and privacy implications

Full documents, manifests, and comparison artifacts retain PII — same authz as artifact bytes ([ADR-0010](./0010-binary-access-control.md)). Do not log full file bodies in fidelity warnings.

## Migration and reversal strategy

Bind this ADR before any Word/Excel edit or fidelity-sensitive export path. Library choice is locked only after the evaluation above. Reversal authorizing destructive normalize-on-edit requires a superseding ADR.

## Acceptance criteria

### Editing and round-trip (locked)

1. **One-paragraph edit** does not alter unrelated paragraphs, styles, spacing, or pagination outside defined tolerances.  
2. **One-cell edit** does not alter unrelated formulas, number formats, dimensions, hidden state, conditional formatting, named ranges, charts, or print settings.  
3. **`2`, `2.0`, and `2.00`** remain visually distinct when their formats differ.  
4. Deliberate **blank lines** remain intact.  
5. **Moved content** keeps its intended style and separation.  
6. **No-op** and **narrow-edit** round trips pass structural and rendered-fidelity checks (or emit explicit non-exact warnings), using per-library/class tolerances (not a single global number).  
7. **Original and revised** files remain independently downloadable.  
8. **Checksums** prove the original binary remains unchanged after revision.  

### Process (locked)

9. Every AI/automated edit: new version, parent link, change classification, change manifest (incl. tool/library, fidelity confidence/warnings; Excel cell fields per § Implementation notes), structural **and** rendered comparison artifacts linked to the revision, fidelity warnings when unguaranteed.  
10. **Human review** before a revision is marked preferred.  
11. Tracked changes/comments preserved in place when possible; surfaced in manifest when nearby/affected; never silently accepted or removed.  
12. Architecture, Artifacts, Structured Sources, Requirements, and ADR index cite this **Accepted** ADR.

## Relationship to other ADRs

- **0007–0010:** Immutable binaries (layer 1); edits are new versions with parent linkage ([ADR-0008](./0008-artifact-identity-lineage-and-turn-linkage.md)); comparison outputs are additional artifacts.  
- **0011–0015:** Extracts/claims (layer 3) and export must respect this fidelity contract (Proposed until Accepted).  
- **0006:** Do not apply turn-text normalization patterns to workbook/document presentation.
