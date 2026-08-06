# Vision

**Chapter 1 — Vision**

| | |
|---|---|
| **Status** | Stable |
| **Purpose** | Why NewellAI exists, platform framing, and guiding principles. |
| **Prerequisites** | [Chapter 0 — Engineering Notebook](./README.md) |
| **Related chapters** | [Roadmap](./Roadmap.md), [Requirements](./Requirements.md), [Architecture](./Architecture.md) |
| **Nav** | [← Prev](./README.md) · [TOC](./README.md#table-of-contents) · [Next →](./Roadmap.md) |

---

## Intent

NewellAI captures, stores, and organizes conversational **turns** between a user and AI systems in a structured, searchable format.

The initial focus is reliability, clarity, and ease of development—not scale.

**NewellAI is a platform, not a browser add-on.** Capture clients are adapters to a shared backend.

## Product direction

1. **Phase 1 — Foundation:** Build the core architecture: notebook, repo, contracts, Cloudflare Worker, D1 schema, authentication, and an end-to-end upload API. Result: a **working backend**.
2. **Phase 2 — Capture Client v1:** First client that feeds the backend — implemented as a **Chrome extension** because it is the fastest path to a working system. It is **just one client**, not the architecture.
3. **Phase 3 — Additional clients:** Safari, Firefox, Cursor, Claude Desktop, ChatGPT Desktop, macOS app, OpenAI API (if available), etc. — all use the same backend.
4. **Commercial path:** Extend to other users in a paid environment, typically with their own Cloudflare account.
5. **History ownership:** Complete turn-by-turn history per user; later export preload and optional user-held encryption.

## Guiding principle

> **Prototype narrowly. Architect broadly.**  
> **Build inside-out.**  
> **Increment without redesign.**

Each layer (contracts → ingest → auth → D1 → queue integration → Capture Client v1) extends the last. Prefer reliable incremental engineering over big rewrites.

## Development principles

- Clarity over cleverness
- Centralized logic; avoid scattered duplicates
- Structured documentation that AI tools can navigate
- Separate source, config, runtime outputs, and docs
- Engineering notebook remains the authoritative specification
- **Document fidelity:** visual presentation and formatting in Word/Excel are human-facing semantic data and preserved latent semantic information; edits change only what was requested ([Architecture](./Architecture.md), [ADR-0016](./ADRs/0016-document-and-workbook-fidelity.md) — Accepted)

## Device-Independent Personal Memory

**Future vision only.** This section describes a longer-term product direction. It does **not** expand current implementation scope—including Artifact v1 (images/Excel capture, object storage, sibling queue)—or change any Accepted ADR. Near-term work remains the Phase 1–3 stack in [Roadmap](./Roadmap.md) and [Artifacts](./Artifacts.md).

NewellAI may evolve into a trusted, source-backed personal memory system that helps people recover prior conversations, decisions, commitments, documents, and daily events when memory or context is incomplete.

This may be especially valuable for:

- people experiencing early cognitive decline or dementia symptoms
- spouses, families, and caregivers
- people recovering from stroke, brain injury, illness, or medication effects
- anyone managing complex medical, legal, financial, family, or work decisions
- people preserving memoir, legacy, and personal history

The system should help answer questions such as:

- What did I say earlier?
- What did we agree to?
- Did I already call the doctor?
- What changed from yesterday’s decision?
- Have I asked this question before?
- What did another person actually say?

The answer must remain source-backed. NewellAI should distinguish:

- the original recording or document
- the transcript or extracted content
- what each person said
- later corrections or contradictions
- AI summaries and inferences

The system should show the underlying source, time, speaker, and context whenever possible rather than presenting uncertain AI interpretation as fact.

> **Resolve uncertainty without humiliation.**

The system should reduce arguments caused by competing memories without shaming, overruling, or confronting the person whose memory may be uncertain. It should act as a neutral, gentle witness and make the original passage or recording available for review.

### Many Capture Devices, One Personal History

ChatGPT and the Chrome extension are the first capture adapters, not the final platform boundary.

Future sources may include:

- phones
- smartwatches
- wearable fobs or pendants
- glasses
- headphones and hearing aids
- home speakers
- automobiles
- meeting applications
- medical or accessibility devices
- room-based ambient systems

The durable product is not any one recording device. The durable product is the normalized, source-linked personal history created from many approved sources.

Each source should preserve provenance such as:

- source device
- capture time
- speaker identity when known
- original audio, image, document, or transcript
- confidence and capture quality
- corrections and user review
- consent and access restrictions

> **NewellAI is envisioned as a device-independent, source-backed personal memory platform, with ChatGPT conversation capture as its first working input channel.**

## Related

- [Roadmap](./Roadmap.md)
- [Requirements](./Requirements.md)
- [Architecture](./Architecture.md)
- [CaptureClient](./CaptureClient.md)
