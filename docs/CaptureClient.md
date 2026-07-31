# Capture Client v1 (Chrome Extension)

**Chapter 8 — Capture Client v1 (Chrome Extension)**

| | |
|---|---|
| **Status** | Draft |
| **Purpose** | First capture adapter (Chrome extension)—not the product architecture. |
| **Prerequisites** | [Chapter 2 — Roadmap](./Roadmap.md), [Chapter 4 — Architecture](./Architecture.md), [Chapter 6 — API](./API.md) |
| **Related chapters** | [TurnCapture](./TurnCapture.md), [DurableQueue](./DurableQueue.md), [ADR-0004](./ADRs/0004-why-browser-extension-capture.md) |
| **Nav** | [← Prev](./Database.md) · [TOC](./README.md#table-of-contents) · [Next →](./TurnCapture.md) |

---

## Role

**Phase 2 — first capture client** (not Phase 1 Foundation, not the product itself).

NewellAI is a **platform** with a client-agnostic backend. This page describes **Capture Client v1**, implemented as a Chrome extension because it is the fastest path to a working end-to-end system.

> The system is not a Chrome extension.  
> The Chrome extension is simply the first implementation of the capture client.

It owns **capture** and the **Durable Queue** (local buffer, order, retry, sync) for this client only. Other clients (Phase 3) talk to the **same** Worker upload API.

## Do not optimize yet

Complete [Phase 1 Foundation](./Roadmap.md) (contracts, Worker, D1, auth, upload API) before implementing capture / queue logic. Scaffold under `apps/extension` may exist; application logic waits for Phase 2.

## Phase 2 scope

- Desktop / Chromium ChatGPT capture for customer zero
- Reliable turn extraction over clever UI scraping
- Local durable queue + sync (see [DurableQueue.md](./DurableQueue.md))
- Configuration for Worker base URL and auth via extension options / env-backed build config

## Out of scope here

- Treating this client as the only possible client
- Phase 3 adapters (Safari, Firefox, Cursor, Claude Desktop, ChatGPT Desktop, macOS app, OpenAI API, …)
- Server-side primary queue

## Responsibilities (Phase 2)

1. Detect new turns in the conversation UI
2. Normalize to the shared turn schema (`packages/contracts`)
3. **Enqueue** into this client’s Durable Queue
4. **Sync** queued turns to the Worker authenticated ingest API
5. Surface queue / sync status and errors to the operator

## Related

- [Roadmap](./Roadmap.md) — Phase 2 vs Phase 3
- [Requirements](./Requirements.md)
- [Architecture](./Architecture.md)
- [TurnCapture](./TurnCapture.md)
- [DurableQueue](./DurableQueue.md)
- [API](./API.md)
- [ADR-0002](./ADRs/0002-durable-queue-in-extension.md)
- [ADR-0004](./ADRs/0004-why-browser-extension-capture.md)
- Code: `apps/extension/`
