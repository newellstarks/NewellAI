/**
 * Strip ChatGPT UI chrome from assistant turn text so durable turns
 * never store labels like "ChatGPT said:" or "Worked for 37s".
 */

import { normalizePlainText } from "./normalize";

/** Timing chrome: "Worked for 37s", "Thinking for 2 seconds", etc. */
const TIMING_CHROME_RE =
  /\b(?:Worked|Thinking|Thought|Generating|Searched) for \d+\s*(?:s|sec|secs|second|seconds)?\b/gi;

/** Leading role label injected by the ChatGPT UI. */
const CHATGPT_SAID_RE = /^ChatGPT said:\s*/i;

/**
 * Remove known ChatGPT chrome. Returns normalized remainder, or "" when
 * nothing semantic remains.
 */
export function stripAssistantChromeText(raw: string): string {
  let t = normalizePlainText(raw);
  if (t.length === 0) return "";

  t = t.replace(CHATGPT_SAID_RE, "");
  t = t.replace(TIMING_CHROME_RE, "");
  // Chrome glued without a space: "ChatGPT said:Worked for 37s"
  t = t.replace(CHATGPT_SAID_RE, "");
  t = normalizePlainText(t);

  if (t.length === 0) return "";
  // Entire remainder still only chrome (e.g. repeated timing fragments).
  const again = normalizePlainText(
    t.replace(CHATGPT_SAID_RE, "").replace(TIMING_CHROME_RE, ""),
  );
  if (again.length === 0) return "";
  if (/^ChatGPT said:?$/i.test(again)) return "";
  return again;
}

/** True when text is empty or only ChatGPT UI chrome. */
export function isAssistantChromeOnlyText(raw: string): boolean {
  return stripAssistantChromeText(raw).length === 0;
}
