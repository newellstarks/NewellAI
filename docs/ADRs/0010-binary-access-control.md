# ADR-0010: Binary access control

## Status

Accepted

## Date

2026-08-05

## Deciders

Newell Starks (System Owner)

## Context

Artifact bytes (chat images, Excel, later Framework workbooks) are sensitive. [Artifacts.md](../Artifacts.md) requires private storage, authenticated reads, and capture-time restrictions on origins/sources. Storage placement is [ADR-0007](./0007-object-storage-platform.md). Capture download validation overlaps [ADR-0009](./0009-artifact-delivery-retry-and-recovery-pipeline.md); this ADR decides **how authorized parties read stored bytes** and restates least-privilege capture constraints that protect the system from becoming an open fetch proxy.

Auth precedent: shared Bearer ([Authentication.md](../Authentication.md)). Turn reads already require the same token class.

## Decision

### Stored binary reads (Worker)

| Rule | Policy |
|------|--------|
| Storage | **Private only** — no public bucket, no public object ACL ([ADR-0007](./0007-object-storage-platform.md)) |
| Metadata reads | Authenticated `GET` (list by conversation; get by `artifact_id`) |
| Byte reads | Authenticated **Worker-proxied** `GET /v1/artifacts/:artifact_id/content` (name illustrative) **only** for Artifact v1 |
| Authorization | Exact check: valid Bearer **and** artifact belongs to an authorized conversation/operator context (v1: token holder = single operator; multi-user must enforce ownership) |
| Only `stored` | Content GET succeeds only when bytes exist and status is `stored`; otherwise 404/409 with sanitized body |
| Caching | `Cache-Control: no-store` (or equivalent) on content responses |
| Config export | Never includes bytes or storage credentials |
| Public URLs | **Forbidden** — no bucket/object URL is public |

### Proxied GET vs signed URLs — choice (locked)

**Accepted for Artifact v1: Worker-proxied authenticated GET only.**

| Approach | Outcome |
|----------|---------|
| **Proxied GET** | **Chosen** — single authz path; works for local filesystem adapter and R2; no URL leakage; least privilege |
| Short-lived signed URLs | **Deferred** until demonstrated need; requires a superseding ADR; storage remains private even if introduced later |

No public bucket/object URL in any environment.

### Capture-time source control (write path)

Aligned with [ADR-0009](./0009-artifact-delivery-retry-and-recovery-pipeline.md):

**Frozen approved page origins:**

- `https://chatgpt.com`
- `https://chat.openai.com`

**Artifact download hosts:** exact allowlist frozen after live reconnaissance ([Artifacts.md](../Artifacts.md) implementation plan). No wildcard internet fetches. Source URL must be tied to an accepted ChatGPT artifact element. Allowlist changes are documented configuration changes; a new ADR is required only if the trust model changes.

Also: Capture Off ⇒ no download; user gesture not required when association + validation succeed.

### Least privilege and auditability

- Extension never receives R2/filesystem credentials.
- Worker storage credentials only via bindings/secrets.
- Content access should emit sanitized audit signals suitable for later logging (request id, artifact id, outcome) **without** logging bytes or filenames that embed secrets.
- Diagnostics/badge counts only — no content preview dumps.

## Alternatives considered

| Option | Outcome |
|--------|---------|
| Public R2 URLs | **Rejected** — disclosure risk. |
| Signed URLs as v1 default | **Rejected** — see table; defer. |
| Extension reads R2 directly | **Rejected** — distributes storage credentials. |
| Base64 in metadata API | **Rejected** — defeats object storage; huge payloads. |
| Allow arbitrary CDN fetch if MIME looks safe | **Rejected** — open-proxy hazard. |

## Consequences

- Content route must stream up to 25 MB efficiently under auth.
- CORS for content remains as tight as other `/v1/*` routes.
- Local and R2 adapters both serve through the same authz gate.
- Future multi-user **must** add explicit ownership checks (design now, enforce when multi-user lands).

## Failure and recovery behavior

| Failure | Behavior |
|---------|----------|
| Missing/invalid token | 401 sanitized; no byte leakage |
| Valid token, wrong/unknown artifact | 404 sanitized |
| Artifact not `stored` | 404 or 409; no partial corrupt body |
| Storage get failure | 5xx sanitized; retryable by client; no fallback to public URL |
| Authz regression | Treat as severity-critical; tests must catch unauthenticated content GET |

Capture-time validation failures never create `stored` objects ([ADR-0009](./0009-artifact-delivery-retry-and-recovery-pipeline.md)).

## Security and privacy implications

- Primary confidentiality control for artifacts after capture.
- Framework/Excel may contain broad PII — content GET ≡ sensitive as turn text.
- Proxied GET reduces signed-URL redistribution risk.
- No public bucket eliminates an entire class of ACL mistakes.
- Auditability without content logging is mandatory for operator trust.

## Migration and reversal strategy

- **Forward:** proxy-only content route for local + R2.
- **Later signed URLs:** only via superseding ADR; bucket remains private; mint endpoint authz-gated.
- **Reversal** to public objects: forbidden without explicit security ADR (should never happen).
- Token rotation follows existing Authentication.md practices; in-flight downloads fail closed then retry.

## Acceptance criteria

1. Unauthenticated content GET → 401; no bytes.
2. Authenticated content GET returns bytes only for `stored` artifacts.
3. No public object URL appears in API responses for v1.
4. Config export/import tests assert absence of bytes and storage secrets.
5. Content responses set no-store (or equivalent).
6. Capture path rejects non-approved page origins and non-allowlisted download hosts; no wildcard fetch path exists.
7. Automated authz tests cover happy path + unauthorized + not-stored.
8. Worker-proxied GET is the only v1 content access mechanism (no public or signed URLs).

## Relationship to ADR-0006 and the turn pipeline

- Turn pipeline auth uses the same Bearer token class; artifact **reads** reuse that gate — not a second credential system in v1.
- ADR-0006 diagnostics rules apply: never log token or conversation/artifact **content**.
- Turn read APIs remain JSON-only; they do not stream artifact bytes. Clients use artifact content routes explicitly.
- Capture association (“accepted captured turn”) depends on turn-pipeline acceptance, but **authorization to read stored bytes** is enforced at the Worker on every content GET independently of the extension queue state.
- Sibling artifact queue ([ADR-0009](./0009-artifact-delivery-retry-and-recovery-pipeline.md)) uploads under the same token; this ADR governs **egress** of bytes to clients, not turn FIFO.
