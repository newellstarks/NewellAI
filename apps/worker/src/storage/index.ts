import path from "node:path";
import type { Env } from "../env";
import { LocalFsObjectStorage } from "./localFs";
import { memoryStoreForEnv, type ObjectStorage } from "./types";

export type { ObjectStorage, StoredObject } from "./types";
export { MemoryObjectStorage } from "./types";

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

export function artifactMaxBytes(env: Env): number {
  const raw = env.ARTIFACT_MAX_BYTES;
  if (raw === undefined || raw.trim() === "") return DEFAULT_MAX_BYTES;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_BYTES;
  return n;
}

export function resolveObjectStorage(env: Env): ObjectStorage {
  if (env.ARTIFACT_STORAGE_MODE === "memory") {
    return memoryStoreForEnv(env);
  }
  const root =
    env.ARTIFACT_DATA_ROOT !== undefined && env.ARTIFACT_DATA_ROOT.length > 0
      ? env.ARTIFACT_DATA_ROOT
      : path.resolve(process.cwd(), ".data", "artifacts");
  return new LocalFsObjectStorage(root);
}

/** Immutable opaque object key — never reuse for different bytes. */
export function objectKeyForArtifact(
  artifactId: string,
  checksumHex: string,
): string {
  return `${artifactId}-${checksumHex.slice(0, 16)}`;
}
