/**
 * Server-generated request id for `/v1/turns`.
 * Always a fresh UUID — never derived from the body, Authorization, or client headers.
 * Client-supplied `X-Request-Id` is ignored (overwritten on the response).
 */
export function createRequestId(): string {
  return crypto.randomUUID();
}

export function withRequestId(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Request-Id", requestId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
