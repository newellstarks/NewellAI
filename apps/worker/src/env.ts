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
}
