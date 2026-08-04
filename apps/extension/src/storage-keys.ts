/** chrome.storage.local keys shared by options, SW, and content scripts. */
export const STORAGE_KEYS = {
  baseUrl: "worker_base_url",
  token: "capture_api_token",
  captureEnabled: "capture_chatgpt_enabled",
  userId: "user_id",
} as const;
