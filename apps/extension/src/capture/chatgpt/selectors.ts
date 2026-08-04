/**
 * ChatGPT DOM selectors — isolated here (docs/CaptureClient.md).
 * Ordered fallbacks; live DOM may use any tier.
 */

export const MESSAGE_ROOT_SELECTORS = [
  "[data-message-author-role]",
  'article[data-testid^="conversation-turn-"]',
  '[data-testid*="conversation-turn"]',
  ".group\\/conversation-turn",
] as const;

export const CONTENT_SELECTORS = [
  ".whitespace-pre-wrap",
  ".markdown",
  "[data-message-content]",
] as const;

/** Stop / generating affordances commonly present while the assistant streams. */
export const STOP_AFFORDANCE_SELECTORS = [
  'button[aria-label*="Stop"]',
  'button[aria-label*="stop"]',
  'button[data-testid="stop-button"]',
  '[data-testid="stop-button"]',
] as const;

export const STREAMING_MARKER_SELECTORS = [
  '[data-testid="streaming-indicator"]',
  '[aria-busy="true"]',
  ".result-streaming",
  "[data-is-streaming=\"true\"]",
] as const;
