# Engineering Notebook

Keep design knowledge next to the code so Cursor can index and apply it while implementing features.

**The engineering notebook is the authoritative specification.**  
**Do not code first and document later.** Follow the development loop below.

When the repo scaffold changes: update the notebook to match paths and layout, but **do not change architectural intent** unless an ADR says so.


## Development loop

```
Idea
  ↓
Engineering Notebook (requirements, architecture, interfaces)
  ↓
Cursor implements exactly that subsystem
  ↓
Test
  ↓
Git Commit (one logical milestone)
  ↓
Repeat
```

Each pass through the loop is one focused slice: document the subsystem, implement only what the notebook specifies, verify it, then commit.

That keeps **architecture driving the code**, rather than the code driving the architecture.

### Example (Durable Queue)

Do **not** start with: “Cursor, write a queue.”

Instead, first update the notebook (Purpose, Requirements, Inputs/Outputs, Failure modes, Performance goals, Test cases, Open questions)—see [SubsystemTemplate.md](./SubsystemTemplate.md) and [DurableQueue.md](./DurableQueue.md).

Only then:

> Implement the Durable Queue exactly as specified in the engineering notebook (`docs/DurableQueue.md`).

## Index

| Document | Purpose |
|----------|---------|
| [Vision.md](./Vision.md) | Why NewellAI exists and where it is going |
| [Roadmap.md](./Roadmap.md) | Phase 1 Foundation → Phase 2 Capture Client v1 → Phase 3 clients |
| [Requirements.md](./Requirements.md) | Phase goals, functional and non-functional needs |
| [Architecture.md](./Architecture.md) | System shape, modules, and data flow |
| [Database.md](./Database.md) | D1, SQLite, schemas, and retention |
| [Contracts.md](./Contracts.md) | Wire protocol — shared contracts (all clients ↔ backend) |
| [API.md](./API.md) | Worker / HTTP contracts (client-agnostic) |
| [CaptureClient.md](./CaptureClient.md) | Capture Client v1 (Chrome Extension) |
| [ChromeExtension.md](./ChromeExtension.md) | Redirect → CaptureClient.md |
| [TurnCapture.md](./TurnCapture.md) | Turn definition, capture pipeline, payload |
| [DurableQueue.md](./DurableQueue.md) | Capture Client v1 durable queue |
| [SubsystemTemplate.md](./SubsystemTemplate.md) | Checklist before coding a subsystem |
| [ADRs/](./ADRs/) | Architecture Decision Records |
| [Diagrams/](./Diagrams/) | Visual references |
| [source/](./source/) | Archived original design documents |

## How to use

1. Prefer these focused docs over one large design file.
2. For a new idea or subsystem: fill [SubsystemTemplate.md](./SubsystemTemplate.md) in a new notebook page first (≈10–15 minutes).
3. Resolve open questions with an ADR when needed.
4. Ask Cursor to implement **exactly** what that notebook page describes—no silent scope expansion.
5. Test the result against the documented test cases.
6. Commit one logical milestone, then repeat for the next slice.
7. If tests reveal a design change, update the notebook before the next implementation pass.
8. When aligning docs to a new scaffold: match paths only—**architectural intent stays authoritative in the notebook**.
