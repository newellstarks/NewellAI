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
2. When implementing a feature, open the matching doc (e.g. `Database.md` for schema work).
3. Record non-obvious decisions as ADRs before or with the change.
4. Update the relevant notebook page when behavior or contracts change.
