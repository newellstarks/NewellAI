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
│   └── worker/        # Phase 1: Authenticated ingest, validation, D1 persistence
├── packages/
│   └── contracts/     # Shared turn / API types
├── migrations/        # D1 SQL
├── docs/              # Engineering notebook
├── package.json       # npm workspaces root
└── README.md
```

| Path | Role |
|------|------|
| `apps/extension` | **Capture Client v1** (Chrome extension) — capture + Durable Queue |
| `apps/worker` | Authenticated ingest API, validation, and D1 persistence |
| `packages/contracts` | Shared contracts |
| `migrations` | D1 migrations |
| `docs` | Engineering notebook |

## Engineering notebook

| Doc | Role |
|-----|------|
| [docs/Roadmap.md](./docs/Roadmap.md) | Phases 1–3 |
| [docs/Vision.md](./docs/Vision.md) | Product intent |
| [docs/Requirements.md](./docs/Requirements.md) | Phase requirements |
| [docs/Architecture.md](./docs/Architecture.md) | System shape |
| [docs/Database.md](./docs/Database.md) | D1 + SQLite |
| [docs/Contracts.md](./docs/Contracts.md) | Shared contracts |
| [docs/API.md](./docs/API.md) | Worker contracts (client-agnostic) |
| [docs/CaptureClient.md](./docs/CaptureClient.md) | Capture Client v1 (Chrome Extension) |
| [docs/TurnCapture.md](./docs/TurnCapture.md) | Turn capture pipeline |
| [docs/DurableQueue.md](./docs/DurableQueue.md) | Capture Client v1 durable queue |
| [docs/ADRs/](./docs/ADRs/) | Decision records |

## Workflow

```
Idea → Engineering Notebook → Implement exactly that → Test → Git Commit → Repeat
```

See [docs/README.md](./docs/README.md).
