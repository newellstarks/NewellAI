# Chrome Extension

## Role

Browser capture surface for ChatGPT conversations. Owns **capture** and the **Durable Queue** (local buffer, order, retry, sync).

The Cloudflare Worker is only the authenticated ingest / validation / D1 persistence endpoint—not the queue.

## Phase 1 scope

- Desktop / browser ChatGPT capture for customer zero
- Reliable turn extraction over clever UI scraping
- Local durable queue + sync (see [DurableQueue.md](./DurableQueue.md))
- Configuration for Worker base URL and auth via extension options / env-backed build config

## Out of scope (for now)

- iPhone / mobile Safari capture (after desktop reliability)
- Non-ChatGPT AI surfaces
- Server-side primary queue

## Responsibilities

1. Detect new turns in the conversation UI
2. Normalize to the shared turn schema (`packages/contracts`)
3. **Enqueue** into the extension Durable Queue
4. **Sync** queued turns to the Worker authenticated ingest API
5. Surface queue / sync status and errors to the operator

## Related

- [Requirements](./Requirements.md)
- [Architecture](./Architecture.md)
- [TurnCapture](./TurnCapture.md)
- [DurableQueue](./DurableQueue.md)
- [API](./API.md)
- [ADR-0002](./ADRs/0002-durable-queue-in-extension.md)
- [ADR-0004](./ADRs/0004-why-browser-extension-capture.md)
- Code: `apps/extension/`
