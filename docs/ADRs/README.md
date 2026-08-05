# Architecture Decision Records

**Why** we chose a path—not only what we built. Read when a chapter links here, or when changing ownership / platform boundaries.

[← Engineering notebook TOC](../README.md#table-of-contents)

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [0001](./0001-prototype-narrowly-architect-broadly.md) | Prototype narrowly, architect broadly | Accepted |
| [0002](./0002-durable-queue-in-extension.md) | Durable Queue lives in Capture Client v1 (extension) | Accepted |
| [0003](./0003-npm-workspaces-only.md) | npm workspaces only | Accepted |
| [0004](./0004-why-browser-extension-capture.md) | Why Capture Client v1 is a browser extension (and when to replace it) | Accepted |
| [0005](./0005-use-cloudflare-d1-for-turn-persistence.md) | Use Cloudflare D1 for turn persistence | Accepted |
| [0006](./0006-capture-client-durable-queue-identity-and-synchronization.md) | Capture Client v1 Durable Queue, Identity, and Synchronization | Accepted |
| [0007](./0007-object-storage-platform.md) | Object storage platform | **Accepted** |
| [0008](./0008-artifact-identity-lineage-and-turn-linkage.md) | Artifact identity, lineage, and turn linkage | **Accepted** |
| [0009](./0009-artifact-delivery-retry-and-recovery-pipeline.md) | Artifact delivery, retry, and recovery pipeline | **Accepted** |
| [0010](./0010-binary-access-control.md) | Binary access control | **Accepted** |
| [0011](./0011-canonical-source-ownership.md) | Canonical source ownership | Proposed |
| [0012](./0012-import-version-semantics.md) | Import / version semantics | Proposed |
| [0013](./0013-source-record-identity.md) | Source-record identity | Proposed (inventory-gated) |
| [0014](./0014-conflict-resolution.md) | Conflict resolution | Proposed |
| [0015](./0015-deletion-behavior.md) | Deletion behavior | Proposed |
| [0016](./0016-document-and-workbook-fidelity.md) | Document and workbook fidelity | **Accepted** |

## Consolidated map

### Artifacts — Accepted (implementation may proceed after notebook slice design)

| ADR | Decision highlight |
|-----|-------------------|
| [0007](./0007-object-storage-platform.md) | Storage adapter; local FS; private R2; no D1 blobs; immutable keys; finalize on checksum+storage confirm |
| [0008](./0008-artifact-identity-lineage-and-turn-linkage.md) | Identity; checksum conflict; **combined** orphan rule (drain+watermark+no pending+explicit absent); re-linkable |
| [0009](./0009-artifact-delivery-retry-and-recovery-pipeline.md) | `POST /v1/artifacts` + `PUT .../content` only; declared SHA-256; conflict UX; recon then freeze download hosts |
| [0010](./0010-binary-access-control.md) | Private storage; **Worker-proxied GET only**; no public/signed URLs in v1 |

### Structured sources — Proposed (0011–0015 remain separate)

| ADR | Decision highlight |
|-----|-------------------|
| [0011](./0011-canonical-source-ownership.md) | Staged hybrid per table; local lineage authoritative; ChatGPT = transport; v0 D1 staging only |
| [0012](./0012-import-version-semantics.md) | Manifest; pin artifact versions; preview; partial apply outcomes |
| [0013](./0013-source-record-identity.md) | Explicit/provisional ids; **Accept blocked** until Framework inventory signed off — see [inventory](../DigitalNewellFrameworkInventory.md) |
| [0014](./0014-conflict-resolution.md) | Partial apply; `completed_with_conflicts`; referential integrity skips |
| [0015](./0015-deletion-behavior.md) | Workbook-authoritative default **`propose_only`**; no silent delete |

### Document fidelity — Accepted

| ADR | Decision highlight |
|-----|-------------------|
| [0016](./0016-document-and-workbook-fidelity.md) | Formatting = semantic + latent data; edit: change only what was requested; structural+visual comparison artifacts; DOCX after XLSX pipeline; OOXML-minimal library eval pending |

## Template

Copy [ADR-000-template.md](./ADR-000-template.md) for new decisions.

Name files `NNNN-kebab-title.md`, add a row to this index, link from the relevant chapter. When an ADR is required is governed by [ArchitectureGovernance.md](../ArchitectureGovernance.md) (Change Control).
