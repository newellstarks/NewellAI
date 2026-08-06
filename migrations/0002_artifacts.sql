-- 0002_artifacts.sql — artifact metadata only (docs/Artifacts.md, ADRs 0007–0010)
-- Hard rule: no binary / BLOB columns.

CREATE TABLE artifacts (
  artifact_id            TEXT PRIMARY KEY,
  client_artifact_id     TEXT NOT NULL,
  conversation_id        TEXT NOT NULL REFERENCES conversations (conversation_id),
  turn_id                TEXT,
  client_turn_id         TEXT NOT NULL,
  linkage_status         TEXT NOT NULL
    CHECK (linkage_status IN ('unresolved', 'resolved', 'orphan')),
  direction              TEXT NOT NULL
    CHECK (direction IN ('user_uploaded', 'assistant_generated')),
  artifact_type          TEXT NOT NULL
    CHECK (artifact_type IN ('image')),
  image_provenance       TEXT
    CHECK (
      image_provenance IS NULL
      OR image_provenance IN ('uploaded', 'generated', 'screenshot', 'edited_derived')
    ),
  original_filename      TEXT,
  mime_type              TEXT NOT NULL,
  byte_size              INTEGER,
  checksum               TEXT,
  source_key             TEXT,
  storage_backend        TEXT,
  storage_location       TEXT,
  capture_status         TEXT NOT NULL
    CHECK (
      capture_status IN (
        'metadata_discovered',
        'pending_download',
        'stored',
        'failed_download',
        'rejected',
        'conflict'
      )
    ),
  parent_artifact_id     TEXT,
  capture_client         TEXT NOT NULL,
  capture_client_version TEXT,
  surface                TEXT,
  captured_at            TEXT,
  created_at             TEXT NOT NULL,
  UNIQUE (conversation_id, client_artifact_id)
);

CREATE INDEX idx_artifacts_conversation
  ON artifacts (conversation_id);

CREATE INDEX idx_artifacts_client_turn
  ON artifacts (conversation_id, client_turn_id);
