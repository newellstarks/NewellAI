/**
 * Placeholder Worker entry — no application logic yet.
 * Responsibility: authenticated ingest API, validation, D1 persistence.
 * Durable queue lives in the extension.
 */
export default {
  async fetch(): Promise<Response> {
    return new Response("newellai-worker scaffold", { status: 200 });
  },
};
