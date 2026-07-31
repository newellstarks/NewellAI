/** Worker bindings for the authentication slice. */
export interface Env {
  /** Shared secret for `Authorization: Bearer` on protected routes. */
  CAPTURE_API_TOKEN?: string;
}
