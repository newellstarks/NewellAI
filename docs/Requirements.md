# Requirements

**Chapter 3** · Engineering notebook · [Table of Contents](./README.md#table-of-contents)

Phases are defined in [Roadmap.md](./Roadmap.md). **Do not optimize capture before the foundation exists.**

## Phase 1 — Foundation (current)

Prove a working backend for customer zero (and future clients):

- Shared contracts for turn / ingest shapes
- Cloudflare Worker with authenticated upload API
- Validation of ingest payloads
- D1 persistence (schema + migrations)
- Manual end-to-end upload test is enough to exit Phase 1

### Functional requirements (Phase 1)

| ID | Requirement |
|----|-------------|
| FR-F1 | Define shared contracts used by Worker and future clients |
| FR-F2 | Authenticated `POST` ingest of turns to the Worker |
| FR-F3 | Validate payloads before D1 writes |
| FR-F4 | Persist turns in D1 with multi-user-ready schema |
| FR-F5 | Idempotent ingest on `client_turn_id` (clients will retry) |
| FR-F6 | Retrieve/inspect stored turns (minimal API or query path) |

### Non-functional requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | Config via environment / bindings—no hard-coded secrets or user identity |
| NFR-2 | Modular separation of client capture, ingest API, and storage |
| NFR-3 | Naming and schemas that do not assume a single permanent user |
| NFR-4 | Clear docs so humans and Cursor can reason about the system |
| NFR-5 | Prefer maintainability over premature optimization of capture |

### Out of scope (Phase 1)

- Implementing Capture Client v1 (Chrome extension) capture logic
- Extension Durable Queue behavior
- DOM observation / ChatGPT UI scraping
- iPhone or multi-browser capture
- Full multi-tenant commercial onboarding
- Mandatory end-to-end encryption

## Phase 2 — Capture Client v1

Once the backend works, add **Capture Client v1 (Chrome Extension)**:

| ID | Requirement |
|----|-------------|
| FR-C1 | Capture turns from ChatGPT in the browser |
| FR-C2 | Local durable queue + sync to the Phase 1 upload API |
| FR-C3 | Surface sync errors to the operator |

This client is an **adapter**—not the architecture. See [CaptureClient.md](./CaptureClient.md).

## Phase 3 — Additional clients

Additional adapters (Safari, Firefox, Cursor, Claude Desktop, ChatGPT Desktop, macOS app, OpenAI API if available, …) must:

| ID | Requirement |
|----|-------------|
| FR-P3-1 | Use the same contracts and authenticated upload API |
| FR-P3-2 | Not require a forked Worker or per-client D1 schema |
| FR-P3-3 | Document client-specific behavior in the notebook / ADR when it diverges from v1 |

## Related

- [Roadmap](./Roadmap.md)
- [Vision](./Vision.md)
- [Architecture](./Architecture.md)
- [CaptureClient](./CaptureClient.md)
- [ADRs](./ADRs/)
