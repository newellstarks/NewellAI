# Engineering Notebook

Keep design knowledge next to the code so Cursor can index and apply it while implementing features.

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
2. **Before Cursor writes a new subsystem**, update the matching notebook page (and ADR if needed), then implement.
3. When implementing a feature, open the matching doc (e.g. `Database.md` for schema work).
4. Record non-obvious decisions as ADRs before or with the change.
5. Update the relevant notebook page when behavior or contracts change.
6. Keep **one logical milestone per git commit** (docs milestone, then code milestone).

## Notebook-first workflow

```
Idea / subsystem
  → update docs/ (and ADR if needed)
  → commit docs milestone
  → implement extension/ | worker/ | database/
  → commit implementation milestone
```

