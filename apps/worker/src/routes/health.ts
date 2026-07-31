import { jsonResponse } from "../errors";

export function handleHealth(): Response {
  return jsonResponse({ ok: true, service: "newellai-worker" }, 200);
}
