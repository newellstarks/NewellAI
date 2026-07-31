# Architecture

## Overview

NewellAI is a turn-capture system with three primary surfaces:

| Area | Path | Role |
|------|------|------|
| Chrome extension | `apps/extension/` | Capture turns; **Durable Queue** (buffer, order, retry); sync to Worker |
| Worker | `apps/worker/` | Authenticated ingest API, validation, and D1 persistence |
| Contracts | `packages/contracts/` | Shared turn / API shapes |
| Migrations | `migrations/` | D1 schema SQL |

Documentation lives in `docs/` as an engineering notebook.

## Design direction

Even while Phase 1 is single-user, prefer practices that allow expansion:

- Configuration through env / config files
- Modular capture, storage, and retrieval
- Multi-user-capable schemas and naming
- Docs that keep AI assistants aligned with intent

## High-level data flow

```
ChatGPT (browser)
    → Chrome extension (capture)
    → Extension Durable Queue (order, retry, local durability)  ← docs/DurableQueue.md
    → Cloudflare Worker (authenticated ingest, validation)
    → D1 (persistence)
    → periodic sync → local SQLite (inspect / backup)
```

## Component responsibilities

### Extension

Observe conversation UI, extract turn payloads, enqueue into the local Durable Queue, and sync to the Worker when online.

### Worker

Provide an authenticated ingest API, validate payloads, and persist to D1. The Worker does **not** own the durable queue.

### Database

Define schemas for users, sessions, and turns that can grow from one operator to many accounts. Ingest must be idempotent on `client_turn_id`.

## Related

- [Vision](./Vision.md)
- [Requirements](./Requirements.md)
- [Database](./Database.md)
- [API](./API.md)
- [ChromeExtension](./ChromeExtension.md)
- [TurnCapture](./TurnCapture.md)
- [DurableQueue](./DurableQueue.md)
- [ADRs](./ADRs/)
- [Diagrams](./Diagrams/)
