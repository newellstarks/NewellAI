# ADR-0001: Prototype narrowly, architect broadly

## Status

Accepted

## Context

NewellAI needs a working Phase 1 for a single operator, but the long-term path is commercial multi-user. Overbuilding Phase 1 slows proof of functionality; hard-coding single-user assumptions blocks later growth.

## Decision

- Build **inside-out**: smallest reliable foundation first (contracts → Worker ingest → auth → D1), then Capture Client v1; optional local SQLite mirror later
- Keep modules, config, and schemas multi-user capable from day one
- Document decisions in this engineering notebook and ADRs rather than one monolithic design file

## Consequences

- Faster path to a working demo for customer zero
- Slightly more upfront structure (env config, user-aware schema) than a throwaway script
- Cursor and humans can navigate focused docs when implementing or reviewing features
