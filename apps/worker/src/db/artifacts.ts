import type {
  ArtifactAcceptResponse,
  ArtifactCaptureStatus,
  ArtifactCreateRequest,
  ArtifactDirection,
  ArtifactLinkageStatus,
  ArtifactRecord,
  ArtifactType,
  ImageProvenance,
} from "@newellai/contracts";
import { HttpError } from "../errors";

/**
 * Artifact metadata persistence (docs/Artifacts.md, ADRs 0007–0010).
 * Bytes never enter D1.
 */

export const IMAGE_MIME_ALLOWLIST = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type ImageMime = (typeof IMAGE_MIME_ALLOWLIST)[number];

export function isAllowedImageMime(mime: string): mime is ImageMime {
  return (IMAGE_MIME_ALLOWLIST as readonly string[]).includes(mime);
}

interface ArtifactRow {
  artifact_id: string;
  client_artifact_id: string;
  conversation_id: string;
  turn_id: string | null;
  client_turn_id: string;
  linkage_status: string;
  direction: string;
  artifact_type: string;
  image_provenance: string | null;
  original_filename: string | null;
  mime_type: string;
  byte_size: number | null;
  checksum: string | null;
  source_key: string | null;
  storage_backend: string | null;
  storage_location: string | null;
  capture_status: string;
  parent_artifact_id: string | null;
  capture_client: string;
  capture_client_version: string | null;
  surface: string | null;
  captured_at: string | null;
  created_at: string;
}

function requireDb(db: D1Database | undefined): D1Database {
  if (db === undefined) {
    console.error("DB_CONFIGURATION_MISSING");
    throw new HttpError("INTERNAL_ERROR", "Unexpected server error");
  }
  return db;
}

function rowToRecord(row: ArtifactRow): ArtifactRecord {
  return {
    artifact_id: row.artifact_id,
    client_artifact_id: row.client_artifact_id,
    conversation_id: row.conversation_id,
    turn_id: row.turn_id,
    client_turn_id: row.client_turn_id,
    linkage_status: row.linkage_status as ArtifactLinkageStatus,
    direction: row.direction as ArtifactDirection,
    artifact_type: row.artifact_type as ArtifactType,
    ...(row.image_provenance !== null
      ? { image_provenance: row.image_provenance as ImageProvenance }
      : {}),
    ...(row.original_filename !== null
      ? { original_filename: row.original_filename }
      : {}),
    mime_type: row.mime_type,
    byte_size: row.byte_size,
    checksum: row.checksum,
    ...(row.source_key !== null ? { source_key: row.source_key } : {}),
    storage_backend: row.storage_backend,
    storage_location: row.storage_location,
    capture_status: row.capture_status as ArtifactCaptureStatus,
    parent_artifact_id: row.parent_artifact_id,
    capture_client: row.capture_client,
    ...(row.capture_client_version !== null
      ? { capture_client_version: row.capture_client_version }
      : {}),
    ...(row.surface !== null ? { surface: row.surface } : {}),
    ...(row.captured_at !== null ? { captured_at: row.captured_at } : {}),
    created_at: row.created_at,
  };
}

