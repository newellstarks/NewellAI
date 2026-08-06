/** Worker bindings. */
export interface Env {
  /** Shared secret for `Authorization: Bearer` on protected routes. */
  CAPTURE_API_TOKEN?: string;
  /** D1 database (binding `DB` in wrangler.toml). */
  DB?: D1Database;
  /**
   * Local-only pairing: must be the string `"true"` to enable POST /v1/dev/pair.
   * Never enable on remote / production deployments.
   */
  ALLOW_LOCAL_PAIRING?: string;
  /**
   * Exact Origin allowed to pair, e.g. `chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef`.
   * No wildcards.
   */
  PAIRING_EXTENSION_ORIGIN?: string;
  /**
   * Max artifact bytes (decimal string). Default 26214400 (25 MiB).
   */
  ARTIFACT_MAX_BYTES?: string;
  /**
   * Filesystem root for local object storage (ADR-0007).
   * Prefer an absolute path. Relative values resolve via path.resolve(cwd).
   * Default absolute: `<cwd>/.data/artifacts`.
   */
  ARTIFACT_DATA_ROOT?: string;
  /**
   * Storage backend selector:
   * - unset / `"local"` — direct LocalFs (Node tests)
   * - `"bridge"` — host disk via ARTIFACT_FS_BRIDGE_URL (Wrangler local)
   * - `"memory"` — in-process only (unit tests; lost on restart)
   */
  ARTIFACT_STORAGE_MODE?: string;
  /**
   * Base URL for the host artifact-fs-bridge (e.g. http://127.0.0.1:8791).
   * When set, PUT/GET use the bridge (same absolute ARTIFACT_DATA_ROOT on disk).
   */
  ARTIFACT_FS_BRIDGE_URL?: string;
  /**
   * Static assets binding for Desktop Recall UI (`/recall/*`).
   * Bound via wrangler `[assets]`; optional in unit tests.
   */
  ASSETS?: Fetcher;
}
