import {
  mkdir,
  readFile,
  writeFile,
  rename,
  access,
  constants,
} from "node:fs/promises";
import path from "node:path";
import type { ObjectStorage, StoredObject } from "./types";

/**
 * Filesystem-backed object store for local development (ADR-0007).
 * Keys are opaque; bytes live under root/<key> with a sibling .meta.json.
 */

interface MetaFile {
  contentType: string;
  byteSize: number;
}

export class LocalFsObjectStorage implements ObjectStorage {
  /** Always absolute so cwd changes cannot relocate the store. */
  readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private objectPath(key: string): string {
    if (
      key.includes("/") ||
      key.includes("\\") ||
      key.includes("..") ||
      key.length === 0
    ) {
      throw new Error("invalid object key");
    }
    return path.join(this.root, key);
  }

  private metaPath(key: string): string {
    return `${this.objectPath(key)}.meta.json`;
  }

  async put(
    key: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<void> {
    try {
      await mkdir(this.root, { recursive: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("not implemented") || msg.includes("unenv")) {
        throw new Error(
          "LocalFs mkdir unavailable in workerd; use artifact-fs-bridge (ARTIFACT_FS_BRIDGE_URL)",
        );
      }
      throw error;
    }
    const target = this.objectPath(key);
    const tmp = `${target}.tmp`;
    const payload = Buffer.from(bytes);
    await writeFile(tmp, payload);
    await writeFile(
      this.metaPath(key),
      JSON.stringify({
        contentType,
        byteSize: bytes.byteLength,
      } satisfies MetaFile),
    );
    try {
      await rename(tmp, target);
    } catch {
      // workerd/nodejs_compat may not support rename; fall back to copy.
      await writeFile(target, payload);
      try {
        const { unlink } = await import("node:fs/promises");
        await unlink(tmp);
      } catch {
        /* ignore */
      }
    }
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      await access(this.objectPath(key), constants.R_OK);
    } catch {
      return null;
    }
    const bytes = new Uint8Array(await readFile(this.objectPath(key)));
    let contentType = "application/octet-stream";
    try {
      const meta = JSON.parse(
        await readFile(this.metaPath(key), "utf-8"),
      ) as MetaFile;
      contentType = meta.contentType;
    } catch {
      /* meta optional for recovery */
    }
    return { bytes, contentType, byteSize: bytes.byteLength };
  }

  async head(
    key: string,
  ): Promise<{ byteSize: number; contentType: string } | null> {
    const obj = await this.get(key);
    if (obj === null) return null;
    return { byteSize: obj.byteSize, contentType: obj.contentType };
  }
}
