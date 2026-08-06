import type {
  ArtifactAcceptResponse,
  ConversationArtifactsResponse,
} from "@newellai/contracts";
import { requireCaptureApiToken } from "../../auth";
import {
  conversationExists,
  createOrGetArtifact,
  finalizeArtifactStored,
  getArtifactById,
  isAllowedImageMime,
  listArtifactsForConversation,
  markArtifactConflict,
} from "../../db/artifacts";
import type { Env } from "../../env";
import { HttpError, jsonResponse } from "../../errors";
import {
  artifactMaxBytes,
  objectKeyForArtifact,
  resolveObjectStorage,
} from "../../storage";
import { parseArtifactCreateRequest } from "../../validate/artifactRequest";

/**
 * Artifact ingest + read (docs/Artifacts.md, ADRs 0007–0010).
 * Image slice: PNG / JPEG / WebP only.
 */

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function handleCreateArtifact(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== "POST") {
    throw new HttpError("METHOD_NOT_ALLOWED", "Use POST for /v1/artifacts");
  }
  await requireCaptureApiToken(request, env.CAPTURE_API_TOKEN);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new HttpError("INVALID_JSON", "Request body must be valid JSON");
  }

  const body = parseArtifactCreateRequest(raw);
  const maxBytes = artifactMaxBytes(env);
  if (
    body.declared_byte_size !== undefined &&
    body.declared_byte_size > maxBytes
  ) {
    throw new HttpError("VALIDATION_ERROR", "Artifact exceeds maximum size", {
      max_bytes: maxBytes,
    });
  }

  const { response } = await createOrGetArtifact(env.DB, body);
  return jsonResponse(response satisfies ArtifactAcceptResponse, 200);
}

export async function handlePutArtifactContent(
  request: Request,
  env: Env,
  artifactId: string,
): Promise<Response> {
  if (request.method !== "PUT") {
    throw new HttpError(
      "METHOD_NOT_ALLOWED",
      "Use PUT for /v1/artifacts/:id/content",
    );
  }
  await requireCaptureApiToken(request, env.CAPTURE_API_TOKEN);

  const existing = await getArtifactById(env.DB, artifactId);
  if (existing === null) {
    throw new HttpError("NOT_FOUND", "Artifact not found");
  }

  const maxBytes = artifactMaxBytes(env);
  const buf = new Uint8Array(await request.arrayBuffer());
  if (buf.byteLength > maxBytes) {
    throw new HttpError("VALIDATION_ERROR", "Artifact exceeds maximum size", {
      max_bytes: maxBytes,
    });
  }

  const contentTypeHeader = request.headers.get("content-type");
  const mime =
    contentTypeHeader?.split(";")[0]?.trim().toLowerCase() ?? existing.mime_type;
  if (!isAllowedImageMime(mime) && !isAllowedImageMime(existing.mime_type)) {
    throw new HttpError("VALIDATION_ERROR", "MIME type not allowed");
  }
  const effectiveMime = isAllowedImageMime(mime) ? mime : existing.mime_type;
  if (!isAllowedImageMime(effectiveMime)) {
    throw new HttpError("VALIDATION_ERROR", "MIME type not allowed");
  }

  const checksum = await sha256Hex(buf);

  if (existing.capture_status === "stored") {
    if (existing.checksum !== null && existing.checksum !== checksum) {
      throw new HttpError(
        "CONFLICT",
        "Artifact checksum conflict",
        { code: "ARTIFACT_CHECKSUM_CONFLICT" },
      );
    }
    // Idempotent PUT of same bytes.
    return jsonResponse(
      {
        artifact_id: existing.artifact_id,
        capture_status: "stored",
        checksum: existing.checksum,
        byte_size: existing.byte_size,
        server_time: new Date().toISOString(),
      },
      200,
    );
  }

  if (existing.checksum !== null && existing.checksum !== checksum) {
    await markArtifactConflict(env.DB, artifactId);
    throw new HttpError(
      "CONFLICT",
      "Artifact checksum conflict",
      { code: "ARTIFACT_CHECKSUM_CONFLICT" },
    );
  }

  if (
    existing.byte_size !== null &&
    existing.byte_size !== buf.byteLength
  ) {
    await markArtifactConflict(env.DB, artifactId);
    throw new HttpError(
      "CONFLICT",
      "Artifact checksum conflict",
      { code: "ARTIFACT_CHECKSUM_CONFLICT" },
    );
  }

  const storage = resolveObjectStorage(env);
  const key = objectKeyForArtifact(artifactId, checksum);
  try {
    await storage.put(key, buf, effectiveMime);
  } catch (error) {
    const detail =
      error instanceof Error
        ? `${error.name}:${error.message}`.slice(0, 160)
        : "unknown";
    console.error("ARTIFACT_STORAGE_PUT_FAILED", detail);
    throw new HttpError("INTERNAL_ERROR", "Unexpected server error");
  }

  const confirmed = await storage.head(key);
  if (confirmed === null || confirmed.byteSize !== buf.byteLength) {
    throw new HttpError("INTERNAL_ERROR", "Unexpected server error");
  }

  const record = await finalizeArtifactStored(env.DB, {
    artifactId,
    checksum,
    byteSize: buf.byteLength,
    storageBackend: env.ARTIFACT_STORAGE_MODE === "memory" ? "memory" : "local",
    storageLocation: key,
    mimeType: effectiveMime,
  });

  return jsonResponse(
    {
      artifact_id: record.artifact_id,
      capture_status: record.capture_status,
      checksum: record.checksum,
      byte_size: record.byte_size,
      server_time: new Date().toISOString(),
    },
    200,
  );
}

