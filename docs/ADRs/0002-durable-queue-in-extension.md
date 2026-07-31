# ADR-0002: Durable Queue lives in the extension

## Status

Accepted

## Context

Early notebook drafts described a cloud-side durable queue between Worker ingest and D1. That blurs ownership: the Worker would become both API and queue runtime, while the extension would still need local buffering for offline capture.

## Decision

- The **Durable Queue** for Capture Client v1 lives in the **Chrome extension** implementation (`apps/extension`)
- The **Cloudflare Worker** provides an **authenticated ingest API, validation, and D1 persistence** only
- The extension buffers, orders, and retries for **this client**; the Worker does not own the primary queue
- Phase 3 clients may use their own local buffering strategy but must still call the same ingest API

## Consequences

- Architecture and folder READMEs must keep this split explicit from day one
- Offline / flaky-network capture is a first-class extension concern
- Worker stays simpler to test and reason about
- Idempotent ingest (`client_turn_id`) remains required on the server
