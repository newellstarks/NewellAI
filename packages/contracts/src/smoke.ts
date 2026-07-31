/**
 * Compile-time smoke checks for shared contracts (docs/Contracts.md).
 * Run: npx tsc -p packages/contracts --noEmit
 */
import type {
  ApiError,
  CaptureMetadata,
  ConversationMetadata,
  TurnPayload,
  UploadRequest,
  UploadResponse,
} from "./index";

const turn: TurnPayload = {
  client_turn_id: "turn-1",
  speaker: "user",
  text: "Hello",
  sequence: 1,
};

const conversation: ConversationMetadata = {
  conversation_id: "conv-1",
  user_id: "user-1",
};

const capture: CaptureMetadata = {
  capture_client: "manual",
  surface: "phase1-test",
};

const request: UploadRequest = {
  conversation,
  capture,
  turns: [turn],
};

const response: UploadResponse = {
  accepted: 1,
  duplicate: 0,
  conversation_id: "conv-1",
  server_time: new Date().toISOString(),
};

const err: ApiError = {
  error: {
    code: "VALIDATION_ERROR",
    message: "turns must be non-empty",
  },
};

void request;
void response;
void err;
