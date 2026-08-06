/**
 * Assistant completion detection (docs/CaptureClient.md).
 * Complete only when: no stop/generating affordance, no streaming marker,
 * and normalized text unchanged for >= CAPTURE_STABILITY_MS.
 *
 * Image-only assistants (empty text + image attachment) use the same
 * stability window against the IMAGE_ATTACHMENT_TEXT marker.
 */

/** Stable enqueue text when a turn has an image and no caption/body text. */
export const IMAGE_ATTACHMENT_TEXT = "[image attachment]";

export interface CompletionFlags {
  hasStopAffordance: boolean;
  hasStreamingMarker: boolean;
}

export interface StabilityEntry {
  text: string;
  since: number;
}

export type StabilityTracker = Map<string, StabilityEntry>;

/**
 * Assistant completion with optional image-only support.
 * Streaming/stop still hard-block. Empty text completes only when
 * `hasImageAttachment` is true (after the usual stability window).
 */
export function evaluateAssistantCompletion(
  trackKey: string,
  normalizedText: string,
  flags: CompletionFlags,
  tracker: StabilityTracker,
  nowMs: number,
  stabilityMs: number,
  hasImageAttachment = false,
): boolean {
  if (flags.hasStopAffordance || flags.hasStreamingMarker) {
    tracker.delete(trackKey);
    return false;
  }
  const effectiveText =
    normalizedText.length > 0
      ? normalizedText
      : hasImageAttachment
        ? IMAGE_ATTACHMENT_TEXT
        : "";
  if (effectiveText.length === 0) {
    tracker.delete(trackKey);
    return false;
  }
  const prev = tracker.get(trackKey);
  if (prev === undefined || prev.text !== effectiveText) {
    tracker.set(trackKey, { text: effectiveText, since: nowMs });
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
