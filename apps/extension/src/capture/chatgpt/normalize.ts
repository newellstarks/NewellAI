/**
 * Plain-text normalization for TurnPayload.text (docs/CaptureClient.md).
 * No HTML; consistent form used for storage and synthetic identity.
 */

export function normalizePlainText(raw: string): string {
  return raw
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
