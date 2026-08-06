export function normalizeToken(
  raw: string,
): { ok: true; token: string } | { ok: false; error: string };

export function buildAuthorizationHeader(
  token: string,
): { ok: true; authorization: string } | { ok: false; error: string };
