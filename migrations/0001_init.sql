-- 0001_init.sql — users, conversations, turns (docs/Database.md)

CREATE TABLE users (
  user_id    TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE TABLE conversations (
  conversation_id TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users (user_id),
  title           TEXT,
  source_model    TEXT,
  started_at      TEXT,
  created_at      TEXT NOT NULL
);

CREATE TABLE turns (
  turn_id                TEXT PRIMARY KEY,
  conversation_id        TEXT NOT NULL REFERENCES conversations (conversation_id),
  client_turn_id         TEXT NOT NULL,
  speaker                TEXT NOT NULL CHECK (speaker IN ('user', 'assistant')),
  text                   TEXT NOT NULL,
  captured_at            TEXT,
  sequence               INTEGER,
  parent_client_turn_id  TEXT,
  message_type           TEXT,
  topic                  TEXT,
  capture_client         TEXT NOT NULL,
  capture_client_version TEXT,
  surface                TEXT,
  captured_batch_id      TEXT,
  created_at             TEXT NOT NULL,
  UNIQUE (conversation_id, client_turn_id)
);

CREATE INDEX idx_turns_conversation_sequence
  ON turns (conversation_id, sequence);
