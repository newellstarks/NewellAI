import type {
  ArtifactDirection,
  ArtifactType,
  CaptureMetadata,
  ImageProvenance,
} from "@newellai/contracts";

/**
 * Sibling Artifact Queue types (ADR-0009). Separate from the turn Durable Queue.
 */

export const ARTIFACT_ENVELOPE_SCHEMA_VERSION = 1;

export type ArtifactQueueState = "pending" | "in_flight" | "auth_blocked";

export type ArtifactByteStatus =
  | "metadata_discovered"
  | "pending_download"
  | "ready"
  | "uploaded"
  | "failed_download";

/** Durable artifact queue envelope — may hold bytes until PUT succeeds. */
export interface ArtifactQueueEnvelope {
  schema_version: number;
  queue_id: string;
  state: ArtifactQueueState;
  attempts: number;
  next_attempt_at: number;
  enqueued_at: number;
  conversation_id: string;
  user_id: string;
  client_artifact_id: string;
  client_turn_id: string;
  direction: ArtifactDirection;
  artifact_type: ArtifactType;
  mime_type: string;
  declared_sha256?: string;
  declared_byte_size?: number;
  original_filename?: string;
  image_provenance?: ImageProvenance;
  source_key?: string;
  source_url?: string;
  captured_at?: string;
  capture: CaptureMetadata;
  /** Server id after successful POST. */
  artifact_id?: string;
  byte_status: ArtifactByteStatus;
  /** Raw bytes for PUT (ArrayBuffer); absent for metadata-without-bytes recovery. */
  bytes?: ArrayBuffer;
}

export interface ArtifactDeadLetter {
  envelope: ArtifactQueueEnvelope;
  reason: string;
  dead_at: number;
}

export interface ArtifactConflictNotice {
  client_artifact_id: string;
  conversation_id: string;
  artifact_type: ArtifactType;
  original_filename?: string;
  /** Shortened checksum fingerprints only — never full URLs or bytes. */
  checksum_fingerprint?: string;
  reason: string;
  conflict_at: number;
  dismissed: boolean;
}

export interface ArtifactIdentityRecord {
  conversation_id: string;
  source_key: string;
  client_artifact_id: string;
}

export interface ArtifactEnqueueInput {
  conversation_id: string;
  user_id: string;
  client_turn_id: string;
  /** Prefer estuary file id; else deterministic synthetic. */
  source_key: string;
  direction: ArtifactDirection;
  mime_type: string;
  declared_sha256?: string;
  declared_byte_size?: number;
  original_filename?: string;
  image_provenance?: ImageProvenance;
  source_url?: string;
  captured_at?: string;
  capture: CaptureMetadata;
  bytes?: ArrayBuffer;
}

export type ArtifactEnqueueResult =
  | { status: "accepted"; client_artifact_id: string }
  | { status: "already_known"; client_artifact_id: string };

export interface ArtifactQueueStatus {
  pending: number;
  auth_blocked: number;
  in_flight: number;
  dead: number;
  conflicts: number;
  oldest_pending_age_ms: number | null;
  last_error: string | null;
  last_success_at: number | null;
}

export interface ArtifactSyncOutcome {
  delivered: number;
  retried: number;
  dead_lettered: number;
  auth_blocked: number;
  conflicts: number;
  idle: boolean;
}

export const ARTIFACT_RETRY_BASE_MS = 5_000;
export const ARTIFACT_RETRY_CAP_MS = 5 * 60_000;
export const ARTIFACT_MAX_ATTEMPTS = 5;

export function artifactBackoffMs(attempts: number): number {
  return Math.min(
    ARTIFACT_RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1),
    ARTIFACT_RETRY_CAP_MS,
  );
}

export function shortenChecksum(hex: string | undefined): string | undefined {
  if (hex === undefined || hex.length < 12) return hex;
  return `${hex.slice(0, 8)}…${hex.slice(-4)}`;
}
