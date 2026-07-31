# ADR-0004: Why Capture Client v1 is a browser extension (and when to replace it)

## Status

Accepted

## Context

**Phase 1** builds the foundation: contracts, authenticated Worker ingest, validation, and D1 persistence. That work does **not** depend on how turns are observed.

**Phase 2** adds **Capture Client v1** — the first adapter that calls that backend. Several mechanisms are conceivable (extension, native apps, export polling, official APIs, …).

We record why v1 is a Chromium extension, and when to replace or supplement it. NewellAI is a **platform**; the extension is not the product.

## Decision

**Capture Client v1 (Phase 2): Chrome / Chromium extension** (`apps/extension`).

In Phase 2 (after Foundation), it owns:

1. Observing the ChatGPT web conversation UI
2. Normalizing turns to shared contracts
3. This client’s **Durable Queue** — see [ADR-0002](./0002-durable-queue-in-extension.md)
4. Calling the Worker authenticated ingest API

The Worker remains ingest / validation / D1 persistence only. **Any Phase 3 client uses the same API.**

### Why this as Capture Client v1

| Force | How the extension addresses it |
|-------|--------------------------------|
| Customer-zero turns happen in ChatGPT **web** | Fastest adapter on that surface |
| Need **real-time** capture | Can observe turns as they appear |
| Need **local durability** when offline | Queue lives on the device for this client |
| Keep cloud simple | Avoid making the Worker a queue runtime |

Do not optimize this client before Phase 1 Foundation exists.

## Consequences

### Positive

- Backend stays client-agnostic
- Fastest path to a working end-to-end demo after Foundation
- Offline capture can be added without redesigning D1

### Negative / costs

- UI scraping is brittle
- Chromium-first; Phase 3 covers other surfaces
- Extension distribution friction later

## When to replace (or supplement) Capture Client v1

Revisit this ADR before changing capture architecture if:

1. **Official real-time API** makes DOM observation unnecessary
2. **Primary surface leaves the browser** — add another Phase 3 client to the same ingest API
3. **Multi-browser product requirement** — Safari / Firefox / etc. as additional clients
4. **Brittle capture cost exceeds value** — prefer API/export-based clients
5. **Enterprise / distribution blockers** — companion app or import path as primary client
6. **Queue must leave the device** — new ADR; do not silently move the queue into the Worker

Preserve shared contracts, authenticated Worker ingest, and the notebook as authoritative spec. Prefer **adding** Phase 3 clients alongside v1 before removing it.

## Related

- [Roadmap](../Roadmap.md)
- [CaptureClient.md](../CaptureClient.md)
- [ADR-0002](./0002-durable-queue-in-extension.md)
- [Architecture.md](../Architecture.md)
- [Requirements.md](../Requirements.md)
