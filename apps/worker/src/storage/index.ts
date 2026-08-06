import path from "node:path";
import type { Env } from "../env";
import { HttpFsBridgeObjectStorage } from "./httpFsBridge";
import { LocalFsObjectStorage } from "./localFs";
import { memoryStoreForEnv, type ObjectStorage } from "./types";

export type { ObjectStorage, StoredObject } from "./types";
export { MemoryObjectStorage } from "./types";

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_BRIDGE_URL = "http://127.0.0.1:8791";

/**
 * Canonical absolute local object root for durable artifact bytes.
 * Relative ARTIFACT_DATA_ROOT values are resolved against process.cwd() once;
 * prefer an absolute path in .dev.vars so restarts cannot silently relocate.
 */
export function resolveArtifactDataRoot(env: Env): string {
  const raw = env.ARTIFACT_DATA_ROOT?.trim();
  if (raw !== undefined && raw.length > 0) {
    return path.resolve(raw);
  }
  return path.resolve(process.cwd(), ".data", "artifacts");
}

export function artifactStorageMode(
  env: Env,
): "memory" | "local" | "bridge" {
  if (env.ARTIFACT_STORAGE_MODE === "memory") return "memory";
  if (
    env.ARTIFACT_STORAGE_MODE === "bridge" ||
    (env.ARTIFACT_FS_BRIDGE_URL !== undefined &&
      env.ARTIFACT_FS_BRIDGE_URL.trim() !== "")
  ) {
    return "bridge";
  }
  return "local";
}

export function resolveArtifactFsBridgeUrl(env: Env): string {
  const raw = env.ARTIFACT_FS_BRIDGE_URL?.trim();
  if (raw !== undefined && raw.length > 0) return raw.replace(/\/$/, "");
  return DEFAULT_BRIDGE_URL;
}

export function artifactMaxBytes(env: Env): number {
  const raw = env.ARTIFACT_MAX_BYTES;
  if (raw === undefined || raw.trim() === "") return DEFAULT_MAX_BYTES;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_BYTES;
  return n;
}

/**
 * Single shared adapter for PUT and GET.
 * - memory: unit tests only (lost on process restart)
 * - bridge: host disk via artifact-fs-bridge (Wrangler/workerd local)
 * - local: direct LocalFs (Node vitest / true Node hosts)
 */
export function resolveObjectStorage(env: Env): ObjectStorage {
  const mode = artifactStorageMode(env);
  if (mode === "memory") {
    return memoryStoreForEnv(env);
  }
  if (mode === "bridge") {
    return new HttpFsBridgeObjectStorage(resolveArtifactFsBridgeUrl(env));
  }
  return new LocalFsObjectStorage(resolveArtifactDataRoot(env));
}

/** Immutable opaque object key — never reuse for different bytes. */
export function objectKeyForArtifact(
  artifactId: string,
  checksumHex: string,
): string {
  return `${artifactId}-${checksumHex.slice(0, 16)}`;
}
