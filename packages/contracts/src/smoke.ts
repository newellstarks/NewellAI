/**
 * Compile-time smoke checks for shared contracts (docs/Contracts.md).
 * Run: npx tsc -p packages/contracts --noEmit
 */
import type {
  ApiError,
  CaptureMetadata,
  ConversationMetadata,
  ConversationsResponse,
  ConversationTurnsResponse,
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

// CT-4 — read response shapes (additive; upload shapes unchanged).
const list: ConversationsResponse = {
  conversations: [
    {
      conversation_id: "conv-1",
      user_id: "user-1",
      created_at: "2026-08-01T00:00:00.000Z",
      last_turn_at: "2026-08-01T00:00:05.000Z",
      turn_count: 2,
    },
    // Orphaned conversation (no stored turns): nulls, sorts last.
    {
      conversation_id: "conv-orphan",
      user_id: "user-1",
      created_at: "2026-08-01T00:00:00.000Z",
      last_turn_at: null,
      turn_count: 0,
    },
  ],
  server_time: new Date().toISOString(),
};

const conversationTurns: ConversationTurnsResponse = {
  conversation_id: "conv-1",
  turns: [
    {
      turn_id: "0d4e7a1c-0000-4000-8000-000000000000",
      conversation_id: "conv-1",
      client_turn_id: "turn-1",
      speaker: "user",
      text: "Hello",
      sequence: 1,
      capture_client: "manual",
      created_at: "2026-08-01T00:00:00.000Z",
    },
  ],
  server_time: new Date().toISOString(),
};

void request;
void response;
void err;
void list;
void conversationTurns;
