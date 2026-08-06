import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Env } from "../env";
import {
  objectKeyForArtifact,
  resolveArtifactDataRoot,
  resolveObjectStorage,
} from "./index";
import { LocalFsObjectStorage } from "./localFs";

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("artifact storage root resolution", () => {
  it("resolves relative ARTIFACT_DATA_ROOT to an absolute path", () => {
    const env: Env = { ARTIFACT_DATA_ROOT: ".data/artifacts" };
    const root = resolveArtifactDataRoot(env);
    expect(path.isAbsolute(root)).toBe(true);
    expect(root.endsWith(`${path.sep}.data${path.sep}artifacts`)).toBe(true);
  });

  it("keeps an absolute ARTIFACT_DATA_ROOT stable", () => {
    const abs = path.join(tmpdir(), "newellai-art-root");
    const env: Env = { ARTIFACT_DATA_ROOT: abs };
    expect(resolveArtifactDataRoot(env)).toBe(path.resolve(abs));
  });

  it("PUT and GET share the same absolute LocalFs root", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "newellai-fs-"));
    temps.push(root);
    const env: Env = { ARTIFACT_DATA_ROOT: root };
    const a = resolveObjectStorage(env);
    const b = resolveObjectStorage(env);
    expect(a).toBeInstanceOf(LocalFsObjectStorage);
    expect(b).toBeInstanceOf(LocalFsObjectStorage);
    expect((a as LocalFsObjectStorage).root).toBe(path.resolve(root));
    expect((b as LocalFsObjectStorage).root).toBe((a as LocalFsObjectStorage).root);

    const key = objectKeyForArtifact(
      "11111111-1111-4111-8111-111111111111",
      "abcd".repeat(16),
    );
    const bytes = new Uint8Array([1, 2, 3, 4]);
    await a.put(key, bytes, "image/png");
    const got = await b.get(key);
    expect(got?.byteSize).toBe(4);
    expect([...got!.bytes]).toEqual([1, 2, 3, 4]);
    expect(readFileSync(path.join(root, key)).byteLength).toBe(4);
  });

  it("memory mode is isolated from the filesystem root", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "newellai-mem-"));
    temps.push(root);
    const env: Env = {
      ARTIFACT_DATA_ROOT: root,
      ARTIFACT_STORAGE_MODE: "memory",
    };
    const storage = resolveObjectStorage(env);
    const key = "k-mem";
    await storage.put(key, new Uint8Array([9]), "image/png");
    // No file written under the configured root.
    expect(() => readFileSync(path.join(root, key))).toThrow();
  });

  it("bridge mode selects HttpFsBridge when ARTIFACT_FS_BRIDGE_URL is set", () => {
    const env: Env = {
      ARTIFACT_DATA_ROOT: "/tmp/newellai-art",
      ARTIFACT_FS_BRIDGE_URL: "http://127.0.0.1:8791",
    };
    const storage = resolveObjectStorage(env);
    expect(storage.constructor.name).toBe("HttpFsBridgeObjectStorage");
  });
});
