import type {
  CaptureMetadata,
  ConversationMetadata,
  TurnPayload,
  UploadRequest,
} from "@newellai/contracts";
import { HttpError } from "../errors";

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
    if (required) {
      issues.push({ path, message: "required string" });
    }
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
  if (value === undefined) {
    return undefined;
  }
  return expectString(value, path, issues, true);
}

function expectOptionalNumber(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || Number.isNaN(value)) {
    issues.push({ path, message: "must be a number" });
    return undefined;
  }
  return value;
}

function parseConversation(
  value: unknown,
  issues: ValidationIssue[],
): ConversationMetadata | undefined {
  if (!isPlainObject(value)) {
    issues.push({ path: "conversation", message: "must be an object" });
    return undefined;
  }

  const conversation_id = expectString(
    value.conversation_id,
    "conversation.conversation_id",
    issues,
    true,
  );
  const user_id = expectString(value.user_id, "conversation.user_id", issues, true);
  const title = expectOptionalString(value.title, "conversation.title", issues);
  const source_model = expectOptionalString(
    value.source_model,
    "conversation.source_model",
    issues,
  );
  const started_at = expectOptionalString(
    value.started_at,
    "conversation.started_at",
    issues,
  );

  if (!conversation_id || !user_id) {
    return undefined;
  }

  return {
    conversation_id,
    user_id,
    ...(title !== undefined ? { title } : {}),
    ...(source_model !== undefined ? { source_model } : {}),
    ...(started_at !== undefined ? { started_at } : {}),
  };
}

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
  const capture_client_version = expectOptionalString(
    value.capture_client_version,
    "capture.capture_client_version",
    issues,
  );
  const surface = expectOptionalString(value.surface, "capture.surface", issues);
  const captured_batch_id = expectOptionalString(
    value.captured_batch_id,
    "capture.captured_batch_id",
    issues,
  );

  if (!capture_client) {
    return undefined;
  }

  return {
    capture_client,
    ...(capture_client_version !== undefined ? { capture_client_version } : {}),
    ...(surface !== undefined ? { surface } : {}),
    ...(captured_batch_id !== undefined ? { captured_batch_id } : {}),
  };
}

function parseTurn(
  value: unknown,
  index: number,
  issues: ValidationIssue[],
): TurnPayload | undefined {
  const base = `turns[${index}]`;
  if (!isPlainObject(value)) {
    issues.push({ path: base, message: "must be an object" });
    return undefined;
  }

  const client_turn_id = expectString(
    value.client_turn_id,
    `${base}.client_turn_id`,
    issues,
    true,
  );
  const speakerRaw = expectString(value.speaker, `${base}.speaker`, issues, true);
  const text = expectString(value.text, `${base}.text`, issues, true);

  let speaker: TurnPayload["speaker"] | undefined;
  if (speakerRaw === "user" || speakerRaw === "assistant") {
    speaker = speakerRaw;
  } else if (speakerRaw !== undefined) {
    issues.push({
      path: `${base}.speaker`,
      message: 'must be "user" or "assistant"',
    });
  }

  const captured_at = expectOptionalString(
    value.captured_at,
    `${base}.captured_at`,
    issues,
  );
  const sequence = expectOptionalNumber(value.sequence, `${base}.sequence`, issues);
  const parent_client_turn_id = expectOptionalString(
    value.parent_client_turn_id,
    `${base}.parent_client_turn_id`,
    issues,
  );
  const message_type = expectOptionalString(
    value.message_type,
    `${base}.message_type`,
    issues,
  );
  const topic = expectOptionalString(value.topic, `${base}.topic`, issues);

  if (!client_turn_id || !speaker || !text) {
    return undefined;
  }

  return {
    client_turn_id,
    speaker,
    text,
    ...(captured_at !== undefined ? { captured_at } : {}),
    ...(sequence !== undefined ? { sequence } : {}),
    ...(parent_client_turn_id !== undefined ? { parent_client_turn_id } : {}),
    ...(message_type !== undefined ? { message_type } : {}),
    ...(topic !== undefined ? { topic } : {}),
  };
}

/**
 * Parse and validate an unknown JSON value as UploadRequest (wire protocol).
 * Throws HttpError VALIDATION_ERROR on failure.
 */
export function parseUploadRequest(input: unknown): UploadRequest {
  const issues: ValidationIssue[] = [];

  if (!isPlainObject(input)) {
    throw new HttpError("VALIDATION_ERROR", "Request body must be a JSON object", {
      issues: [{ path: "", message: "must be an object" }],
    });
  }

  const conversation = parseConversation(input.conversation, issues);
  const capture = parseCapture(input.capture, issues);

  if (!Array.isArray(input.turns)) {
    issues.push({ path: "turns", message: "must be an array" });
  } else if (input.turns.length === 0) {
    issues.push({ path: "turns", message: "must be a non-empty array" });
  }

  const turns: TurnPayload[] = [];
  if (Array.isArray(input.turns)) {
    for (let i = 0; i < input.turns.length; i += 1) {
      const turn = parseTurn(input.turns[i], i, issues);
      if (turn) {
        turns.push(turn);
      }
    }
  }

  if (issues.length > 0 || !conversation || !capture || turns.length === 0) {
    throw new HttpError("VALIDATION_ERROR", "UploadRequest failed validation", {
      issues,
    });
  }

  return { conversation, capture, turns };
}
