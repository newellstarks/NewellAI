# Vision

**Chapter 1** · [← Prev](./README.md) · [TOC](./README.md#table-of-contents) · [Next →](./Roadmap.md)

## Intent

NewellAI captures, stores, and organizes conversational **turns** between a user and AI systems in a structured, searchable format.

The initial focus is reliability, clarity, and ease of development—not scale.

**NewellAI is a platform, not a browser add-on.** Capture clients are adapters to a shared backend.

## Product direction

1. **Phase 1 — Foundation:** Build the core architecture: notebook, repo, contracts, Cloudflare Worker, D1 schema, authentication, and an end-to-end upload API. Result: a **working backend**.
2. **Phase 2 — Capture Client v1:** First client that feeds the backend — implemented as a **Chrome extension** because it is the fastest path to a working system. It is **just one client**, not the architecture.
3. **Phase 3 — Additional clients:** Safari, Firefox, Cursor, Claude Desktop, ChatGPT Desktop, macOS app, OpenAI API (if available), etc. — all use the same backend.
4. **Commercial path:** Extend to other users in a paid environment, typically with their own Cloudflare account.
5. **History ownership:** Complete turn-by-turn history per user; later export preload and optional user-held encryption.

## Guiding principle

> **Prototype narrowly. Architect broadly.**  
> **Build inside-out.**  
> **Increment without redesign.**

Each layer (contracts → ingest → auth → D1 → queue integration → Capture Client v1) extends the last. Prefer reliable incremental engineering over big rewrites.

## Development principles

- Clarity over cleverness
- Centralized logic; avoid scattered duplicates
- Structured documentation that AI tools can navigate
- Separate source, config, runtime outputs, and docs
- Engineering notebook remains the authoritative specification

## Related

- [Roadmap](./Roadmap.md)
- [Requirements](./Requirements.md)
- [Architecture](./Architecture.md)
- [CaptureClient](./CaptureClient.md)
