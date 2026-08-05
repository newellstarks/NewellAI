# Architecture

**Chapter 4 — Architecture**

| | |
|---|---|
| **Status** | Active |
| **Purpose** | System shape, ownership boundaries, and high-level data flow. |
| **Prerequisites** | [Chapter 2 — Roadmap](./Roadmap.md), [Chapter 3 — Requirements](./Requirements.md) |
| **Related chapters** | [Contracts](./Contracts.md), [API](./API.md), [Authentication](./Authentication.md), [Database](./Database.md), [CaptureClient](./CaptureClient.md), [Artifacts](./Artifacts.md), [StructuredSources](./StructuredSources.md), [ADRs](./ADRs/) |
| **Nav** | [← Prev](./Requirements.md) · [TOC](./README.md#table-of-contents) · [Next →](./Contracts.md) |

---

## Overview

NewellAI is a **platform**: a client-agnostic backend plus pluggable **capture clients**.

**Phase 1 (closed 2026-08-01)** — Foundation goal met: contracts, Worker ingest, shared-secret auth, D1 persistence, and the minimal read API are done; the manual end-to-end exit test passed locally ([Roadmap](./Roadmap.md)). Durable queue integration is next.  
**Phase 2** — Capture Client v1 (Chrome Extension): first adapter only.  
**Phase 3** — Additional clients against the same backend.

See [Roadmap.md](./Roadmap.md).

| Area | Path | Role | Phase |
|------|------|------|-------|
| Capture Client v1 | `apps/extension/` | First capture adapter + Durable Queue (Chrome extension) | 2 |
| Worker | `apps/worker/` | Authenticated ingest, validation, and D1 persistence | 1 |
| Contracts | `packages/contracts/` | **Wire protocol** — shared turn / API shapes for all clients | 1 |
| Migrations | `migrations/` | D1 schema SQL | 1 |

Documentation lives in `docs/` as an engineering notebook — the **authoritative specification**. Repo folders implement that intent; path updates must not rewrite ownership or behavior without an ADR.

## Repository layout (scaffold)

```
apps/extension/      → Phase 2: Capture Client v1 (Chrome extension) + Durable Queue
apps/worker/         → Phase 1: authenticated ingest, validation, D1 persistence
packages/contracts/  → Phase 1: wire protocol (all clients ↔ Worker)
migrations/          → Phase 1: D1 SQL (0001_init.sql)
docs/                → authoritative notebook
```

npm workspaces only ([ADR-0003](./ADRs/0003-npm-workspaces-only.md)).

## Design direction

- Configuration through env / config files
- Modular capture clients vs shared ingest / storage
- Multi-user-capable schemas and naming
- Docs that keep AI assistants aligned with intent
- **Do not** treat any single capture client as the system

## Design principle — document and workbook fidelity (hard requirement)

> **Visual presentation and formatting are human-facing semantic data and preserved latent semantic information.**

> **Change only what was requested. Preserve all unrelated content, formatting, structure, and rendered presentation.**

For Newell, formatting in **Word and Excel** is part of the **meaning**, not decoration. This is a hard requirement across capture, analysis, editing, versioning, export, and review ([ADR-0016](./ADRs/0016-document-and-workbook-fidelity.md) — **Accepted**).

### What must be preserved

| Layer | Requirement |
|-------|-------------|
| **1. Exact immutable binary** | Object storage — never overwritten; never replaced by an extract |
| **2. Structural and formatting model** | Word/Excel presentation semantics retained (see ADR-0016 §7–8) |
| **3. Extracted text / values / claims / entities** | Machine layer only — **never** replaces layers 1 or 2 |

### Hard rules

- Extra storage is **acceptable** when needed to preserve human meaning and latent semantic information.
- **No** silent normalization of spacing, decimal precision, pagination, layout, styles, or visual grouping.
- No-op and narrow-edit round trips must meet defined tolerances (or warn).
- Every AI/automated edit: classify content/formatting/structural/mixed; smallest region; **new version** + parent link; **change manifest** (location, before/after value+format, type, reason, tool/library, fidelity confidence/warnings); warn before broad reflow; compare original vs revised; **review before preferred**.
- When a tool cannot guarantee preservation, **warn explicitly** — never claim exact fidelity.
- Does not relax Artifact v1 binary capture (ADRs 0007–0010).

Authoritative decision: [ADR-0016](./ADRs/0016-document-and-workbook-fidelity.md) (**Accepted**).

## High-level data flow

### Phase 1 (foundation — no capture client required)

```
Authorized client (manual test / curl / future adapter)
    → Cloudflare Worker (authenticated ingest, validation)
    → D1 (persistence)
```

### Phase 2+ (capture clients)

```
AI surface (e.g. ChatGPT web)
    → Capture Client v1 (Chrome extension): capture + local Durable Queue
    → Cloudflare Worker (authenticated ingest, validation)
    → D1 (turn + artifact metadata persistence)
    → Object storage (artifact binaries — local first; private R2 when deployed)
    → optional: local SQLite mirror (inspect / backup)

Phase 3 clients (Safari, Firefox, Cursor, Claude Desktop, …)
    → same Worker ingest + contracts + D1 (+ object storage for artifacts)
```

## Conversation artifacts (proposed)

Turns are necessary but not sufficient. Images and Excel workbooks (later PDFs, documents, slides) uploaded by the user or produced by ChatGPT must be first-class **artifacts**: metadata in D1, bytes in object storage, linked to `conversation_id` and turn identity.

Hard rules: **no** binary files in the `turns` table; **no** artifact blobs in D1.

Some Excel files are **database-bearing** (Digital Newell Framework and other registered structured sources). Preserve them as versioned artifacts, then import designated tables into a **canonical application database** with row provenance. Three-layer model and staged hybrid ownership: [StructuredSources.md](./StructuredSources.md).

Ordinary capture: [Artifacts.md](./Artifacts.md) — ADRs **0007–0010 Accepted**. Structured / Framework layer: [StructuredSources.md](./StructuredSources.md) (ADRs 0011–0015 Proposed); inventory [DigitalNewellFrameworkInventory.md](./DigitalNewellFrameworkInventory.md).

## Component responsibilities

### Capture Client v1 (Phase 2)

Chrome extension implementation of the first capture adapter. Observe UI, enqueue locally, sync to Worker. Not required to complete Phase 1. Future Artifact v1 also discovers and downloads attachments (ordinary + Project chats) per [Artifacts.md](./Artifacts.md).

### Worker (Phase 1)

**Role:** Authenticated ingest API, validation, and D1 persistence. Does **not** own the durable queue. Any authorized client may call ingest.

**Current slice:** authenticated ingest + D1 persistence + minimal read API ([Authentication.md](./Authentication.md), [Database.md](./Database.md); routes in [API.md](./API.md)). Artifact ingest and object-storage put/get are proposed next ([Artifacts.md](./Artifacts.md)).

### Database

Schemas for users, conversations, and turns. Ingest idempotent on `client_turn_id`. Proposed later: artifact **metadata** tables only; binaries stay in object storage ([Database.md](./Database.md), [Artifacts.md](./Artifacts.md)).

## Related

- [Roadmap](./Roadmap.md)
- [Vision](./Vision.md)
- [Requirements](./Requirements.md)
- [Database](./Database.md)
- [API](./API.md)
- [Authentication](./Authentication.md)
- [CaptureClient](./CaptureClient.md)
- [TurnCapture](./TurnCapture.md)
- [DurableQueue](./DurableQueue.md)
- [Artifacts](./Artifacts.md)
- [StructuredSources](./StructuredSources.md)
- [ADR-0016](./ADRs/0016-document-and-workbook-fidelity.md)
- [ADRs](./ADRs/)
- [ADR-0004](./ADRs/0004-why-browser-extension-capture.md)
- [Diagrams](./Diagrams/)
