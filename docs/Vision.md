# Vision

## Intent

NewellAI captures, stores, and organizes conversational **turns** between a user and AI systems in a structured, searchable format.

The initial focus is reliability, clarity, and ease of development—not scale.

## Product direction

1. **Phase 1 (customer zero):** Record real-time ChatGPT turns for a single operator across desktop and browser (iPhone later).
2. **Commercial path:** Once reliable, extend to other users in a paid environment, typically with their own Cloudflare account for speed and durability.
3. **History ownership:** Retain a complete turn-by-turn history per user. Later options include preload from export and optional user-held encryption so erased history has no recoverable copy.

## Guiding principle

> **Prototype narrowly. Architect broadly.**

Ship a minimal working system while keeping the design flexible enough for multi-user commercialization.

## Development principles

- Clarity over cleverness
- Centralized logic; avoid scattered duplicates
- Structured documentation that AI tools can navigate
- Separate source, config, runtime outputs, and docs

## Related

- [Requirements](./Requirements.md)
- [Architecture](./Architecture.md)
