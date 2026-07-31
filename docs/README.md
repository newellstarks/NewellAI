# Engineering Notebook

**Chapter 0** · [TOC](#table-of-contents) · [Next →](./Vision.md)

This folder is the **authoritative specification** for NewellAI—the source of truth for humans and Cursor for years of work.

Do not code first and document later. **Architecture drives code.**

When the repo layout changes: update paths here, but **do not change architectural intent** unless an ADR says so.

## What this notebook is

| It is | It is not |
|-------|-----------|
| The contract for what we build | A dump of chat transcripts |
| Reading order + chaptered specs | Filename-numbered chaos (`01_…`) |
| Living docs we revise as we learn | Frozen bureaucracy |
| The place Cursor must follow | Optional commentary after the fact |

## Principles (non-negotiable)

1. **Prototype narrowly. Architect broadly.**
2. **Build inside-out** — wire protocol and backend before Capture Client v1.
3. **Increment without redesign** — each layer extends the last.
4. **Platform, not a browser add-on** — the Chrome extension is Capture Client v1, one adapter.
5. **One wire protocol** — every client speaks [`Contracts.md`](./Contracts.md).
6. **One logical milestone per commit.**

## Table of Contents

**Reading order** for humans and Cursor. Stable filenames. Each page opens with **Chapter N** and Prev / TOC / Next links.

| Chapter | Title | Document |
|---------|-------|----------|
| 0 | Engineering Notebook (this page) | [README.md](./README.md) |
| 1 | Vision | [Vision.md](./Vision.md) |
| 2 | Roadmap | [Roadmap.md](./Roadmap.md) |
| 3 | Requirements | [Requirements.md](./Requirements.md) |
| 4 | Architecture | [Architecture.md](./Architecture.md) |
| 5 | Shared Contracts (Wire Protocol) | [Contracts.md](./Contracts.md) |
| 6 | API | [API.md](./API.md) |
| 7 | Database | [Database.md](./Database.md) |
| 8 | Capture Client v1 (Chrome Extension) | [CaptureClient.md](./CaptureClient.md) |
| 9 | Turn Capture | [TurnCapture.md](./TurnCapture.md) |
| 10 | Durable Queue | [DurableQueue.md](./DurableQueue.md) |
| 11 | Subsystem Template | [SubsystemTemplate.md](./SubsystemTemplate.md) |
| — | Architecture Decision Records | [ADRs/](./ADRs/) |

**Appendices:** [Diagrams/](./Diagrams/) · [source/](./source/) (archives) · [ChromeExtension.md](./ChromeExtension.md) (→ Capture Client)

Mirror this TOC in the repo root [`README.md`](../README.md).

## Where we are (snapshot)

See [Roadmap](./Roadmap.md) for the live checklist. In short:

```
✅ Contracts (wire protocol)
✅ Worker ingest (accept → validate → respond; no DB yet)
→  Authentication
→  D1 persistence
→  Durable queue integration
→  Capture Client v1
```

## Development loop

```
Idea → Notebook (this folder) → Implement exactly that → Test → Git commit → Repeat
```

Prompt shape:

> Implement &lt;Subsystem&gt; exactly as specified in the engineering notebook (`docs/&lt;Page&gt;.md`).

## Maintaining chapters

Chapter numbers are **navigation**, not permanent identity. **Add**, **delete**, or **reorder** over time—that is expected.

| Change | Do this |
|--------|---------|
| **Add** | Stable filename → TOC row here + root README → **Chapter N** + Prev/Next on the page → renumber if needed |
| **Delete** | Archive to `source/` if valuable → drop TOC rows → renumber remaining chapters |
| **Reorder** | Move TOC rows (both READMEs) → fix **Chapter N** and Prev/Next on affected pages → do not rename files for order |

Prefer one small commit: `Renumber notebook chapters after …`.

## How to use

1. Read the TOC top-to-bottom (or jump via chapter links).
2. New subsystem → [SubsystemTemplate.md](./SubsystemTemplate.md) first.
3. Non-obvious choices → [ADRs/](./ADRs/).
4. Implement only what the notebook specifies; test; commit one milestone.
5. If tests change the design, update the notebook before more code.
