import type { Env } from "../env";
import { HttpError } from "../errors";

/**
 * Serve Desktop Recall static UI from Worker assets under /recall/.
 * Same-origin with /v1/* APIs.
 */

function contentType(pathname: string): string {
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
  if (pathname.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (pathname.endsWith(".html")) return "text/html; charset=utf-8";
  return "application/octet-stream";
}

export async function handleRecallStatic(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    throw new HttpError("METHOD_NOT_ALLOWED", "Use GET for /recall");
  }

  if (env.ASSETS === undefined) {
    throw new HttpError(
      "NOT_FOUND",
      "Recall UI assets are not configured on this Worker",
    );
  }

  let assetPath = pathname;
  if (assetPath === "/recall" || assetPath === "/recall/") {
    assetPath = "/recall/index.html";
  }

  const assetUrl = new URL(assetPath, request.url);
  const assetRequest = new Request(assetUrl.toString(), {
    method: "GET",
    headers: request.headers,
  });
  const assetResponse = await env.ASSETS.fetch(assetRequest);
  if (assetResponse.status === 404) {
    throw new HttpError("NOT_FOUND", `No recall asset for ${pathname}`);
  }

  // Ensure sensible content-types when the asset pipeline omits them.
  const headers = new Headers(assetResponse.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", contentType(assetPath));
  }
  // Avoid caching auth-adjacent UI across token changes during local ops.
  headers.set("cache-control", "no-store");

  return new Response(assetResponse.body, {
    status: assetResponse.status,
    headers,
  });
}
