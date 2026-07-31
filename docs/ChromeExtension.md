# Chrome Extension

## Role

Browser capture surface for ChatGPT conversations. Observes the page, extracts turn data, and posts to the Worker API.

## Phase 1 scope

- Desktop / browser ChatGPT capture for customer zero
- Reliable turn extraction over clever UI scraping
- Configuration for Worker base URL and auth via extension options / env-backed build config

## Out of scope (for now)

- iPhone / mobile Safari capture (after desktop reliability)
- Non-ChatGPT AI surfaces

## Responsibilities

1. Detect new turns in the conversation UI
2. Normalize to the shared turn schema
3. Send to `POST /v1/turns` (see [API.md](./API.md))
4. Surface clear status / errors to the operator

## Related

- [Requirements](./Requirements.md)
- [Architecture](./Architecture.md)
- [TurnCapture](./TurnCapture.md)
- [API](./API.md)
- Code: `extension/`
