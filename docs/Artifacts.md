# Conversation Artifacts

**Chapter 14 — Conversation Artifacts**

| | |
|---|---|
| **Status** | Draft — **direction accepted**; ADRs **0007–0010 Accepted** (Artifact v1 may proceed when implementation slice is specified) |
| **Purpose** | Accepted architecture for first-class capture of conversation binaries (images, Excel) linked to conversations and turns. Ordinary artifact preservation only — structured import is [Chapter 15](./StructuredSources.md). |
| **Prerequisites** | [Chapter 4 — Architecture](./Architecture.md), [Chapter 5 — Shared Contracts](./Contracts.md), [Chapter 8 — Database](./Database.md), [Chapter 9 — Capture Client](./CaptureClient.md), [Chapter 10 — Turn Capture](./TurnCapture.md) |
| **Related chapters** | [StructuredSources](./StructuredSources.md), [API](./API.md), [Authentication](./Authentication.md), [DurableQueue](./DurableQueue.md), [Roadmap](./Roadmap.md), [ADRs](./ADRs/) |
| **Nav** | [← Prev](./ArchitectureGovernance.md) · [TOC](./README.md#table-of-contents) · [Next →](./StructuredSources.md) |

---

## Purpose

Turns alone are incomplete for recall. Operators also need the **files and images** that were uploaded to or produced inside a ChatGPT conversation—especially Excel workbooks and images—without stuffing binaries into D1 or the `turns` table.

Artifacts are **first-class records**: metadata in the authoritative relational store (D1), binary bytes in **object storage**, always linked to the exact `conversation_id` and turn identity.

### Not every Excel is only an attachment

Some workbooks are **database-bearing** (notably the Digital Newell Framework). Those remain preserved as artifacts **and** participate in structured import into a canonical application database. See the three-layer model in [StructuredSources.md](./StructuredSources.md).

| Layer | This chapter | Chapter 15 |
|-------|--------------|------------|
| Ordinary artifact | **In scope** | — |
| Structured source file | Capture + version bytes only | Registration, import, provenance |
| Canonical application database | Out of scope | Normalized operational records |

Artifact v1 stores Framework Excel revisions as versioned files; it does **not** import rows.

## Bounded next milestone (proposal)

After operator config persistence (Slice 2.1), the next capture-facing milestone should be a **thin Artifact v1** that proves:

1. Project-chat URL / identity support (so Project conversations are in scope for capture)
2. Discovery of images and Excel attachments in ordinary and Project ChatGPT chats
3. Metadata persistence + binary persistence (local object store first)
4. Idempotent re-observation
5. Excel version lineage (no overwrite)
6. Manual acceptance: one uploaded image, one generated image, one uploaded Excel, one generated/revised Excel

Later: PDFs, slides, richer search, deployed R2.

**Do not implement until an implementation slice is specified against Accepted ADRs 0007–0010.** Open questions for Artifact v1 direction are resolved.

## Requirements

| ID | Requirement |
|----|-------------|
| FR-A1 | Capture user-uploaded images linked to the originating user turn |
| FR-A2 | Capture assistant-generated images linked to the originating assistant turn |
| FR-A3 | Capture user-uploaded Excel (`.xlsx` / `.xls` as available) linked to the user turn |
| FR-A4 | Capture assistant-generated or revised Excel as a **new** artifact version (lineage), not an overwrite |
| FR-A5 | Persist artifact **metadata** in D1; persist **bytes** only in object storage |
| FR-A6 | Idempotent capture: reload / rescan must not duplicate the same logical artifact |
| FR-A7 | Record capture status so metadata-only (download failed) is distinguishable from fully stored |
| FR-A8 | Extend conversation identity to Project ChatGPT URLs (`/g/…/c/…`) as well as `/c/…` |
| FR-A9 | Authenticated read/list of artifact metadata; binary download only through authorized paths |
| FR-A10 | Sibling durable artifact queue (not the turn queue) for binary-transfer state |
| FR-A11 | Allow metadata with `conversation_id` + `client_turn_id`; `turn_id` nullable until resolved; explicit unresolved/orphan state |
| FR-A12 | V1 MIME/type allowlist and configurable max size (25 MB default); reject macros, archives, executables, password-protected workbooks |
| FR-A13 | Explicit two-phase artifact ingest (metadata → bytes → finalize); checksum conflict is hard fail | ADRs 0008–0009 |
| FR-A14 | Orphan only via reconciliation watermark or explicit pass; orphan re-linkable | ADR-0008 |
| FR-A15 | Parallel turn/artifact pipelines with ≤1 in-flight each; frozen ChatGPT page origins | ADR-0009 |

### Non-requirements (Artifact v1)

- Storing binary blobs in D1 or in `turns.text`
- Full-text OCR / spreadsheet cell indexing
- Importing workbook rows into a canonical database (see [StructuredSources.md](./StructuredSources.md))
- Treating the Digital Newell Framework as something other than a captured Excel until Structured Source registration exists
- Putting binary-transfer / download state into the existing turn Durable Queue
- Public or unauthenticated object URLs
- Multipart ingest redesign of `POST /v1/turns` (prefer a dedicated artifact ingest path)
- Safari / non-ChatGPT surfaces
- Macro-enabled Excel, arbitrary archives, executables, password-protected workbooks, unrestricted document types
- Arbitrary page-provided URL or unrestricted CDN fetches
- Automatic capture of every canvas/tool card as an artifact (out of v1 unless it is clearly an allowlisted image or `.xlsx` tied to an accepted turn)

## High-level data flow

```
ChatGPT DOM (approved origins; artifact tied to accepted captured turn)
  → Capture Client adapter (discover + classify + host/source-validated download)
  → sibling Artifact Queue (durable + idempotent; separate from turn queue)
  → Worker: metadata → D1; bytes → object storage
  → Read API: list/get metadata; authorized byte fetch
```

```
ArtifactMetadata (D1)
  ↔ conversation_id + client_turn_id (+ turn_id when resolved)
  ↔ storage_location → ObjectStore (local path | R2 key)
```

## Resolved decisions (owner, 2026-08-05)

### 1. Sibling artifact queue

Use a **sibling Artifact Queue** in the Capture Client, based on the same durability and idempotency principles as the turn Durable Queue ([ADR-0006](./ADRs/0006-capture-client-durable-queue-identity-and-synchronization.md)).

**Do not** put binary-transfer state (download progress, byte put retries, checksum pending) into the existing turn queue.

Exact IndexedDB schema / worker sync loop shape lands in **ADR-0009**.

### 2. Turn linkage and unresolved → orphan

Artifact metadata may arrive with `conversation_id` + `client_turn_id` before server `turn_id` exists (`turn_id` nullable).

`linkage_status`: `unresolved` | `resolved` | `orphan`. Never drop for missing `turn_id`.

Combined orphan rule (**all** required) — [ADR-0008](./ADRs/0008-artifact-identity-lineage-and-turn-linkage.md):

1. Conversation turn queue drained  
2. Latest successful turn sync recorded **max sequence watermark**  
3. No pending local turn for that conversation  
4. Explicit reconciliation pass confirms `client_turn_id` absent  

Track: `conversation_id`, `turn_sequence_watermark`, `turn_sync_generation`, `reconciled_at`, `reconciliation_result`.  
Forbidden: elapsed time alone, queue-empty alone, sequence alone.  
Orphan is reversible if the turn later arrives.

### 3. Two-phase ingest and checksum

**Only** Artifact v1 ingest path:

1. `POST /v1/artifacts` — accept or idempotently return metadata  
2. `PUT /v1/artifacts/:artifact_id/content` — upload bytes  
3. Worker recomputes SHA-256, stores via adapter, finalizes only after storage confirmation  

No upload sessions. Multipart convenience **deferred beyond v1**.

When bytes are already available, Phase 1 includes `declared_sha256`, `declared_byte_size`, `mime_type`; Phase 2 verifies. Metadata-before-bytes allowed with nullable checksum and `metadata_discovered` — cannot finalize until bytes confirmed.

Same `client_artifact_id` + same checksum ⇒ duplicate. Different checksum ⇒ hard conflict (Options conflict/dead-letter; dismiss only; no replace-identity). Revisions ⇒ new `client_artifact_id` + `parent_artifact_id`.

### 4. Initial MIME and size scope (v1)

| Allowed | Notes |
|---------|--------|
| `image/png` | |
| `image/jpeg` | |
| `image/webp` | |
| `.xlsx` | Spreadsheet MIME as detected for Office Open XML workbook |

**Configurable** maximum: **25 MB** per artifact (initial default).

**Not in first slice:** macro-enabled Excel (e.g. `.xlsm`), arbitrary archives, executables, password-protected workbooks, unrestricted document types (PDF/doc/pptx wait for a later allowlist expansion).

### 5. Concurrency

Turn pipeline: ≤1 in-flight batch. Artifact pipeline: ≤1 in-flight transfer. Pipelines may run **in parallel**; neither globally blocks the other. Byte upload requires metadata acceptance, not full turn sync drain ([ADR-0009](./ADRs/0009-artifact-delivery-retry-and-recovery-pipeline.md)).

### 6. Download authorization and host allowlists

**Frozen page origins:** `https://chatgpt.com`, `https://chat.openai.com`.

Artifact **download hosts**: exact allowlist at implement-time after live DOM/network inspection. No wildcard fetches. Source URL must be tied to an accepted ChatGPT artifact element. Allowlist edits are documented config changes (new ADR only if trust model changes).

User gesture not required when association + validation succeed. Capture Off ⇒ no download.

Detail: **ADR-0009** (capture/delivery), **ADR-0010** (proxied read access).

## 1. Project-chat URL and identity

### Problem

Slice 2 only extracts `conversation_id` from `/c/<id>`. Project chats use paths such as:

`https://chatgpt.com/g/g-p-…/c/<conversation_id>`

Those were correctly treated as out of Slice 2 scope; Artifact v1 must support them for ordinary + Project capture.

### Proposal

| Rule | Behavior |
|------|----------|
| Conversation id | Prefer the `/c/<id>` segment wherever it appears in the path (Project or not) |
| Project id | Optionally capture `project_id` from `/g/g-p-…/` as **conversation metadata** (not part of turn identity) |
| Identity stability | Same `/c/<id>` ⇒ same `conversation_id` whether opened from Project or standalone URL |
| Rescan | URL change that preserves `/c/<id>` must not reset turn identity; switching to a different `/c/<id>` resets page-session maps as today |

Update Capture Client conversation extraction accordingly in the Artifact v1 implementation slice (after approval).

## 2. Artifact discovery (ChatGPT)

Discovery stays inside the ChatGPT capture adapter (selectors isolated), for **visible** conversation content only (same append-only / visible-branch policy as turns).

| Kind | Discovery sketch (implement-time live verification) |
|------|-----------------------------------------------------|
| User-uploaded image | Attachment / media nodes associated with a completed user turn |
| Assistant-generated image | Image result nodes associated with a completed assistant turn |
| User-uploaded Excel | File attachment chips / download links with spreadsheet MIME or extension |
| Assistant Excel | Download / file cards on assistant turns; treat new file identity as new version |

**v1 artifact_type enum (closed):** `image`, `excel`  
**Later:** `pdf`, `document`, `slide`, `other`

Non-goals for discovery in v1: voice blobs, canvas documents as generic blobs, citation chrome, hidden branches.

## 3. Artifact metadata model

Authoritative metadata lives in D1 (new table(s)). Binaries never in this table.

### Logical fields

| Field | Notes |
|-------|--------|
| `artifact_id` | Server-assigned UUID (primary key) |
| `client_artifact_id` | Client idempotency key (stable across retries/rescans) |
| `conversation_id` | FK → conversations |
| `turn_id` | Server turn id when known; **nullable** until resolved |
| `client_turn_id` | Client turn identity; required for turn-tied artifacts |
| `linkage_status` | `resolved` \| `unresolved` \| `orphan` (explicit; never drop for missing `turn_id`) |
| `direction` | `user_uploaded` \| `assistant_generated` |
| `artifact_type` | `image` \| `excel` (v1) |
| `image_provenance` | For images: `uploaded` \| `generated` \| `screenshot` \| `edited_derived` (nullable for non-images) |
| `original_filename` | Best-effort from UI / Content-Disposition |
| `mime_type` | Detected / declared |
| `byte_size` | Integer bytes when known |
| `checksum` | SHA-256 hex of bytes (required once bytes stored; may be absent while `pending_download`) |
| `source_key` | Adapter-extracted stable source id when available |
| `source_url` | Source download URL when available (may be short-lived; do not treat as durable storage) |
| `storage_backend` | `local` \| `r2` (etc.) |
| `storage_location` | Backend-specific key/path (never a public URL requirement) |
| `captured_at` | Client ISO-8601 when observed |
| `created_at` | Server ISO-8601 |
| `capture_status` | See status machine below |
| `parent_artifact_id` | Prior version for revisions (Excel lineage; edited images) |
| `capture_client` / version / surface | Align with existing capture metadata patterns |

### Capture status machine

| Status | Meaning |
|--------|---------|
| `discovered` / `metadata_discovered` | Seen or metadata accepted; bytes not yet confirmed |
| `pending_download` | Bytes transfer in progress / queued |
| `stored` | Bytes + checksum finalized in object storage |
| `failed_download` | Download exhausted retries |
| `rejected` | Validation / policy rejection |
| `conflict` | Hard checksum/identity conflict (dead-letter class) |

**Failure recovery:** metadata may exist without bytes (`pending_download` / `failed_download`). Sync retries download without creating a second metadata row for the same `client_artifact_id`.

## 4. Binary storage (not D1)

| Environment | Proposal |
|-------------|----------|
| Local development | Filesystem object store under a gitignored path (e.g. `apps/worker/.data/artifacts/`) or MinIO-compatible local stub — exact binding via ADR |
| Deployed | Private **Cloudflare R2** bucket; Worker-only credentials; no public bucket ACL |

**Hard rule:** never put binary files in the `turns` table or as D1 BLOB columns.

**Document fidelity** (authorial intent — [Architecture](./Architecture.md), [ADR-0016](./ADRs/0016-document-and-workbook-fidelity.md) — **Accepted**): the exact original binary is layer 1. For Word/Excel, structural and formatting presentation is human-facing semantic data across capture, analysis, editing, versioning, export, and review. Artifact v1’s job is faithful binary capture; edit/export pipelines must obey ADR-0016 (change only what was requested; never overwrite parent; change manifest; fidelity warnings). Original and revised files remain independently downloadable; checksums prove the original unchanged.

Wire upload: **`POST /v1/artifacts`** then **`PUT /v1/artifacts/:artifact_id/content`** only ([ADR-0009](./ADRs/0009-artifact-delivery-retry-and-recovery-pipeline.md)). Multipart deferred beyond v1.

## 5. Idempotent capture

Mirror ADR-0006 spirit for artifacts:

- Prefer validated **source-provided** file/message id when available
- Else deterministic synthetic key, e.g.  
  `conversation_id | client_turn_id | direction | artifact_type | checksumOrFilenameFingerprint | occurrenceIndex`
- Re-observation of the same `client_artifact_id` ⇒ `already_known` (no new D1 row, no second object put if checksum matches)
- If Excel is revised with a **new** source id or new checksum ⇒ **new** artifact with `parent_artifact_id` set

## 6. Excel version lineage

| Event | Behavior |
|-------|----------|
| First workbook | `parent_artifact_id = null` |
| ChatGPT revises / regenerates file | New `artifact_id`; `parent_artifact_id` → previous; prior bytes **retained** |
| Same file re-downloaded unchanged | Idempotent hit on checksum / source id — no new version |

Never overwrite object bytes at an existing `storage_location`.

For **registered** structured workbooks (Digital Newell Framework and others), each new version may later feed an import preview/apply cycle — [StructuredSources.md](./StructuredSources.md). Lineage here is file-level only; row create/update/delete detection is not Artifact v1.

## 7. Image provenance

`image_provenance` distinguishes:

| Value | Meaning |
|-------|---------|
| `uploaded` | Operator attached an image |
| `generated` | Model/image tool output |
| `screenshot` | Explicit screenshot / page-capture artifact (if exposed as downloadable media) |
| `edited_derived` | Edited or derived from a prior image (`parent_artifact_id` set when known) |

Direction remains `user_uploaded` vs `assistant_generated`; provenance refines image origin.

## 8. Privacy and security

| Boundary | Policy |
|----------|--------|
| Enablement | Same operator capture toggle; no artifact download while capture is Off |
| Origins | Only approved ChatGPT origins |
| Association | Artifact must be visibly tied to an accepted captured turn |
| Page origins | Frozen: `chatgpt.com`, `chat.openai.com` (https) |
| Download hosts | Exact allowlist (implement-time); no wildcard fetches |
| User gesture | Not required when association + validation succeed |
| Token | Existing Bearer; artifact routes authenticated like turn reads |
| Object access | Private storage; read via Worker (proxied GET or short-lived signed URL — **ADR-0010**) |
| MIME/size | V1 allowlist + configurable max (25 MB default); reject disallowed types |
| Export | Config export must not include artifact bytes or storage credentials |
| Logging | Never log source URLs with secrets, bytes, or checksums-as-content; sanitized errors only |
| Retention | Operator delete of artifacts is **out of v1** (append-only like turns under current policy) |

## 9. Failure recovery (metadata without bytes)

1. Enqueue metadata with `capture_status = pending_download`
2. Attempt download + put object + checksum
3. On success → `stored` + fill `byte_size` / `checksum` / `storage_location`
4. On failure → retry with backoff in client queue; eventually `failed_download`
5. Operator status surfaces failed artifact counts (options / badge — exact UX later)
6. Rescan may retry `failed_download` / `pending_download` without duplicating identity

## 10. Search / read API implications

Additive endpoints (names illustrative):

| Method | Path | Behavior |
|--------|------|----------|
| `GET` | `/v1/conversations/:id/artifacts` | Metadata list for one conversation (no bytes) |
| `GET` | `/v1/artifacts/:artifact_id` | Metadata for one artifact |
| `GET` | `/v1/artifacts/:artifact_id/content` | Authorized byte stream (or redirect to short-lived signed URL) |

Turn read responses may later include `artifact_ids[]` summaries; **v1 may keep turns unchanged** and use conversation-scoped artifact list only (prefer minimal coupling).

Search: v1 = filter by `conversation_id`, `artifact_type`, `direction`, `capture_status`. Full-text / spreadsheet indexing = later.

## 11. Tests and manual acceptance

### Automated

- Conversation id extraction for `/c/…` and `/g/…/c/…`
- Metadata schema validation
- Idempotent enqueue (same `client_artifact_id`)
- Excel lineage creates parent link without deleting prior
- Download failure leaves `pending_download` / `failed_download` without duplicate rows
- Object store put/get locally
- Auth on artifact read/content routes
- Export/config paths never embed binaries

### Manual acceptance (Artifact v1)

1. Capture On; ordinary or Project chat with stable `/c/<id>`
2. Upload one image → user turn + artifact `stored`
3. Receive one generated image → assistant artifact `stored`
4. Upload one Excel → user artifact `stored`
5. Receive generated or revised Excel → new artifact with `parent_artifact_id` when revised; prior remains
6. Reload / rescan → no duplicate artifacts
7. Read API lists four metadata rows; content fetch returns bytes for `stored` items

## Decisions (ADRs 0007–0010 — Accepted)

| ADR | Title | Status |
|-----|--------|--------|
| [**ADR-0007**](./ADRs/0007-object-storage-platform.md) | Object storage platform | **Accepted** |
| [**ADR-0008**](./ADRs/0008-artifact-identity-lineage-and-turn-linkage.md) | Artifact identity, lineage, turn linkage, checksum conflict, orphan watermark | **Accepted** |
| [**ADR-0009**](./ADRs/0009-artifact-delivery-retry-and-recovery-pipeline.md) | Two-phase ingest, sibling queue, concurrency, page/download allowlists | **Accepted** |
| [**ADR-0010**](./ADRs/0010-binary-access-control.md) | Worker-proxied GET only; private storage; capture origin rules | **Accepted** |

Locked with those ADRs: Project URL `/c/<id>`; sibling queue; `POST`+`PUT` only; MIME/size allowlist; frozen page origins; parallel pipelines; combined orphan rule; conflict UX (dismiss only).

**Document fidelity:** [ADR-0016](./ADRs/0016-document-and-workbook-fidelity.md) — **Accepted** (Word/Excel capture → analysis → editing → versioning → export → review).

Knowledge ADRs **0011–0015** remain **Proposed** ([StructuredSources.md](./StructuredSources.md)); not required for Artifact v1 capture-only.

## Artifact v1 implementation plan (bounded — do not implement until recon + this plan approved)

Prerequisite: **live download-host reconnaissance** (below), then freeze the smallest exact download-host allowlist in config.

### Scope in

| Path | Coverage |
|------|----------|
| Image | One user-uploaded + one assistant-generated (png/jpeg/webp) |
| Excel | One user-uploaded `.xlsx` + one generated/revised `.xlsx` |
| Discovery | Ordinary `/c/<id>` and Project `/g/…/c/<id>` where supported |
| Storage | Local object-storage adapter; artifact **metadata in D1** |
| Client | Sibling Artifact Queue; two-phase upload; reload idempotency; metadata-without-bytes recovery |
| Read | Authenticated Worker-proxied `GET /v1/artifacts/:artifact_id/content` |

**Sequence ([ADR-0016](./ADRs/0016-document-and-workbook-fidelity.md)):** image capture → XLSX capture → **DOCX binary capture after** the artifact pipeline is proven → DOCX structural editing later. **DOCX is out of the first Artifact v1 acceptance test.**

### Scope out

Multipart ingest; upload sessions; R2 deploy (adapter interface ready); structured-source import; signed URLs; replace-identity UX; domain canonical tables; **DOCX in first Artifact v1 acceptance**.

### Live reconnaissance plan (read-only — before coding fetch)

On approved page origins only, with Capture conceptually On for observation (no production ingest required):

| Fixture | Actions |
|---------|---------|
| User-uploaded image | Attach image in chat; inspect network/DOM for download/src URL |
| ChatGPT-generated image | Generate image; inspect result URL(s) |
| User-uploaded `.xlsx` | Upload workbook; inspect download link |
| Generated/revised `.xlsx` | Obtain assistant file; inspect download link |

**Report (then freeze allowlist):**

- Exact source hosts (and redirect chain → final host)  
- URL lifetime / signing behavior  
- Cookie or credential requirements  
- Whether extension `fetch` succeeds without extra user gesture  
- Whether browser user action is required for download  
- MIME and `Content-Disposition` behavior  

**Freeze:** smallest exact download-host allowlist for Artifact v1. No wildcard internet access. Document as config; ADR only if trust model changes.

### Files expected to change

| Area | Likely paths |
|------|----------------|
| Migration | `migrations/0002_artifacts.sql` (metadata tables; no BLOBs) |
| Contracts | `packages/contracts/` — artifact metadata / responses |
| Worker | `apps/worker/src/routes/v1/artifacts.ts` (POST, PUT content, GET content, list); `apps/worker/src/storage/` adapter (local); `apps/worker/src/db/artifacts.ts`; `apps/worker/src/index.ts`; `apps/worker/wrangler.toml`; tests |
| Extension queue | `apps/extension/src/queue/` sibling artifact store + sync (or `apps/extension/src/artifacts/`); `background.ts` |
| Capture | `apps/extension/src/capture/chatgpt/` discovery + download validation; Project URL identity; messaging bridge |
| Options UX | `apps/extension/src/options.ts` (+ HTML) — conflict/dead-letter status |
| Config | download-host allowlist + 25 MB max; `manifest.json` host_permissions as required by recon |
| Docs | `docs/API.md`, `docs/Contracts.md`, `docs/Database.md` aligned after implement |

### Automated tests (plan)

- `/c/` and `/g/…/c/` conversation id extraction  
- `POST /v1/artifacts` idempotent on `client_artifact_id` + same checksum  
- Different checksum → conflict; no overwrite  
- `PUT .../content` finalizes only after SHA-256 verify + storage confirm  
- `metadata_discovered` cannot `GET` bytes as `stored`  
- Local adapter put/get; no D1 binary columns  
- Auth on POST/PUT/GET; unauthorized 401  
- Sibling queue does not touch turn queue; ≤1 artifact in-flight  
- Reload/rescan idempotency  
- Metadata-without-bytes recovery retry  
- Combined orphan rule unit tests (drained + watermark + no pending + absent)  
- Conflict notice payload omits URLs/bytes  

### Manual acceptance criteria

1. Recon complete; download-host allowlist frozen in config  
2. Capture On; ordinary or Project chat with stable `/c/<id>`  
3. User-uploaded image → metadata + `stored` + proxied readback  
4. Generated image → `stored` + readback  
5. User-uploaded `.xlsx` → `stored` + readback  
6. Generated/revised `.xlsx` → new identity + `parent_artifact_id` when revised; prior retained  
7. Reload/rescan → no duplicate artifacts  
8. Kill mid-download → recover to `stored` without new identity  
9. Hard-conflict fixture → Options shows safe conflict notice; dismiss does not replace  
10. List API shows four metadata rows; content GET works only for `stored`  

## Open questions

**None remaining** for Artifact v1 implementation decisions above. Download-host allowlist values pending recon.

## Related

- [StructuredSources](./StructuredSources.md) — database-bearing files, import, canonical ownership
- [Architecture](./Architecture.md)
- [Database](./Database.md) — metadata tables only; no binary columns
- [Contracts](./Contracts.md) — future wire types after ADR
- [API](./API.md) — future routes after ADR
- [CaptureClient](./CaptureClient.md) — discovery + Project URLs
- [TurnCapture](./TurnCapture.md) — turn linkage
- [DurableQueue](./DurableQueue.md) — principles reused by sibling Artifact Queue (not shared transfer state)
- [ADR-0005](./ADRs/0005-use-cloudflare-d1-for-turn-persistence.md) — D1 for relational state
- [ADR-0006](./ADRs/0006-capture-client-durable-queue-identity-and-synchronization.md) — identity / durability precedent