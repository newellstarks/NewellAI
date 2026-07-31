# Turn Capture

## Purpose

Turn Capture is the core Phase 1 capability: record each conversational **turn** between a user and ChatGPT in a structured, searchable store.

This page is the engineering notebook for *what* we capture, *when*, and *how* it flows through the system. Implementation details live in `extension/`, `worker/`, and `database/`.

## What is a Turn?

A **full turn** is both sides of an exchange within a session:

| Half | Speaker | Meaning |
|------|---------|---------|
| Request | User | What the operator submitted |
| Response | Assistant | What ChatGPT returned |

Both halves share session context and are stored chronologically so recall and inspection stay ordered.

## Phase 1 capture path

```
ChatGPT UI (browser)
    → Chrome extension detects / normalizes turn
    → POST Worker ingest API
    → D1 (authoritative)
    → periodic sync → local SQLite (inspect / backup)
```

Prior experiments used local Flask (`/log_turn` → `memory.db`), Custom GPT → Worker `/collect-turn` (R2 + Durable Object sequencing), and related bridges. Phase 1 standardizes on **extension + Worker + D1 + SQLite mirror**.

## Capture principles

1. **Reliability over cleverness** — prefer stable selectors / payloads over fragile UI scraping tricks
2. **Server-side timestamps** when the client omits them
3. **Session-aware ordering** — sequence turns so recall returns last N in order
4. **Multi-user-ready fields** — `user_id` / `client_id` even for customer zero
5. **Silent continuous capture** during a session; surface errors to the operator when ingest fails

## Draft turn payload

Minimum fields for ingest (names may evolve; lock via ADR + schema migration):

| Field | Notes |
|-------|-------|
| `user_id` | Account identity (Phase 1: single operator) |
| `session_id` | Conversation / chat session |
| `sequence` | Order within session (Worker may assign) |
| `speaker` | `user` \| `assistant` |
| `turn_text` | Message body |
| `timestamp` | ISO-8601; prefer server if missing |
| `message_type` | Optional classification |
| `topic` | Optional label |
| `parent_turn_id` | Optional link request ↔ response |
| `context_blob` | Optional structured extras (JSON) |

## Lifecycle (operator view)

1. Operator opens ChatGPT in the browser and starts (or continues) a session
2. Extension observes submitted user messages and assistant replies
3. Each half-turn is normalized and posted to the Worker
4. Worker validates, sequences, and writes to D1
5. Local sync later mirrors rows into SQLite for inspection

## Success criteria (initial)

- [ ] User and assistant halves for the same session land in D1 in order
- [ ] Missing client timestamp does not drop the turn
- [ ] Failed ingest is visible to the operator (not silent forever)
- [ ] Local SQLite mirror can list last N turns for a session
- [ ] Capture works for customer-zero ChatGPT browser sessions without hard-coded identity in code

## Non-goals (this page / Phase 1)

- iPhone capture
- Non-ChatGPT surfaces
- Snowflake / analytics export (future)
- Mandatory client-side encryption

## Related

- [Requirements](./Requirements.md)
- [Architecture](./Architecture.md)
- [ChromeExtension](./ChromeExtension.md)
- [API](./API.md)
- [Database](./Database.md)
- [ADRs](./ADRs/)
- Historical notes in [`source/`](./source/) (turn memory build log / session trace)
