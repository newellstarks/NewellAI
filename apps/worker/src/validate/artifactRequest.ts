import type { ArtifactCreateRequest, CaptureMetadata } from "@newellai/contracts";
import { HttpError } from "../errors";
import { isAllowedImageMime } from "../db/artifacts";

export type ValidationIssue = {
  path: string;
  message: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectString(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  required: boolean,
): string | undefined {
  if (value === undefined || value === null) {
    if (required) issues.push({ path, message: "required string" });
    return undefined;
  }
  if (typeof value !== "string" || value.trim() === "") {
    issues.push({ path, message: "must be a non-empty string" });
    return undefined;
  }
  return value;
}

function expectOptionalString(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): string | undefined {
  if (value === undefined) return undefined;
  return expectString(value, path, issues, true);
}

function expectOptionalNumber(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    issues.push({ path, message: "must be a number" });
    return undefined;
  }
  return value;
}

const SHA256_RE = /^[a-f0-9]{64}$/i;

function parseCapture(
  value: unknown,
  issues: ValidationIssue[],
): CaptureMetadata | undefined {
  if (!isPlainObject(value)) {
    issues.push({ path: "capture", message: "must be an object" });
    return undefined;
  }
  const capture_client = expectString(
    value.capture_client,
    "capture.capture_client",
    issues,
    true,
  );
  if (capture_client === undefined) return undefined;
  const capture: CaptureMetadata = { capture_client };
  const v = expectOptionalString(
    value.capture_client_version,
    "capture.capture_client_version",
    issues,
  );
  if (v !== undefined) capture.capture_client_version = v;
  const surface = expectOptionalString(value.surface, "capture.surface", issues);
  if (surface !== undefined) capture.surface = surface;
  const batch = expectOptionalString(
    value.captured_batch_id,
    "capture.captured_batch_id",
    issues,
  );
  if (batch !== undefined) capture.captured_batch_id = batch;
  return capture;
}

/**
 * Validate POST /v1/artifacts body (image slice MIME allowlist).
 */
export function parseArtifactCreateRequest(raw: unknown): ArtifactCreateRequest {
  const issues: ValidationIssue[] = [];
  if (!isPlainObject(raw)) {
    throw new HttpError("VALIDATION_ERROR", "body must be an object", {
      issues: [{ path: "", message: "must be an object" }],
    });
  }

  const client_artifact_id = expectString(
    raw.client_artifact_id,
    "client_artifact_id",
    issues,
    true,
  );
  const conversation_id = expectString(
    raw.conversation_id,
    "conversation_id",
    issues,
    true,
  );
  const user_id = expectString(raw.user_id, "user_id", issues, true);
  const client_turn_id = expectString(
    raw.client_turn_id,
    "client_turn_id",
    issues,
    true,
  );
  const direction = expectString(raw.direction, "direction", issues, true);
  const artifact_type = expectString(
    raw.artifact_type,
    "artifact_type",
    issues,
    true,
  );
  const mime_type = expectString(raw.mime_type, "mime_type", issues, true);
  const capture = parseCapture(raw.capture, issues);

  if (direction !== undefined && direction !== "user_uploaded" && direction !== "assistant_generated") {
    issues.push({ path: "direction", message: "must be user_uploaded or assistant_generated" });
  }
  if (artifact_type !== undefined && artifact_type !== "image") {
    issues.push({ path: "artifact_type", message: "must be image for this slice" });
  }
  if (mime_type !== undefined && !isAllowedImageMime(mime_type)) {
    issues.push({
      path: "mime_type",
      message: "must be image/png, image/jpeg, or image/webp",
    });
  }

  const declared_sha256 = expectOptionalString(
    raw.declared_sha256,
    "declared_sha256",
    issues,
  );
  if (declared_sha256 !== undefined && !SHA256_RE.test(declared_sha256)) {
    issues.push({ path: "declared_sha256", message: "must be 64 hex chars" });
  }
  const declared_byte_size = expectOptionalNumber(
    raw.declared_byte_size,
    "declared_byte_size",
    issues,
  );
  if (declared_byte_size !== undefined && declared_byte_size < 0) {
    issues.push({ path: "declared_byte_size", message: "must be >= 0" });
  }
  if (
    (declared_sha256 !== undefined) !== (declared_byte_size !== undefined)
  ) {
    issues.push({
      path: "declared_sha256",
      message: "declared_sha256 and declared_byte_size must be provided together",
    });
  }

  const original_filename = expectOptionalString(
    raw.original_filename,
    "original_filename",
    issues,
  );
  const image_provenance = expectOptionalString(
    raw.image_provenance,
    "image_provenance",
    issues,
  );
  if (
    image_provenance !== undefined &&
    image_provenance !== "uploaded" &&
    image_provenance !== "generated" &&
    image_provenance !== "screenshot" &&
    image_provenance !== "edited_derived"
  ) {
    issues.push({ path: "image_provenance", message: "invalid provenance" });
  }
  const parent_artifact_id = expectOptionalString(
    raw.parent_artifact_id,
    "parent_artifact_id",
    issues,
  );
  const source_key = expectOptionalString(raw.source_key, "source_key", issues);
  const captured_at = expectOptionalString(raw.captured_at, "captured_at", issues);

  if (issues.length > 0 || capture === undefined) {
    throw new HttpError("VALIDATION_ERROR", "Invalid artifact create request", {
      issues,
    });
  }

  const request: ArtifactCreateRequest = {
    client_artifact_id: client_artifact_id!,
    conversation_id: conversation_id!,
    user_id: user_id!,
    client_turn_id: client_turn_id!,
    direction: direction as ArtifactCreateRequest["direction"],
    artifact_type: "image",
    mime_type: mime_type!,
    capture,
  };
  if (declared_sha256 !== undefined) {
    request.declared_sha256 = declared_sha256.toLowerCase();
    request.declared_byte_size = declared_byte_size;
  }
  if (original_filename !== undefined) request.original_filename = original_filename;
  if (image_provenance !== undefined) {
    request.image_provenance =
      image_provenance as ArtifactCreateRequest["image_provenance"];
  }
  if (parent_artifact_id !== undefined) {
    request.parent_artifact_id = parent_artifact_id;
  }
  if (source_key !== undefined) request.source_key = source_key;
  if (captured_at !== undefined) request.captured_at = captured_at;
  return request;
}
