/**
 * Assistant completion detection (docs/CaptureClient.md).
 * Complete only when: no stop/generating affordance, no streaming marker,
 * and normalized text unchanged for >= CAPTURE_STABILITY_MS.
 */

export interface CompletionFlags {
  hasStopAffordance: boolean;
  hasStreamingMarker: boolean;
}

export interface StabilityEntry {
  text: string;
  since: number;
}

export type StabilityTracker = Map<string, StabilityEntry>;

export function evaluateAssistantCompletion(
  trackKey: string,
  normalizedText: string,
  flags: CompletionFlags,
  tracker: StabilityTracker,
  nowMs: number,
  stabilityMs: number,
): boolean {
  if (flags.hasStopAffordance || flags.hasStreamingMarker) {
    tracker.delete(trackKey);
    return false;
  }
  if (normalizedText.length === 0) {
    tracker.delete(trackKey);
    return false;
  }
  const prev = tracker.get(trackKey);
  if (prev === undefined || prev.text !== normalizedText) {
    tracker.set(trackKey, { text: normalizedText, since: nowMs });
    return false;
  }
  return nowMs - prev.since >= stabilityMs;
}

/** User turns: complete when committed plain text is present. */
export function evaluateUserCompletion(normalizedText: string): boolean {
  return normalizedText.length > 0;
}

/**
 * User turn with a committed image attachment (including image-only uploads).
 * Text may be empty when the operator uploads an image without a caption.
 */
export function evaluateUserCompletionWithAttachment(
  normalizedText: string,
  hasImageAttachment: boolean,
): boolean {
  return normalizedText.length > 0 || hasImageAttachment;
}
