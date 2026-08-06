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

## Possible Pricing Strategy

**Early commercial hypothesis only.** This section sketches a possible go-to-market path. It is **not** a finalized pricing commitment, not a public offer, and does **not** expand current engineering scope (including Artifact v1 or near-term Roadmap milestones).

NewellAI may initially be sold through an installation-led annual license model rather than as a low-cost, self-service consumer subscription.

### Installation-led model

The first-year package would be prepaid and could include:

- professional installation
- configuration
- twelve months of licensed use
- onboarding and training
- local storage and backup setup
- support and maintenance
- compatibility updates
- continuous standard product upgrades released during the license term
- an initial system-health and capture-verification review

The installation is part of the product value, not a free add-on. Early customers may need assistance configuring capture, organizing prior material, verifying backups, and learning how to retrieve source-backed information.

### Why installations may produce the earliest revenue

New installations may be the most direct source of early cash because they:

- provide a concrete deliverable customers can understand
- combine software with valuable professional service
- do not require fully automated self-service onboarding
- expose customer needs quickly
- permit higher pricing than a generic consumer subscription
- naturally lead to annual renewals, additional devices, training, imports, customization, and managed support

The early objective is not necessarily to maximize subscriber count. It is to install a dependable system for a manageable number of customers who derive substantial value from preserving and retrieving their AI work.

### Illustrative economics

The figures below are **provisional illustrations only**, not quotes or commitments.

- A first-year installation and license package might fall in the range of $4,000 to $7,500, depending on configuration, training, support, imports, and customization.
- Annual renewal might include continued licensed use, support, maintenance, and continuous standard upgrades.
- Additional revenue may come from extra computers, historical imports, Word/Excel library setup, project organization, backup and recovery, additional training, migration, or premium managed services.

At an illustrative $5,000 first-year package:

- one new installation per month produces $5,000 in monthly cash receipts
- two new installations per month produces $10,000
- three new installations per month produces $15,000

Over time, annual renewals and add-on services may reduce the number of new installations required to reach a monthly income target.

### Product-development implication

The first salable version does not need to be self-installed by an unknown consumer.

It needs to be reliable enough that Newell can:

- install it
- configure it
- validate capture
- train the customer
- support it
- preserve and retrieve the customer’s information dependably

Self-service onboarding, smartphone expansion, wearables, and mass-market consumer distribution can remain future phases until installation revenue proves demand.

> **Build the smallest dependable system that can be professionally installed, trained, supported, and sold.**

## Related

- [Roadmap](./Roadmap.md)
- [Requirements](./Requirements.md)
- [Architecture](./Architecture.md)
- [CaptureClient](./CaptureClient.md)
