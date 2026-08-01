/** Worker bindings. */
export interface Env {
  /** Shared secret for `Authorization: Bearer` on protected routes. */
  CAPTURE_API_TOKEN?: string;
  /** D1 database (binding `DB` in wrangler.toml). */
  DB?: D1Database;
}
