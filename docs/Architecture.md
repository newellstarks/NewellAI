# Architecture

**Chapter 4 — Architecture**

| | |
|---|---|
| **Status** | Active |
| **Purpose** | System shape, ownership boundaries, and high-level data flow. |
| **Prerequisites** | [Chapter 2 — Roadmap](./Roadmap.md), [Chapter 3 — Requirements](./Requirements.md) |
| **Related chapters** | [Contracts](./Contracts.md), [API](./API.md), [Authentication](./Authentication.md), [Database](./Database.md), [CaptureClient](./CaptureClient.md), [ADRs](./ADRs/) |
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
    → D1 (persistence)
    → optional: local SQLite mirror (inspect / backup)

Phase 3 clients (Safari, Firefox, Cursor, Claude Desktop, …)
    → same Worker ingest + contracts + D1
```

## Component responsibilities

### Capture Client v1 (Phase 2)

Chrome extension implementation of the first capture adapter. Observe UI, enqueue locally, sync to Worker. Not required to complete Phase 1.

### Worker (Phase 1)

**Role:** Authenticated ingest API, validation, and D1 persistence. Does **not** own the durable queue. Any authorized client may call ingest.

**Current slice:** authenticated ingest + D1 persistence + minimal read API ([Authentication.md](./Authentication.md), [Database.md](./Database.md); routes in [API.md](./API.md)). Durable queue integration is next on the [Roadmap](./Roadmap.md).

### Database

Schemas for users, conversations, and turns. Ingest idempotent on `client_turn_id`.

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
- [ADRs](./ADRs/)
- [ADR-0004](./ADRs/0004-why-browser-extension-capture.md)
- [Diagrams](./Diagrams/)
