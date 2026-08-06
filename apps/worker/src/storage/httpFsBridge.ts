import type { ObjectStorage, StoredObject } from "./types";

/**
 * ObjectStorage over the local Node artifact-fs-bridge (host disk).
 * Used when workerd cannot write ARTIFACT_DATA_ROOT directly.
 */
export class HttpFsBridgeObjectStorage implements ObjectStorage {
  constructor(private readonly baseUrl: string) {}

  private urlFor(key: string): string {
    if (
      key.includes("/") ||
      key.includes("\\") ||
      key.includes("..") ||
      key.length === 0
    ) {
      throw new Error("invalid object key");
    }
    return `${this.baseUrl.replace(/\/$/, "")}/${encodeURIComponent(key)}`;
  }

  async put(
    key: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<void> {
    const res = await fetch(this.urlFor(key), {
      method: "PUT",
      headers: { "content-type": contentType },
      body: bytes,
    });
    if (!res.ok) {
      throw new Error(`bridge_put_${res.status}`);
    }
  }

  async get(key: string): Promise<StoredObject | null> {
    const res = await fetch(this.urlFor(key), { method: "GET" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`bridge_get_${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    const contentType =
      res.headers.get("content-type")?.split(";")[0]?.trim() ||
      "application/octet-stream";
    return { bytes: buf, contentType, byteSize: buf.byteLength };
  }

  async head(
    key: string,
  ): Promise<{ byteSize: number; contentType: string } | null> {
    const res = await fetch(this.urlFor(key), { method: "HEAD" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`bridge_head_${res.status}`);
    const contentType =
      res.headers.get("content-type")?.split(";")[0]?.trim() ||
      "application/octet-stream";
    const len = res.headers.get("content-length");
    const byteSize = len !== null ? Number.parseInt(len, 10) : 0;
    return { byteSize, contentType };
  }
}
