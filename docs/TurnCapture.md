# Turn Capture

**Chapter 10 — Turn Capture**

| | |
|---|---|
| **Status** | Active |
| **Purpose** | Domain definition of turns and how they flow through the system. |
| **Prerequisites** | [Chapter 5 — Shared Contracts](./Contracts.md) |
| **Related chapters** | [API](./API.md), [Authentication](./Authentication.md), [Database](./Database.md), [CaptureClient](./CaptureClient.md), [DurableQueue](./DurableQueue.md), [ADR-0006](./ADRs/0006-capture-client-durable-queue-identity-and-synchronization.md) |
| **Nav** | [← Prev](./CaptureClient.md) · [TOC](./README.md#table-of-contents) · [Next →](./DurableQueue.md) |

---

## Purpose

Turn Capture describes the **turn** domain: what we store and how halves relate.  

- **Phase 1** delivers the backend that accepts and persists turns.  
- **Phase 2** Capture Client v1 (Chrome extension) observes ChatGPT and syncs.  
- **Phase 3** additional clients use the same ingest path.

Implementation: `apps/extension/` (v1 client), `apps/worker/`, `packages/contracts/`, `migrations/`.

## What is a Turn?

A **full turn** is both sides of an exchange within a conversation:

| Half | Speaker | Meaning |
|------|---------|---------|
| Request | User | What the operator submitted |
| Response | Assistant | What ChatGPT returned |

Both halves share conversation context and are stored chronologically so recall and inspection stay ordered. Wire field: `conversation_id` ([Contracts.md](./Contracts.md)).

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
3. **Conversation-aware ordering** — Capture Client v1 queue preserves order per conversation before sync
4. **Multi-user-ready fields** — `user_id` even for customer zero (configurable; default `user-1` in Capture Client v1)
5. **Local durability first** (v1) — enqueue succeeds on device; sync retries until Worker/D1 accept
6. Failed sync is visible to the operator (not silent forever)
7. **Append-only history** — new source identities add turns; capture does not rewrite or delete prior D1 rows
8. **Operator-controlled capture** — ChatGPT observation enqueues only when explicitly enabled ([CaptureClient.md](./CaptureClient.md))

## Identity and sequence (normative for Capture Client v1)

Authoritative policy: [ADR-0006](./ADRs/0006-capture-client-durable-queue-identity-and-synchronization.md) and [DurableQueue.md](./DurableQueue.md).

- Prefer a **validated source-provided** message identifier (adapter-extracted; not a hard-coded architectural DOM attribute).
- Else deterministic synthetic `source_key`:

  `conversation_id | speaker | normalizedText | occurrenceIndexAmongSameSpeakerAndSameNormalizedText`

- Sequence is assigned **once** when a previously unseen source turn is accepted into durable storage. Rescans reuse identity and sequence.

### Append-only observation policy (Slice 2)

| Event | Behavior |
|-------|----------|
| New source ID | New historical turn |
| Same source ID after first acceptance | Ignore in-place text changes |
| Branching | Capture **visible** completed content only |
| Regenerate (new source ID) | Separate historical turn |
| Edit user (new source ID) | Separate historical turn |
| Delete in UI | Do not delete from D1 |

Replacing earlier turns in place would require a later ADR.

### Assistant completion (Slice 2)

Complete only when all of:

1. No applicable stop / generating affordance
2. No known streaming / incomplete marker
3. Normalized text unchanged for **≥ 1 second**

## Draft turn payload

Canonical fields: [Contracts.md](./Contracts.md) (`TurnPayload`, `ConversationMetadata`, `CaptureMetadata`).

## Lifecycle (operator view — Capture Client v1)

1. Operator configures Worker URL + token; sets **Capture ChatGPT turns** to **On**
2. Operator opens ChatGPT and starts (or continues) a conversation
3. Capture Client v1 observes completed user messages and assistant replies
4. Each half-turn is normalized and **enqueued locally** (idempotent on source identity)
5. Client syncs the queue to the Worker authenticated ingest API
6. Worker validates and writes to D1
7. Optional local SQLite mirror later supports inspection / backup

## Success criteria (Capture Client v1)

- [x] Durable queue + sync deliver turns to D1 (Slice 1)
- [ ] User and assistant halves for the same conversation land in D1 in order (Slice 2)
- [ ] Missing client timestamp does not drop the turn
- [ ] Failed ingest is visible to the operator (not silent forever)
- [ ] Capture works for customer-zero ChatGPT browser sessions without hard-coded identity in the architectural contract
- [ ] Rescan / reload does not create duplicate turns for the same source identity
- [ ] Local SQLite mirror can list last N turns for a conversation (**later**)

## Non-goals (this domain page)

- Treating the Chrome extension as the only client
- Phase 3 client implementations (document separately when started)
- Snowflake / analytics export (future)
- Mandatory client-side encryption
- In-place replacement of regenerated answers in D1 (would need a later ADR)

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
