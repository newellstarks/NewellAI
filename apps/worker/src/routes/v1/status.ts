import type { SystemStatusResponse } from "@newellai/contracts";
import { requireRecallRead } from "../../auth";
import { getSystemStatus } from "../../db/status";
import type { Env } from "../../env";
import { HttpError, jsonResponse } from "../../errors";

/**
 * GET /v1/status — capture-system health aggregates (Desktop Recall v1).
 */

export async function handleStatus(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== "GET") {
    throw new HttpError("METHOD_NOT_ALLOWED", "Use GET for /v1/status");
  }

  await requireRecallRead(request, env.CAPTURE_API_TOKEN);

  const body = await getSystemStatus(env);
  const response: SystemStatusResponse = {
    ...body,
    server_time: new Date().toISOString(),
  };
  return jsonResponse(response, 200);
}
