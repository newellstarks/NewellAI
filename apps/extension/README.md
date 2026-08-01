# Capture Client v1 — Chrome Extension (`@newellai/extension`)

**This package is an adapter, not the product.** NewellAI’s core is the Phase 1 backend; this is the first capture client.

Owns **capture** and the **Durable Queue** for Capture Client v1 only. See [CaptureClient.md](../../docs/CaptureClient.md) and [ADR-0004](../../docs/ADRs/0004-why-browser-extension-capture.md).

## Status

Phase 2 Slice 1 — durable queue and sync engine ([DurableQueue.md](../../docs/DurableQueue.md), [ADR-0006](../../docs/ADRs/0006-capture-client-durable-queue-identity-and-synchronization.md)):

- IndexedDB queue, dead letters, identity registry, per-conversation sequences (`src/queue/`)
- Sync engine: one-conversation batches (max 25 turns), persisted exponential backoff (5 s → 5 min, 5 attempts), 401 hold without consuming retries, permanent 4xx dead-letter, crash recovery (`src/queue/sync.ts`)
- MV3 service worker: immediate sync on enqueue, one-minute `chrome.alarms` sweep, startup recovery, badge counts (`src/background.ts`)
- Options page: Worker URL, token (stored in `chrome.storage.local`, never displayed or synced), queue status, synthetic test enqueue (`options.html`, `src/options.ts`)

No ChatGPT DOM capture yet — that is the next slice.

## Docs

- [CaptureClient.md](../../docs/CaptureClient.md)
- [DurableQueue.md](../../docs/DurableQueue.md)
- [TurnCapture.md](../../docs/TurnCapture.md)
- [Roadmap.md](../../docs/Roadmap.md)

## Develop

```bash
# from repo root
npm install

# in apps/extension
npm run build       # esbuild → dist/
npm test            # vitest (fake-indexeddb)
npm run typecheck
```

To load locally: run `npm run build`, then load `apps/extension` as an unpacked extension via `chrome://extensions` (Developer mode → *Load unpacked*). Configure the Worker base URL and capture API token on the options page, then use **Enqueue test turn** against a local `wrangler dev` Worker.

Diagnostics never include conversation text or the token.
