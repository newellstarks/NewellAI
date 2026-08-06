/**
 * Compile-time smoke checks for shared contracts (docs/Contracts.md).
 * Run: npx tsc -p packages/contracts --noEmit
 */
import type {
  ApiError,
  ArtifactAcceptResponse,
  ArtifactCreateRequest,
  ArtifactRecord,
  CaptureMetadata,
  ConversationArtifactsResponse,
  ConversationMetadata,
  ConversationsResponse,
  ConversationTurnsResponse,
  SearchResponse,
  SystemStatusResponse,
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

const artifactCreate: ArtifactCreateRequest = {
  client_artifact_id: "file_abc",
  conversation_id: "conv-1",
  user_id: "user-1",
  client_turn_id: "turn-1",
  direction: "user_uploaded",
  artifact_type: "image",
  mime_type: "image/png",
  declared_sha256: "a".repeat(64),
  declared_byte_size: 12,
  image_provenance: "uploaded",
  capture,
};

const artifactAccept: ArtifactAcceptResponse = {
  artifact_id: "0d4e7a1c-0000-4000-8000-000000000001",
  client_artifact_id: "file_abc",
  conversation_id: "conv-1",
  capture_status: "metadata_discovered",
  linkage_status: "unresolved",
  duplicate: false,
  server_time: new Date().toISOString(),
};

const artifactRecord: ArtifactRecord = {
  artifact_id: artifactAccept.artifact_id,
  client_artifact_id: "file_abc",
  conversation_id: "conv-1",
  turn_id: null,
  client_turn_id: "turn-1",
  linkage_status: "unresolved",
  direction: "user_uploaded",
  artifact_type: "image",
  mime_type: "image/png",
  byte_size: null,
  checksum: null,
  storage_backend: null,
  storage_location: null,
  capture_status: "metadata_discovered",
  parent_artifact_id: null,
  capture_client: "manual",
  created_at: "2026-08-01T00:00:00.000Z",
};

const conversationArtifacts: ConversationArtifactsResponse = {
  conversation_id: "conv-1",
  artifacts: [artifactRecord],
  server_time: new Date().toISOString(),
};

const search: SearchResponse = {
  query: "Hello",
  hits: [
    {
      conversation_id: "conv-1",
      turn_id: "0d4e7a1c-0000-4000-8000-000000000000",
      client_turn_id: "turn-1",
      speaker: "user",
      snippet: "Hello",
      created_at: "2026-08-01T00:00:00.000Z",
    },
  ],
  server_time: new Date().toISOString(),
};

const status: SystemStatusResponse = {
  conversation_count: 1,
  turn_count: 1,
  artifacts: {
    stored: 0,
    pending_download: 0,
    failed_download: 0,
    other: 1,
    bytes_missing: 0,
  },
  storage: { mode: "memory", root: null, available: true },
  last_turn_at: "2026-08-01T00:00:00.000Z",
  last_artifact_at: null,
  server_time: new Date().toISOString(),
};

void request;
void response;
void err;
void list;
void conversationTurns;
void artifactCreate;
void artifactAccept;
void conversationArtifacts;
void search;
void status;
