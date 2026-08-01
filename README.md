# NewellAI

Automatic Turn Capture & Sync — local project on Macintosh HD (`~/Documents/NewellAI`).

Design knowledge lives in the **engineering notebook** under [`docs/`](./docs/README.md). The notebook is the **authoritative specification**. Update it to match the scaffold when paths change, but **do not change architectural intent** without an ADR. **Architecture drives code** — never code first and document later.

## Package manager

**npm workspaces only.** Do not introduce pnpm ([ADR-0003](./docs/ADRs/0003-npm-workspaces-only.md)).

```bash
npm install
```

## Layout

```
NewellAI/
├── apps/
│   ├── extension/     # Phase 2: Capture Client v1 (Chrome extension)
│   └── worker/        # Phase 1: authenticated ingest + D1 persistence
├── packages/
│   └── contracts/     # Wire protocol (all clients ↔ backend)
├── migrations/        # D1 SQL
├── docs/              # Engineering notebook
├── package.json       # npm workspaces root
└── README.md
```

| Path | Role |
|------|------|
| `apps/extension` | **Capture Client v1** (Chrome extension) — capture + Durable Queue |
| `apps/worker` | Authenticated ingest, validation, and D1 persistence |
| `packages/contracts` | Shared contracts |
| `migrations` | D1 migrations |
| `docs` | Engineering notebook |

## Table of Contents — Engineering notebook

Authoritative reading order (same as [`docs/README.md`](./docs/README.md#table-of-contents)). Each chapter page includes purpose, prerequisites, related chapters, and status.

| Chapter | Title | Status | Document |
|---------|-------|--------|----------|
| Chapter 0 | Engineering Notebook | Stable | [docs/README.md](./docs/README.md) |
| Chapter 1 | Vision | Stable | [docs/Vision.md](./docs/Vision.md) |
| Chapter 2 | Roadmap | Active | [docs/Roadmap.md](./docs/Roadmap.md) |
| Chapter 3 | Requirements | Active | [docs/Requirements.md](./docs/Requirements.md) |
| Chapter 4 | Architecture | Active | [docs/Architecture.md](./docs/Architecture.md) |
| Chapter 5 | Shared Contracts (Wire Protocol) | Stable | [docs/Contracts.md](./docs/Contracts.md) |
| Chapter 6 | API | Active | [docs/API.md](./docs/API.md) |
| Chapter 7 | Authentication | Active | [docs/Authentication.md](./docs/Authentication.md) |
| Chapter 8 | Database | Active | [docs/Database.md](./docs/Database.md) |
| Chapter 9 | Capture Client v1 (Chrome Extension) | Draft | [docs/CaptureClient.md](./docs/CaptureClient.md) |
| Chapter 10 | Turn Capture | Active | [docs/TurnCapture.md](./docs/TurnCapture.md) |
| Chapter 11 | Durable Queue | Draft | [docs/DurableQueue.md](./docs/DurableQueue.md) |
| Chapter 12 | Subsystem Template | Stable | [docs/SubsystemTemplate.md](./docs/SubsystemTemplate.md) |
| Chapter 13 | Architecture Governance | Stable | [docs/ArchitectureGovernance.md](./docs/ArchitectureGovernance.md) |
| — | Architecture Decision Records | Active | [docs/ADRs/](./docs/ADRs/) |

**Status:** Draft · Active · Stable — see [docs/README.md](./docs/README.md#table-of-contents).

When the TOC changes, update **both** this file and `docs/README.md`, plus each page’s chapter header block.

## Workflow

```
Idea → Engineering Notebook → Implement exactly that → Test → Git Commit → Repeat
```

See [docs/README.md](./docs/README.md). Build **inside-out** ([Roadmap](./docs/Roadmap.md)): contracts → ingest ✅ → auth ✅ → D1 ✅ → durable queue integration → **then** Capture Client v1. Increment without redesign.
