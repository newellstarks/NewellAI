# Engineering Notebook

**Chapter 0 — Engineering Notebook**

| | |
|---|---|
| **Status** | Stable |
| **Purpose** | Authoritative index and operating manual for the NewellAI engineering notebook. |
| **Prerequisites** | None — start here. |
| **Related chapters** | All chapters below; [ADRs](./ADRs/) |
| **Nav** | [TOC](#table-of-contents) · [Next →](./Vision.md) |

---

This folder is the **authoritative specification** for NewellAI—the source of truth for humans and Cursor.

Do not code first and document later. **Architecture drives code.**

When the repo layout changes: update paths here, but **do not change architectural intent** unless an ADR says so.

## What this notebook is

| It is | It is not |
|-------|-----------|
| The contract for what we build | A dump of chat transcripts |
| A navigable engineering manual | Filename-numbered chaos (`01_…`) |
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

**Recommended reading order.** Stable filenames. Each document opens with chapter number/title, purpose, prerequisites, related chapters, status, and Prev/TOC/Next.

| Chapter | Title | Status | Document |
|---------|-------|--------|----------|
| 0 | Engineering Notebook | Stable | [README.md](./README.md) |
| 1 | Vision | Stable | [Vision.md](./Vision.md) |
| 2 | Roadmap | Active | [Roadmap.md](./Roadmap.md) |
| 3 | Requirements | Active | [Requirements.md](./Requirements.md) |
| 4 | Architecture | Active | [Architecture.md](./Architecture.md) |
| 5 | Shared Contracts (Wire Protocol) | Stable | [Contracts.md](./Contracts.md) |
| 6 | API | Active | [API.md](./API.md) |
| 7 | Authentication | Active | [Authentication.md](./Authentication.md) |
| 8 | Database | Active | [Database.md](./Database.md) |
| 9 | Capture Client v1 (Chrome Extension) | Draft | [CaptureClient.md](./CaptureClient.md) |
| 10 | Turn Capture | Active | [TurnCapture.md](./TurnCapture.md) |
| 11 | Durable Queue | Draft | [DurableQueue.md](./DurableQueue.md) |
| 12 | Subsystem Template | Stable | [SubsystemTemplate.md](./SubsystemTemplate.md) |
| 13 | Architecture Governance | Stable | [ArchitectureGovernance.md](./ArchitectureGovernance.md) |
| — | Architecture Decision Records | Active | [ADRs/](./ADRs/) |

**Status key:** **Draft** = direction not implemented · **Active** = in use, still evolving · **Stable** = rely on it; change deliberately (often via ADR)

**Appendices:** [Diagrams/](./Diagrams/) · [source/](./source/) (archives) · [ChromeExtension.md](./ChromeExtension.md) (→ Capture Client)

Mirror this TOC in the repo root [`README.md`](../README.md).

## Where we are (snapshot)

See [Roadmap](./Roadmap.md) for the live checklist. In short:

```
✅ Contracts (wire protocol)
✅ Worker ingest (accept → validate → respond)
✅ Authentication (shared bearer — see Authentication.md)
✅ D1 persistence (conversations + turns — see Database.md)
✅ Read API — GET /v1/conversations, GET /v1/conversations/:id/turns (see API.md)
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
| **Add** | Stable filename → TOC row here + root README → chapter header block (title, status, purpose, prerequisites, related, nav) → renumber if needed |
| **Delete** | Archive to `source/` if valuable → drop TOC rows → renumber remaining chapters |
| **Reorder** | Move TOC rows (both READMEs) → fix chapter header blocks on affected pages → do not rename files for order |

Prefer one small commit: `Renumber notebook chapters after …`.

## How to use

1. Read the **Table of Contents** top-to-bottom (or jump via chapter links).
2. Check each page’s **Prerequisites** and **Status** before deep reading or implementing.
3. New subsystem → [SubsystemTemplate.md](./SubsystemTemplate.md) first.
4. Non-obvious choices → [ADRs/](./ADRs/).
5. Implement only what the notebook specifies; test; commit one milestone.
6. If tests change the design, update the notebook before more code.
