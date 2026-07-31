# Roadmap

The engineering notebook is authoritative. This page tracks **phases and the build order**—not implementation detail.

## Build inside-out

We build the **platform core first**. Capture Client v1 (Chrome extension) is the **last** major subsystem in this sequence—not the first.

```
✅ Foundation scaffold (notebook, repo, monorepo) — tagged v0.1-foundation
✅ Shared Contracts (wire protocol)              — done
→  Worker ingest endpoint                         ← next
→  Authentication
→  D1 schema
→  Durable upload (idempotent, reliable ingest)
→  Capture Client v1 (Chrome extension adapter)
```

**What’s happening?** Inside-out development: wire protocol → Worker → auth → storage → durable ingest → then the first adapter. The extension stops being the center of gravity.

## Engineering sequence (detail)

| Step | Milestone | Status | Spec |
|------|-----------|--------|------|
| 0 | Foundation scaffold | Done (`v0.1-foundation`) | [Architecture](./Architecture.md) |
| 1 | Shared Contracts (wire protocol) | Done | [Contracts.md](./Contracts.md) |
| 2 | Worker ingest endpoint | **Next** | [API.md](./API.md) |
| 3 | Authentication | TBD | [API.md](./API.md) |
| 4 | D1 schema | TBD | [Database.md](./Database.md) |
| 5 | Durable upload | TBD | Idempotent ingest, retries-safe; see Contracts + API |
| 6 | Capture Client v1 | Phase 2 | [CaptureClient.md](./CaptureClient.md) |

### Durable upload (before Capture Client v1)

Server-side: accept `UploadRequest`, validate, persist idempotently on `client_turn_id`, return `UploadResponse` / `ApiError`. Manual/`curl` tests count. This is **not** the extension Durable Queue (that remains Phase 2 / Capture Client v1 — [ADR-0002](./ADRs/0002-durable-queue-in-extension.md)).

## Phase map

### Phase 1 — Foundation (current)

Goal: a working backend. Any authorized client can upload turns via the wire protocol.

Non-goals: Capture Client v1 logic, DOM scraping, multi-client polish.

### Phase 2 — Capture Client v1

**Capture Client v1 (Chrome Extension)** — one adapter on the finished backend. See [ADR-0004](./ADRs/0004-why-browser-extension-capture.md).

### Phase 3 — Additional clients

Safari, Firefox, Cursor, Claude Desktop, ChatGPT Desktop, macOS app, OpenAI API (if available), export/import — **same** contracts, auth, upload API, D1.

## Later (platform)

- Local SQLite mirror / inspection UX
- Commercial multi-user onboarding
- Optional user-held encryption

## Related

- [Contracts](./Contracts.md) — wire protocol
- [Requirements](./Requirements.md)
- [Architecture](./Architecture.md)
- [API](./API.md)
- [CaptureClient](./CaptureClient.md)
