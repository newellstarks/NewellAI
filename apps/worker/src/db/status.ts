import type {
  ArtifactStatusCounts,
  StorageStatusInfo,
  SystemStatusResponse,
} from "@newellai/contracts";
import type { Env } from "../env";
import { HttpError } from "../errors";
import {
  artifactStorageMode,
  resolveArtifactDataRoot,
  resolveObjectStorage,
} from "../storage";

/**
 * Capture-system health aggregates for GET /v1/status (Desktop Recall v1).
 */

function requireDb(db: D1Database | undefined): D1Database {
  if (db === undefined) {
    console.error("DB_CONFIGURATION_MISSING");
    throw new HttpError("INTERNAL_ERROR", "Unexpected server error");
  }
  return db;
}

interface CountRow {
  n: number;
}

interface MaxRow {
  max_at: string | null;
}

interface StatusCountRow {
  capture_status: string;
  n: number;
}

interface StoredLocRow {
  storage_location: string | null;
}

export async function getSystemStatus(
  env: Env,
): Promise<Omit<SystemStatusResponse, "server_time">> {
  const database = requireDb(env.DB);

  const conversations = await database
    .prepare(`SELECT COUNT(*) AS n FROM conversations`)
    .first<CountRow>();
  const turns = await database
    .prepare(`SELECT COUNT(*) AS n FROM turns`)
    .first<CountRow>();
  const lastTurn = await database
    .prepare(`SELECT MAX(created_at) AS max_at FROM turns`)
    .first<MaxRow>();
  const lastArtifact = await database
    .prepare(`SELECT MAX(created_at) AS max_at FROM artifacts`)
    .first<MaxRow>();
  const { results: statusRows } = await database
    .prepare(
      `SELECT capture_status, COUNT(*) AS n
         FROM artifacts
        GROUP BY capture_status`,
    )
    .all<StatusCountRow>();

  const artifacts: ArtifactStatusCounts = {
    stored: 0,
    pending_download: 0,
    failed_download: 0,
    other: 0,
    bytes_missing: 0,
  };
  for (const row of statusRows) {
    const n = Number(row.n) || 0;
    if (row.capture_status === "stored") artifacts.stored += n;
    else if (row.capture_status === "pending_download") {
      artifacts.pending_download += n;
    } else if (row.capture_status === "failed_download") {
      artifacts.failed_download += n;
    } else {
      artifacts.other += n;
    }
  }

  const storageMode = artifactStorageMode(env);
  let storageAvailable = true;
  const storage: StorageStatusInfo = {
    mode: storageMode === "bridge" ? "bridge" : storageMode,
    root:
      storageMode === "memory" ? null : resolveArtifactDataRoot(env),
    available: true,
  };

  if (artifacts.stored > 0) {
    const { results: storedRows } = await database
      .prepare(
        `SELECT storage_location FROM artifacts WHERE capture_status = 'stored'`,
      )
      .all<StoredLocRow>();
    const objectStorage = resolveObjectStorage(env);
    for (const row of storedRows) {
      const loc = row.storage_location;
      if (loc === null || loc.length === 0) {
        artifacts.bytes_missing += 1;
        continue;
      }
      if (!storageAvailable) {
        // Bridge/storage unreachable — skip further probes; status still 200.
        artifacts.bytes_missing += 1;
        continue;
      }
      try {
        const head = await objectStorage.head(loc);
        if (head === null) artifacts.bytes_missing += 1;
      } catch {
        // Do not fail GET /v1/status when the FS bridge is down.
        storageAvailable = false;
        artifacts.bytes_missing += 1;
      }
    }
  }

  storage.available = storageAvailable;

  return {
    conversation_count: Number(conversations?.n ?? 0),
    turn_count: Number(turns?.n ?? 0),
    artifacts,
    storage,
    last_turn_at: lastTurn?.max_at ?? null,
    last_artifact_at: lastArtifact?.max_at ?? null,
  };
}
