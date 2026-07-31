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
| [ADRs/](./ADRs/) | Architecture Decision Records |
| [Diagrams/](./Diagrams/) | Visual references |
| [source/](./source/) | Archived original design documents |

## How to use

1. Prefer these focused docs over one large design file.
2. For a new idea or subsystem: write requirements, architecture, and interfaces in the notebook first.
3. Ask Cursor to implement **exactly** what that notebook page (and related ADRs) describe—no silent scope expansion.
4. Test the result.
5. Commit one logical milestone, then repeat for the next slice.
6. When behavior changes after learning from tests, update the notebook before the next implementation pass.
