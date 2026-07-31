# Engineering Notebook

Keep design knowledge next to the code so Cursor can index and apply it while implementing features.

**Do not code first and document later.** Follow the development loop below.

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
| [Requirements.md](./Requirements.md) | Phase goals, functional and non-functional needs |
| [Architecture.md](./Architecture.md) | System shape, modules, and data flow |
| [Database.md](./Database.md) | D1, SQLite, schemas, and retention |
| [API.md](./API.md) | Worker / HTTP contracts |
| [ChromeExtension.md](./ChromeExtension.md) | Browser capture surface |
| [TurnCapture.md](./TurnCapture.md) | Turn definition, capture pipeline, payload |
| [DurableQueue.md](./DurableQueue.md) | Extension durable queue (buffer, order, sync) |
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
