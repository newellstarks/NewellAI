# Engineering Notebook

**Chapter 0** · Engineering notebook · [Table of Contents](#table-of-contents)

**Authoritative specification** for NewellAI. Do not code first and document later.

When the repo scaffold changes: update the notebook to match paths, but **do not change architectural intent** unless an ADR says so.

## Table of Contents

This is the **reading order** for humans and Cursor. Stable filenames (no `01_` prefixes). Each chapter page also starts with a **Chapter N** heading.

| Chapter | Title | Document |
|---------|-------|----------|
| [Chapter 0](#table-of-contents) | Engineering Notebook (this page) | [README.md](./README.md) |
| Chapter 1 | Vision | [Vision.md](./Vision.md) |
| Chapter 2 | Roadmap | [Roadmap.md](./Roadmap.md) |
| Chapter 3 | Requirements | [Requirements.md](./Requirements.md) |
| Chapter 4 | Architecture | [Architecture.md](./Architecture.md) |
| Chapter 5 | API | [API.md](./API.md) |
| Chapter 6 | Shared Contracts (Wire Protocol) | [Contracts.md](./Contracts.md) |
| Chapter 7 | Database | [Database.md](./Database.md) |
| Chapter 8 | Capture Client v1 (Chrome Extension) | [CaptureClient.md](./CaptureClient.md) |
| Chapter 9 | Turn Capture | [TurnCapture.md](./TurnCapture.md) |
| Chapter 10 | Durable Queue | [DurableQueue.md](./DurableQueue.md) |
| Chapter 11 | Subsystem Template | [SubsystemTemplate.md](./SubsystemTemplate.md) |
| — | Architecture Decision Records | [ADRs/](./ADRs/) |

**Also:** [Diagrams/](./Diagrams/) · [source/](./source/) (archives) · [ChromeExtension.md](./ChromeExtension.md) (redirect → Capture Client)

**Start here, then follow the TOC top-to-bottom.**

## Maintaining chapters (expected over time)

Chapter numbers are **navigation labels**, not permanent identity. Over time we will **add**, **delete**, or **reorder** chapters. That is normal.

| Change | What to do |
|--------|------------|
| **Add** | Create `SomeTopic.md` with a stable name → insert a row in the TOC → set its **Chapter N** line → renumber later chapters if needed |
| **Delete** | Remove or move the file to `source/` if archival → delete its TOC row → renumber remaining **Chapter** lines so the sequence is contiguous |
| **Reorder** | Move TOC rows → update each affected file’s **Chapter N** line to match → leave filenames unchanged |

Keep this **Table of Contents** and the in-file **Chapter N** lines in sync. Mirror the same TOC in the repo root [`README.md`](../README.md). Prefer one small commit when the reading order changes (“Renumber notebook chapters after …”).

## Development loop

```
Idea → Engineering Notebook → Implement exactly that → Test → Git Commit → Repeat
```

Architecture drives code. Prefer prompts like:

> Implement the &lt;Subsystem&gt; exactly as specified in the engineering notebook (`docs/&lt;Page&gt;.md`).

## How to use

1. Use the **Table of Contents** above as the reading sequence.
2. For a new subsystem: fill [SubsystemTemplate.md](./SubsystemTemplate.md) first.
3. Resolve open questions with an ADR when needed.
4. Implement only what the notebook specifies.
5. Test, then one logical milestone commit.
6. If design changes after tests, update the notebook before the next implementation pass.
