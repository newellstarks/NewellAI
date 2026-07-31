# Architecture

## Overview

NewellAI is a turn-capture system with three primary surfaces:

| Area | Path | Role |
|------|------|------|
| Chrome extension | `extension/` | Capture turns from the browser |
| Worker | `worker/` | Ingest, validate, and serve APIs on Cloudflare |
| Database | `database/` | D1 schema / migrations; local SQLite mirror |

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
    → Cloudflare Worker (ingest API)
    → D1 (authoritative cloud store)
    → periodic sync → local SQLite (inspect / backup)
```

## Component responsibilities

### Extension

Observe conversation UI, extract turn payloads, post to the Worker API.

### Worker

Authenticate/authorize ingest (Phase 1 may be a shared secret), validate payloads, write to D1, expose read APIs for inspection.

### Database

Define schemas for users, sessions, and turns that can grow from one operator to many accounts.

## Related

- [Vision](./Vision.md)
- [Requirements](./Requirements.md)
- [Database](./Database.md)
- [API](./API.md)
- [ChromeExtension](./ChromeExtension.md)
- [ADRs](./ADRs/)
- [Diagrams](./Diagrams/)
