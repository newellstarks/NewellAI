# Engineering Notebook

**Chapter 0** · Engineering notebook · [Reading order](#read-in-this-order)

**Authoritative specification** for NewellAI. Do not code first and document later.

When the repo scaffold changes: update the notebook to match paths, but **do not change architectural intent** unless an ADR says so.

## Read in this order

Stable filenames; **this list** is the reading order (no `01_` prefixes required). Each doc also carries a **Chapter N** heading so you always know where you are in the sequence.

| # | Chapter | Document | Purpose |
|---|---------|----------|---------|
| 0 | Chapter 0 | [README.md](./README.md) (this page) | How to use the notebook |
| 1 | Chapter 1 | [Vision.md](./Vision.md) | Why NewellAI exists |
| 2 | Chapter 2 | [Roadmap.md](./Roadmap.md) | Phases and inside-out build sequence |
| 3 | Chapter 3 | [Requirements.md](./Requirements.md) | What we must build |
| 4 | Chapter 4 | [Architecture.md](./Architecture.md) | System shape and ownership |
| 5 | Chapter 5 | [API.md](./API.md) | Worker ingest surface |
| 6 | Chapter 6 | [Contracts.md](./Contracts.md) | Wire protocol (all clients ↔ backend) |
| 7 | Chapter 7 | [Database.md](./Database.md) | D1 / SQLite |
| 8 | Chapter 8 | [CaptureClient.md](./CaptureClient.md) | Capture Client v1 (Chrome Extension) |
| 9 | Chapter 9 | [TurnCapture.md](./TurnCapture.md) | Turn domain |
| 10 | Chapter 10 | [DurableQueue.md](./DurableQueue.md) | Client durable queue |
| 11 | Chapter 11 | [SubsystemTemplate.md](./SubsystemTemplate.md) | Checklist before coding a subsystem |
| — | — | [ADRs/](./ADRs/) | Decision records (read when referenced) |

Also: [Diagrams/](./Diagrams/), [source/](./source/) (archives), [ChromeExtension.md](./ChromeExtension.md) (redirect → CaptureClient).

**Humans and Cursor:** start here, then follow the table top-to-bottom. To change order, edit **this table only**—do not rename files.

## Development loop

```
Idea → Engineering Notebook → Implement exactly that → Test → Git Commit → Repeat
```

Architecture drives code. Prefer prompts like:

> Implement the &lt;Subsystem&gt; exactly as specified in the engineering notebook (`docs/&lt;Page&gt;.md`).

## How to use

1. Open docs in the **Read in this order** sequence above.
2. For a new subsystem: fill [SubsystemTemplate.md](./SubsystemTemplate.md) first.
3. Resolve open questions with an ADR when needed.
4. Implement only what the notebook specifies.
5. Test, then one logical milestone commit.
6. If design changes after tests, update the notebook before the next implementation pass.
