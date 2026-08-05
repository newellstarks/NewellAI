# Requirements

**Chapter 3 — Requirements**

| | |
|---|---|
| **Status** | Active |
| **Purpose** | Functional and non-functional requirements by phase. |
| **Prerequisites** | [Chapter 1 — Vision](./Vision.md), [Chapter 2 — Roadmap](./Roadmap.md) |
| **Related chapters** | [Architecture](./Architecture.md), [Contracts](./Contracts.md), [API](./API.md), [Authentication](./Authentication.md), [Artifacts](./Artifacts.md), [StructuredSources](./StructuredSources.md), [ADRs](./ADRs/) |
| **Nav** | [← Prev](./Roadmap.md) · [TOC](./README.md#table-of-contents) · [Next →](./Architecture.md) |

---
Phases are defined in [Roadmap.md](./Roadmap.md). **Do not optimize capture before the foundation exists.**

## Phase 1 — Foundation (complete — closed 2026-08-01)

Prove a working backend for customer zero (and future clients):

- Shared contracts for turn / ingest shapes
- Cloudflare Worker with authenticated upload API
- Validation of ingest payloads
- D1 persistence (schema + migrations)
- Manual end-to-end upload test is enough to exit Phase 1 — **passed 2026-08-01** (local Worker + local D1; see the exit record in [Roadmap.md](./Roadmap.md))

FR-F1 through FR-F6 are all implemented.

### Functional requirements (Phase 1)

| ID | Requirement |
|----|-------------|
| FR-F1 | Define shared contracts used by Worker and future clients |
| FR-F2 | Authenticated `POST` ingest of turns to the Worker |
| FR-F3 | Validate payloads before D1 writes |
| FR-F4 | Persist turns in D1 with multi-user-ready schema |
| FR-F5 | Idempotent ingest on `client_turn_id` (clients will retry) |
| FR-F6 | Retrieve/inspect stored turns (minimal API or query path) |

### Non-functional requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | Config via environment / bindings—no hard-coded secrets or user identity |
| NFR-2 | Modular separation of client capture, ingest API, and storage |
| NFR-3 | Naming and schemas that do not assume a single permanent user |
| NFR-4 | Clear docs so humans and Cursor can reason about the system |
| NFR-5 | Prefer maintainability over premature optimization of capture |
| NFR-6 | Visual presentation and formatting in Word/Excel are human-facing semantic data and preserved latent semantic information; three layers (immutable binary, structural/formatting model, extracts); extraction never replaces layers 1–2 | [ADR-0016](./ADRs/0016-document-and-workbook-fidelity.md) **Accepted** |
| NFR-7 | Edits: change only what was requested; classify content/formatting/structural/mixed; smallest region; new version (never overwrite parent); change manifest; original-vs-revised comparison; human review before preferred; one-paragraph/one-cell isolation; `2`/`2.0`/`2.00` distinct; blank lines intact; moved content keeps style/separation; checksums prove original unchanged | [ADR-0016](./ADRs/0016-document-and-workbook-fidelity.md) **Accepted** |

### Out of scope (Phase 1)

- Implementing Capture Client v1 (Chrome extension) capture logic
- Extension Durable Queue behavior
- DOM observation / ChatGPT UI scraping
- iPhone or multi-browser capture
- Full multi-tenant commercial onboarding
- Mandatory end-to-end encryption

## Phase 2 — Capture Client v1

Once the backend works, add **Capture Client v1 (Chrome Extension)**:

| ID | Requirement | Notes |
|----|-------------|--------|
| FR-C1 | Capture turns from ChatGPT in the browser | Slice 2 — design accepted ([CaptureClient.md](./CaptureClient.md)) |
| FR-C2 | Local durable queue + sync to the Phase 1 upload API | Slice 1 — done |
| FR-C3 | Surface sync errors to the operator | Slice 1 — done (options + badge); capture-enabled status in Slice 2 |

This client is an **adapter**—not the architecture. See [CaptureClient.md](./CaptureClient.md).

### Conversation artifacts (proposed — Phase 2 follow-on)

Authoritative detail: [Artifacts.md](./Artifacts.md) (Draft). Binaries must not live in D1 or the `turns` table.

| ID | Requirement | Notes |
|----|-------------|--------|
| FR-A1 | Capture user-uploaded images linked to the user turn | Artifact v1 |
| FR-A2 | Capture assistant-generated images linked to the assistant turn | Artifact v1 |
| FR-A3 | Capture user-uploaded Excel linked to the user turn | Artifact v1 |
| FR-A4 | Capture generated/revised Excel as new versioned artifacts (lineage) | Artifact v1 |
| FR-A5 | Metadata in D1; bytes only in object storage | Hard rule |
| FR-A6 | Idempotent artifact capture across reload/rescan | Artifact v1 |
| FR-A7 | Distinguish metadata-only vs fully stored (`capture_status`) | Failure recovery |
| FR-A8 | Project ChatGPT URL / conversation identity (`/g/…/c/…`) | Artifact v1 |
| FR-A9 | Authenticated metadata list + authorized binary access | Read API extension |
| FR-A10 | Sibling artifact queue (not turn queue) for binary transfer | Resolved 2026-08-05 |
| FR-A11 | Metadata via `conversation_id` + `client_turn_id`; nullable `turn_id`; explicit unresolved/orphan | Resolved 2026-08-05 |
| FR-A12 | V1 allowlist png/jpeg/webp/xlsx; max 25 MB configurable; no macros/archives/executables/password workbooks | Resolved 2026-08-05 |
| FR-A13 | Two-phase artifact ingest; checksum conflict = hard fail (no replace identity) | ADRs 0008–0009 Accepted |
| FR-A14 | Orphan via watermark/explicit reconciliation only; re-linkable | ADR-0008 Accepted |
| FR-A15 | Parallel ≤1+≤1 pipelines; page origins chatgpt.com / chat.openai.com | ADR-0009 Accepted |

### Structured sources and canonical knowledge (proposed — after Artifact capture)

Authoritative detail: [StructuredSources.md](./StructuredSources.md) (Draft). Staged hybrid; local workbook lineage authoritative; ChatGPT = transport. v0 = D1 staging only (no domain tables). Inventory: [DigitalNewellFrameworkInventory.md](./DigitalNewellFrameworkInventory.md).

| ID | Requirement | Notes |
|----|-------------|--------|
| FR-K1 | Distinguish ordinary artifacts, structured sources, and canonical application DB | Three-layer model |
| FR-K2 | Register Digital Newell Framework (and other workbooks) as structured sources | Not generic attachment-only |
| FR-K3 | Preserve and version source workbooks; import retains workbook/sheet/table/row/cell provenance | Local lineage authoritative |
| FR-K4 | Stable `source_record_id` / row identity across workbook versions | ADR-0013 Proposed — inventory-gated |
| FR-K5 | Import runs with preview, partial apply, reject, conflict, reversible apply | `completed_with_conflicts` |
| FR-K6 | Detect create/update/delete between workbook versions for designated tables | Delete = propose_only while workbook-authoritative |
| FR-K7 | Capture displayed values for import; retain formula text in provenance when available | |
| FR-K8 | Export to Excel without destroying source history | New artifact versions only |
| FR-K9 | Staged hybrid canonical ownership with per-table/domain promotion | ADR-0011 Proposed |
| FR-K10 | Structured Source v0 uses D1 for staging/control-plane only — no canonical domain tables | Owner 2026-08-05 |

## Phase 3 — Additional clients

Additional adapters (Safari, Firefox, Cursor, Claude Desktop, ChatGPT Desktop, macOS app, OpenAI API if available, …) must:

| ID | Requirement |
|----|-------------|
| FR-P3-1 | Use the same contracts and authenticated upload API |
| FR-P3-2 | Not require a forked Worker or per-client D1 schema |
| FR-P3-3 | Document client-specific behavior in the notebook / ADR when it diverges from v1 |

## Related

- [Roadmap](./Roadmap.md)
- [Vision](./Vision.md)
- [Architecture](./Architecture.md)
- [CaptureClient](./CaptureClient.md)
- [Artifacts](./Artifacts.md)
- [StructuredSources](./StructuredSources.md)
- [ADRs](./ADRs/)
