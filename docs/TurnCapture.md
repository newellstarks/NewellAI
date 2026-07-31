# Turn Capture

**Chapter 9 — Turn Capture**

| | |
|---|---|
| **Status** | Active |
| **Purpose** | Domain definition of turns and how they flow through the system. |
| **Prerequisites** | [Chapter 5 — Shared Contracts](./Contracts.md), [Chapter 8 — Capture Client v1](./CaptureClient.md) |
| **Related chapters** | [API](./API.md), [Database](./Database.md), [DurableQueue](./DurableQueue.md) |
| **Nav** | [← Prev](./CaptureClient.md) · [TOC](./README.md#table-of-contents) · [Next →](./DurableQueue.md) |

---

## Purpose

Turn Capture describes the **turn** domain: what we store and how halves relate.  

- **Phase 1** delivers the backend that accepts and persists turns.  
- **Phase 2** Capture Client v1 (Chrome extension) observes ChatGPT and syncs.  
- **Phase 3** additional clients use the same ingest path.

Implementation: `apps/extension/` (v1 client), `apps/worker/`, `packages/contracts/`, `migrations/`.

## What is a Turn?

A **full turn** is both sides of an exchange within a session:

| Half | Speaker | Meaning |
|------|---------|---------|
| Request | User | What the operator submitted |
| Response | Assistant | What ChatGPT returned |

Both halves share session context and are stored chronologically so recall and inspection stay ordered.

## Capture path (Phase 2+ with Capture Client v1)

```
ChatGPT UI (browser)
    → Capture Client v1 (Chrome extension) detects / normalizes turn
    → Client Durable Queue (local buffer + retry)
    → POST Worker authenticated ingest API
    → Worker validates + persists to D1
    → optional: local SQLite mirror (inspect / backup)
```

Phase 1 alone only requires the Worker ingest path (manual or any authorized client). Phase 3 clients substitute a different adapter above the same Worker.

## Capture principles

1. **Reliability over cleverness** — prefer stable selectors / payloads over fragile UI scraping tricks
2. **Server-side timestamps** when the client omits them
3. **Session-aware ordering** — Capture Client v1 queue preserves order per session before sync
4. **Multi-user-ready fields** — `user_id` / `client_id` even for customer zero
5. **Local durability first** (v1) — enqueue succeeds on device; sync retries until Worker/D1 accept
6. Failed sync is visible to the operator (not silent forever)

## Draft turn payload

Canonical fields: [Contracts.md](./Contracts.md) (`TurnPayload`, `ConversationMetadata`, `CaptureMetadata`).

## Lifecycle (operator view — Capture Client v1)

1. Operator opens ChatGPT in the browser and starts (or continues) a session
2. Capture Client v1 observes submitted user messages and assistant replies
3. Each half-turn is normalized and **enqueued locally**
4. Client syncs the queue to the Worker authenticated ingest API
5. Worker validates and writes to D1
6. Optional local SQLite mirror later supports inspection / backup

## Success criteria (Capture Client v1)

- [ ] User and assistant halves for the same session land in D1 in order
- [ ] Missing client timestamp does not drop the turn
- [ ] Failed ingest is visible to the operator (not silent forever)
- [ ] Local SQLite mirror can list last N turns for a session
- [ ] Capture works for customer-zero ChatGPT browser sessions without hard-coded identity in code

## Non-goals (this domain page)

- Treating the Chrome extension as the only client
- Phase 3 client implementations (document separately when started)
- Snowflake / analytics export (future)
- Mandatory client-side encryption

## Related

- [Roadmap](./Roadmap.md)
- [Requirements](./Requirements.md)
- [Architecture](./Architecture.md)
- [CaptureClient](./CaptureClient.md)
- [Contracts](./Contracts.md)
- [API](./API.md)
- [Database](./Database.md)
- [ADRs](./ADRs/)
- Historical notes in [`source/`](./source/) (turn memory build log / session trace)
- [DurableQueue](./DurableQueue.md) (Capture Client v1 buffer / sync — not the Worker)