async function resolveTurnId(
  db: D1Database,
  conversationId: string,
  clientTurnId: string,
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT turn_id FROM turns
        WHERE conversation_id = ? AND client_turn_id = ?`,
    )
    .bind(conversationId, clientTurnId)
    .first<{ turn_id: string }>();
  return row?.turn_id ?? null;
}

export async function getArtifactById(
  db: D1Database | undefined,
  artifactId: string,
): Promise<ArtifactRecord | null> {
  const row = await requireDb(db)
    .prepare(`SELECT * FROM artifacts WHERE artifact_id = ?`)
    .bind(artifactId)
    .first<ArtifactRow>();
  return row === null ? null : rowToRecord(row);
}

export async function listArtifactsForConversation(
  db: D1Database | undefined,
  conversationId: string,
): Promise<ArtifactRecord[]> {
  const { results } = await requireDb(db)
    .prepare(
      `SELECT * FROM artifacts
        WHERE conversation_id = ?
        ORDER BY created_at ASC, artifact_id ASC`,
    )
    .bind(conversationId)
    .all<ArtifactRow>();
  return results.map(rowToRecord);
}

export async function conversationExists(
  db: D1Database | undefined,
  conversationId: string,
): Promise<boolean> {
  const row = await requireDb(db)
    .prepare(
      `SELECT conversation_id FROM conversations WHERE conversation_id = ?`,
    )
    .bind(conversationId)
    .first<{ conversation_id: string }>();
  return row !== null;
}

/**
 * Ensure user + conversation rows exist (same pattern as turn ingest).
 */
export async function ensureConversation(
  db: D1Database,
  conversationId: string,
  userId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare("INSERT OR IGNORE INTO users (user_id, created_at) VALUES (?, ?)")
    .bind(userId, now)
    .run();
  await db
    .prepare(
      `INSERT OR IGNORE INTO conversations
         (conversation_id, user_id, title, source_model, started_at, created_at)
       VALUES (?, ?, NULL, NULL, NULL, ?)`,
    )
    .bind(conversationId, userId, now)
    .run();
}

export interface CreateArtifactResult {
  response: ArtifactAcceptResponse;
}

/**
 * Phase 1: accept or idempotently return metadata.
 * Same client_artifact_id + same checksum ⇒ duplicate.
 * Same client_artifact_id + different checksum ⇒ CONFLICT.
 */
export async function createOrGetArtifact(
  db: D1Database | undefined,
  request: ArtifactCreateRequest,
): Promise<CreateArtifactResult> {
  const database = requireDb(db);
  await ensureConversation(
    database,
    request.conversation_id,
    request.user_id,
  );

  const existing = await database
    .prepare(
      `SELECT * FROM artifacts
        WHERE conversation_id = ? AND client_artifact_id = ?`,
    )
    .bind(request.conversation_id, request.client_artifact_id)
    .first<ArtifactRow>();

  if (existing !== null) {
    const existingChecksum = existing.checksum;
    const declared = request.declared_sha256 ?? null;
    if (
      existingChecksum !== null &&
      declared !== null &&
      existingChecksum !== declared
    ) {
      throw new HttpError("CONFLICT", "Artifact checksum conflict", {
        code: "ARTIFACT_CHECKSUM_CONFLICT",
      });
    }

    return {
      response: {
        artifact_id: existing.artifact_id,
        client_artifact_id: existing.client_artifact_id,
        conversation_id: existing.conversation_id,
        capture_status: existing.capture_status as ArtifactCaptureStatus,
        linkage_status: existing.linkage_status as ArtifactLinkageStatus,
        duplicate: true,
        server_time: new Date().toISOString(),
      },
    };
  }

  const turnId = await resolveTurnId(
    database,
    request.conversation_id,
    request.client_turn_id,
  );
  const linkage_status: ArtifactLinkageStatus =
    turnId !== null ? "resolved" : "unresolved";
  const capture_status: ArtifactCaptureStatus =
    request.declared_sha256 !== undefined &&
    request.declared_byte_size !== undefined
      ? "pending_download"
      : "metadata_discovered";

  const artifact_id = crypto.randomUUID();
  const now = new Date().toISOString();

  await database
    .prepare(
      `INSERT INTO artifacts (
         artifact_id, client_artifact_id, conversation_id, turn_id,
         client_turn_id, linkage_status, direction, artifact_type,
         image_provenance, original_filename, mime_type, byte_size, checksum,
         source_key, storage_backend, storage_location, capture_status,
         parent_artifact_id, capture_client, capture_client_version, surface,
         captured_at, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      artifact_id,
      request.client_artifact_id,
      request.conversation_id,
      turnId,
      request.client_turn_id,
      linkage_status,
      request.direction,
      request.artifact_type,
      request.image_provenance ?? null,
      request.original_filename ?? null,
      request.mime_type,
      request.declared_byte_size ?? null,
      request.declared_sha256 ?? null,
      request.source_key ?? null,
      capture_status,
      request.parent_artifact_id ?? null,
      request.capture.capture_client,
      request.capture.capture_client_version ?? null,
      request.capture.surface ?? null,
      request.captured_at ?? null,
      now,
    )
    .run();

  return {
    response: {
      artifact_id,
      client_artifact_id: request.client_artifact_id,
      conversation_id: request.conversation_id,
      capture_status,
      linkage_status,
      duplicate: false,
      server_time: now,
    },
  };
}

export interface FinalizeInput {
  artifactId: string;
  checksum: string;
  byteSize: number;
  storageBackend: string;
  storageLocation: string;
  mimeType: string;
}

/**
 * Finalize after storage confirmation + checksum verify (caller verifies).
 */
export async function finalizeArtifactStored(
  db: D1Database | undefined,
  input: FinalizeInput,
): Promise<ArtifactRecord> {
  const database = requireDb(db);
  const existing = await getArtifactById(database, input.artifactId);
  if (existing === null) {
    throw new HttpError("NOT_FOUND", "Artifact not found");
  }

  if (existing.capture_status === "stored") {
    if (existing.checksum !== null && existing.checksum !== input.checksum) {
      throw new HttpError("CONFLICT", "Artifact checksum conflict", {
        code: "ARTIFACT_CHECKSUM_CONFLICT",
      });
    }
    return existing;
  }

  await database
    .prepare(
      `UPDATE artifacts
          SET checksum = ?, byte_size = ?, storage_backend = ?,
              storage_location = ?, mime_type = ?, capture_status = 'stored'
        WHERE artifact_id = ?`,
    )
    .bind(
      input.checksum,
      input.byteSize,
      input.storageBackend,
      input.storageLocation,
      input.mimeType,
      input.artifactId,
    )
    .run();

  const updated = await getArtifactById(database, input.artifactId);
  if (updated === null) {
    throw new HttpError("INTERNAL_ERROR", "Unexpected server error");
  }
  return updated;
}

export async function markArtifactConflict(
  db: D1Database | undefined,
  artifactId: string,
): Promise<void> {
  await requireDb(db)
    .prepare(
      `UPDATE artifacts SET capture_status = 'conflict' WHERE artifact_id = ?`,
    )
    .bind(artifactId)
    .run();
}
