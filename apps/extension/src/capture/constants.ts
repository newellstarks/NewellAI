/**
 * Shared capture bounds and ChatGPT origins (docs/CaptureClient.md Slice 2).
 */

export const CHATGPT_ORIGINS = [
  "https://chatgpt.com",
  "https://chat.openai.com",
] as const;

export const CAPTURE_STABILITY_MS = 1_000;
export const OBSERVER_DEBOUNCE_MS = 300;
export const PERIODIC_RESCAN_MS = 2_000;

/** Conversation / identity field bounds for the SW message bridge. */
export const MAX_CONVERSATION_ID_LENGTH = 128;
export const MAX_TURN_TEXT_LENGTH = 100_000;
export const MAX_USER_ID_LENGTH = 128;

export const CAPTURE_CLIENT = "chrome-extension";
export const CAPTURE_CLIENT_VERSION = "0.1.0";
export const CAPTURE_SURFACE = "chatgpt";

export const DEFAULT_USER_ID = "user-1";
