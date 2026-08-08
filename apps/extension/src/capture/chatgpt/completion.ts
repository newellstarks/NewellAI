/**
 * Assistant completion detection (docs/CaptureClient.md).
 * Complete only when: no stop/generating affordance, no streaming marker,
 * and normalized text unchanged for >= CAPTURE_STABILITY_MS.
 *
 * Image-only assistants (empty / chrome-only text + image attachment) use
 * the same stability window against GENERATED_IMAGE_TEXT.
 */

/** Stable enqueue text for user image-only uploads (no caption). */
export const IMAGE_ATTACHMENT_TEXT = "[image attachment]";

/** Stable enqueue text for assistant generated-image turns with no useful caption. */
export const GENERATED_IMAGE_TEXT = "[generated image]";

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
 * Callers must pass chrome-stripped text (not raw "ChatGPT said:" labels).
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
        ? GENERATED_IMAGE_TEXT
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
