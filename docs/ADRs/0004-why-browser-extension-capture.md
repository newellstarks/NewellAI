# ADR-0004: Why initial capture is a browser extension (and when to replace it)

## Status

Accepted

## Context

Phase 1 must capture ChatGPT Plus conversational turns for customer zero on desktop/browser, buffer them durably when sync fails, and persist them via an authenticated Worker to D1.

Several capture mechanisms are conceivable:

- Browser extension (observe ChatGPT web UI; local durable queue; sync)
- Custom GPT / server-side hooks only (no local buffer)
- Official ChatGPT export / API polling (batch, not real-time)
- Native desktop or mobile apps
- OS-level accessibility / automation agents

We need a recorded choice for the **initial** mechanism, plus explicit conditions under which that choice should be revisited—so the architecture can evolve without pretending the extension is permanent dogma.

## Decision

**Initial capture mechanism: a Chromium browser extension** (`apps/extension`).

It owns:

1. Observing the ChatGPT web conversation UI
2. Normalizing turns to shared contracts
3. The **Durable Queue** (local buffer, order, retry, sync) — see [ADR-0002](./0002-durable-queue-in-extension.md)
4. Calling the Worker authenticated ingest API

The Worker remains ingest / validation / D1 persistence only.

### Why this choice (Phase 1)

| Force | How the extension addresses it |
|-------|--------------------------------|
| Turns happen in ChatGPT **web** for customer zero | Extension sits on that surface |
| Need **real-time** capture, not only periodic export | Can observe turns as they appear |
| Need **local durability** when offline or Worker is down | Queue must live on the device |
| Prove the loop quickly | Smallest reliable browser-native host for capture + queue |
| Keep cloud simple | Avoid making the Worker a queue runtime |

This is **not** “Chrome forever.” It is the narrowest Phase 1 prototype that still architects for multi-surface growth (shared contracts, Worker ingest, multi-user-ready schema).

## Consequences

### Positive

- Clear ownership: extension = capture + queue; Worker = authenticated persist
- Offline / flaky-network capture is first-class
- Notebook and code paths stay aligned (`apps/extension`)

### Negative / costs

- UI scraping / DOM observation is brittle when ChatGPT changes its front end
- Chromium-first; Safari / Firefox / iOS need separate work
- Store / enterprise policy friction for distributing extensions later
- Not a substitute for an official turn stream if OpenAI provides one

## When to replace (or supplement) the extension

Revisit this ADR and update the notebook **before** changing the capture architecture if any of the following become true:

1. **Official real-time API** — OpenAI (or equivalent) offers a supported, authenticated turn stream that makes DOM observation unnecessary for the target product.
2. **Primary surface leaves the browser** — Customer usage shifts to desktop/mobile native ChatGPT (or another host) where an extension cannot run; then add a native capture client that still talks to the same Worker ingest + contracts.
3. **Multi-browser product requirement** — Paying users need Firefox/Safari/iOS Safari parity; evaluate WebExtensions port, bookmarklet/userscript (weaker), or non-extension clients rather than Chromium-only.
4. **Brittle capture cost exceeds value** — ChatGPT UI churn makes extension maintenance the dominant cost; prefer API/export-based ingest or a vendor-supported integration.
5. **Enterprise / distribution blockers** — Extension install policies block adoption; ship a companion app or server-side import path as the primary capture mechanism.
6. **Queue must leave the device** — Regulatory or multi-device sync requirements demand a server-side durable buffer *in addition to* or *instead of* the extension queue; record a new ADR (do not silently move the queue into the Worker).

Replacement should preserve:

- Shared contracts (`packages/contracts`)
- Authenticated Worker ingest + idempotent D1 persistence
- Engineering notebook as authoritative spec

Prefer **adding** a capture adapter alongside the extension before deleting the extension path, unless the extension is proven obsolete.

## Related

- [ADR-0002](./0002-durable-queue-in-extension.md) — Durable Queue lives in the extension
- [ChromeExtension.md](../ChromeExtension.md)
- [TurnCapture.md](../TurnCapture.md)
- [Architecture.md](../Architecture.md)
- [Requirements.md](../Requirements.md)
