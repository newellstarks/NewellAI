# Roadmap

The engineering notebook is authoritative. This page tracks **phases and milestones**—not implementation detail.

**Right now we are building the core architecture (Phase 1 Foundation), not the capture mechanism.**

Capture clients are **Phase 2+**. Capture Client v1 happens to be a Chrome extension—it is an **adapter**, not the product.

## Phase 1 — Foundation

Goal: a working backend. Any authorized client can upload turns.

| Milestone | Status |
|-----------|--------|
| Engineering notebook | Done |
| Repository | Done |
| Project scaffolding (npm workspaces) | Done |
| Shared contracts / wire protocol (`packages/contracts`) | Done — see [Contracts.md](./Contracts.md) |
| Cloudflare Worker (`apps/worker`) | Scaffolded — logic TBD |
| D1 schema (`migrations/`) | TBD |
| Authentication | TBD |
| End-to-end upload API (manual test OK) | TBD |

When Phase 1 is complete: authenticated ingest → validation → D1 persistence, with a shared **wire protocol** ([Contracts.md](./Contracts.md)) that every client must obey.

### Phase 1 non-goals

- Capture Client v1 logic (Chrome extension)
- Durable queue implementation
- DOM / UI scraping
- Multi-client polish
- Optimizing how turns are observed in any AI UI

## Phase 2 — First capture client

Goal: one real capture client that uses the Phase 1 backend.

**Capture Client v1 (Chrome Extension)** — the important point: **it is just one client.**

| Milestone | Status |
|-----------|--------|
| Extension scaffold (`apps/extension`) | Done (placeholder) |
| Capture + Durable Queue (per notebook) | TBD |
| Sync to upload API | TBD |
| Operator-visible status / errors | TBD |

See [CaptureClient.md](./CaptureClient.md) and [ADR-0004](./ADRs/0004-why-browser-extension-capture.md).

## Phase 3 — Additional clients

Later, additional capture clients all talk to the **same backend** (same contracts, auth, upload API, D1):

- Safari
- Firefox
- Cursor
- Claude Desktop
- ChatGPT Desktop
- A macOS background app
- An OpenAI API client (if one becomes available)
- Export / import paths

Each new client is an adapter. Do not fork the Worker or schema per client. Record client-specific decisions as ADRs when they diverge from Capture Client v1.

## Later (platform)

- Local SQLite mirror / inspection UX
- Commercial multi-user onboarding
- Optional user-held encryption

## Related

- [Requirements](./Requirements.md)
- [Architecture](./Architecture.md)
- [API](./API.md)
- [CaptureClient](./CaptureClient.md)
