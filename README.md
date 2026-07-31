# NewellAI

Local project home on Macintosh HD (`~/Documents/NewellAI`).

Design knowledge lives in the **engineering notebook** under [`docs/`](./docs/README.md)—not a single large design document.

## Layout

```
NewellAI/
├── docs/           # Engineering notebook (Vision, Requirements, Architecture, …)
├── extension/      # Chrome extension (capture)
├── worker/         # Cloudflare Worker (API)
├── database/       # Schema / migrations
└── README.md
```

## Engineering notebook

| Doc | Role |
|-----|------|
| [docs/Vision.md](./docs/Vision.md) | Product intent |
| [docs/Requirements.md](./docs/Requirements.md) | Phase requirements |
| [docs/Architecture.md](./docs/Architecture.md) | System shape |
| [docs/Database.md](./docs/Database.md) | D1 + SQLite |
| [docs/API.md](./docs/API.md) | Worker contracts |
| [docs/ChromeExtension.md](./docs/ChromeExtension.md) | Browser capture |
| [docs/TurnCapture.md](./docs/TurnCapture.md) | Turn capture pipeline |
| [docs/DurableQueue.md](./docs/DurableQueue.md) | Durable queue (notebook draft) |
| [docs/ADRs/](./docs/ADRs/) | Decision records |

Original design Word docs are archived in [`docs/source/`](./docs/source/).

## Status

Scaffold + notebook seeded from Project Direction / Introduction. Runtime assets under `~/Vault/NewellAI` remain separate until migrated.

**Workflow:** Idea → [engineering notebook](./docs/README.md) → implement exactly that → test → git commit → repeat. Never code first and document later.