export async function handleGetArtifact(
  request: Request,
  env: Env,
  artifactId: string,
): Promise<Response> {
  if (request.method !== "GET") {
    throw new HttpError("METHOD_NOT_ALLOWED", "Use GET for /v1/artifacts/:id");
  }
  await requireCaptureApiToken(request, env.CAPTURE_API_TOKEN);
  const record = await getArtifactById(env.DB, artifactId);
  if (record === null) {
    throw new HttpError("NOT_FOUND", "Artifact not found");
  }
  return jsonResponse(record, 200);
}

export async function handleGetArtifactContent(
  request: Request,
  env: Env,
  artifactId: string,
): Promise<Response> {
  if (request.method !== "GET") {
    throw new HttpError(
      "METHOD_NOT_ALLOWED",
      "Use GET for /v1/artifacts/:id/content",
    );
  }
  await requireCaptureApiToken(request, env.CAPTURE_API_TOKEN);

  const record = await getArtifactById(env.DB, artifactId);
  if (record === null || record.capture_status !== "stored") {
    // Sanitize: do not reveal existence vs not-stored distinctly beyond 404.
    throw new HttpError("NOT_FOUND", "Artifact not found");
  }
  if (record.storage_location === null || record.checksum === null) {
    throw new HttpError("NOT_FOUND", "Artifact not found");
  }

  const storage = resolveObjectStorage(env);
  const obj = await storage.get(record.storage_location);
  if (obj === null) {
    throw new HttpError("NOT_FOUND", "Artifact not found");
  }

  const actual = await sha256Hex(obj.bytes);
  if (actual !== record.checksum) {
    throw new HttpError("INTERNAL_ERROR", "Unexpected server error");
  }

  return new Response(obj.bytes, {
    status: 200,
    headers: {
      "content-type": obj.contentType,
      "content-length": String(obj.byteSize),
      "x-artifact-checksum": record.checksum,
    },
  });
}

export async function handleListConversationArtifacts(
  request: Request,
  env: Env,
  conversationId: string,
): Promise<Response> {
  if (request.method !== "GET") {
    throw new HttpError(
      "METHOD_NOT_ALLOWED",
      "Use GET for /v1/conversations/:id/artifacts",
    );
  }
  await requireCaptureApiToken(request, env.CAPTURE_API_TOKEN);

  const exists = await conversationExists(env.DB, conversationId);
  if (!exists) {
    throw new HttpError("NOT_FOUND", "Conversation not found");
  }

  const artifacts = await listArtifactsForConversation(env.DB, conversationId);
  const body: ConversationArtifactsResponse = {
    conversation_id: conversationId,
    artifacts,
    server_time: new Date().toISOString(),
  };
  return jsonResponse(body, 200);
}
