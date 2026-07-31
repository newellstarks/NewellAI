# Requirements

## Phase 1 goals

Proof of functionality for a single user:

- Capture AI conversation turns
- Store turns in a structured format
- Retrieve and inspect stored conversations
- Operate for one user initially (customer zero)
- Focus on desktop / browser usage first

## Functional requirements

| ID | Requirement |
|----|-------------|
| FR-1 | Capture turns from ChatGPT sessions in the browser |
| FR-2 | Persist turns to Cloudflare Worker + D1 |
| FR-3 | Periodically sync / save to local SQLite |
| FR-4 | Retrieve and inspect stored conversations by session / time |
| FR-5 | Support later preload from a user’s exported ChatGPT history |

## Non-functional requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | Config via environment / variables—no hard-coded secrets or user identity |
| NFR-2 | Modular separation of capture, storage, and retrieval |
| NFR-3 | Naming and schemas that do not assume a single permanent user |
| NFR-4 | Clear docs so humans and Cursor can reason about the system |
| NFR-5 | Prefer maintainability over premature optimization |

## Out of scope (Phase 1)

- Full multi-tenant commercial onboarding
- iPhone capture (planned after desktop/browser is reliable)
- Mandatory end-to-end encryption (optional later)
- Full platform coverage beyond ChatGPT capture path

## Related

- [Vision](./Vision.md)
- [Architecture](./Architecture.md)
- [ADRs](./ADRs/)
