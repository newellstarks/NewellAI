/**
 * Object storage adapter (ADR-0007).
 * Callers never depend on filesystem paths or R2 APIs directly.
 */

export interface StoredObject {
  bytes: Uint8Array;
  contentType: string;
  byteSize: number;
}

export interface ObjectStorage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  head(
    key: string,
  ): Promise<{ byteSize: number; contentType: string } | null>;
}

export class MemoryObjectStorage implements ObjectStorage {
  private readonly objects = new Map<
    string,
    { bytes: Uint8Array; contentType: string }
  >();

  async put(
    key: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<void> {
    this.objects.set(key, {
      bytes: new Uint8Array(bytes),
      contentType,
    });
  }

  async get(key: string): Promise<StoredObject | null> {
    const row = this.objects.get(key);
    if (row === undefined) return null;
    return {
      bytes: new Uint8Array(row.bytes),
      contentType: row.contentType,
      byteSize: row.bytes.byteLength,
    };
  }

  async head(
    key: string,
  ): Promise<{ byteSize: number; contentType: string } | null> {
    const row = this.objects.get(key);
    if (row === undefined) return null;
    return { byteSize: row.bytes.byteLength, contentType: row.contentType };
  }
}

/** Shared memory stores keyed by Env object identity (tests). */
const memoryByEnv = new WeakMap<object, MemoryObjectStorage>();

export function memoryStoreForEnv(env: object): MemoryObjectStorage {
  let store = memoryByEnv.get(env);
  if (store === undefined) {
    store = new MemoryObjectStorage();
    memoryByEnv.set(env, store);
  }
  return store;
}
