import type { Speaker } from "@newellai/contracts";
import { stripAssistantChromeText } from "./chromeText";
import {
  evaluateAssistantCompletion,
  evaluateUserCompletionWithAttachment,
  GENERATED_IMAGE_TEXT,
  IMAGE_ATTACHMENT_TEXT,
  type StabilityTracker,
} from "./completion";
import { normalizePlainText } from "./normalize";
import { turnHasImageAttachment } from "./images";
import {
  CONTENT_SELECTORS,
  MESSAGE_ROOT_SELECTORS,
  STOP_AFFORDANCE_SELECTORS,
  STREAMING_MARKER_SELECTORS,
} from "./selectors";

/**
 * ChatGPT capture adapter — DOM → completed turn candidates.
 * Selectors and completion probes live only here.
 */

export interface RawMessageNode {
  speaker: Speaker;
  text: string;
  sourceProvidedId: string | null;
  /** Stable tracker key for assistant stability (DOM order index + id). */
  trackKey: string;
  flags: {
    hasStopAffordance: boolean;
    hasStreamingMarker: boolean;
  };
  /** Present when extracted from a live Document (not fixtures). */
  element?: Element;
}

export interface CompletedCandidate {
  speaker: Speaker;
  text: string;
  sourceProvidedId: string | null;
  element?: Element;
}

function queryAll(root: ParentNode, selectors: readonly string[]): Element[] {
  const seen = new Set<Element>();
  const out: Element[] = [];
  for (const sel of selectors) {
    let matched: NodeListOf<Element>;
    try {
      matched = root.querySelectorAll(sel);
    } catch {
      continue;
    }
    for (const el of Array.from(matched)) {
      if (seen.has(el)) continue;
      seen.add(el);
      out.push(el);
    }
  }
  return out;
}

function isVisible(el: Element): boolean {
  if (el.hasAttribute("hidden")) return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  const style = (el as HTMLElement).style;
  if (style?.display === "none" || style?.visibility === "hidden") return false;
  return true;
}

function hasDirectAuthorRole(el: Element): boolean {
  const role = el.getAttribute("data-message-author-role");
  return role === "user" || role === "assistant";
}

function hasDataTurn(el: Element): boolean {
  const turn = el.getAttribute("data-turn");
  return turn === "user" || turn === "assistant";
}

function isScreenshotContent(el: Element): boolean {
  return el.hasAttribute("data-conversation-screenshot-content");
}

/**
 * Resolve speaker for a message/turn root.
 * Author-role wins; then data-turn; then screenshot-content image hosts
 * (never tool-only text, never user-turn screenshot).
 */
export function roleFromElement(el: Element): Speaker | null {
  const role =
    el.getAttribute("data-message-author-role") ??
    el.getAttribute("data-author-role") ??
    el.getAttribute("data-role");
  if (role === "user" || role === "assistant") return role;

  // Nested author-role (user/assistant only — tool/system do not claim the turn).
  const nested = el.querySelector("[data-message-author-role]");
  if (nested) {
    const nestedRole = nested.getAttribute("data-message-author-role");
    if (nestedRole === "user" || nestedRole === "assistant") return nestedRole;
  }

  const turn = el.getAttribute("data-turn");
  if (turn === "user" || turn === "assistant") return turn;

  if (isScreenshotContent(el)) {
    if (
      el.closest('[data-turn="user"]') ||
      el.closest('[data-message-author-role="user"]')
    ) {
      return null;
    }
    if (turnHasImageAttachment(el)) return "assistant";
  }

  return null;
}

function sourceIdFromElement(el: Element): string | null {
  const direct =
    el.getAttribute("data-message-id") ??
    el.getAttribute("data-messageid") ??
    null;
  if (direct && direct.trim().length > 0) return direct.trim();

  const nested = el.querySelector("[data-message-id]");
  const nestedId = nested?.getAttribute("data-message-id");
  if (nestedId && nestedId.trim().length > 0) return nestedId.trim();
  return null;
}

function textFromElement(el: Element): string {
  for (const sel of CONTENT_SELECTORS) {
    const node = el.querySelector(sel);
    if (node?.textContent) {
      const t = normalizePlainText(node.textContent);
      if (t.length > 0) return t;
    }
  }
  return normalizePlainText(el.textContent ?? "");
}

function pageHasStopAffordance(doc: ParentNode): boolean {
  return queryAll(doc, STOP_AFFORDANCE_SELECTORS).some(isVisible);
}

function elementHasStreamingMarker(el: Element): boolean {
  for (const sel of STREAMING_MARKER_SELECTORS) {
    try {
      if (el.matches(sel) || el.querySelector(sel)) return true;
    } catch {
      /* some hosts reject case-insensitive attribute selectors */
    }
  }
  return false;
}

/**
 * Collect visible user/assistant message roots in document order.
 * Skips tool/system roles and non-visible nodes.
 *
 * Preference:
 * 1. Deepest direct author-role (user/assistant)
 * 2. data-turn root over nested screenshot-content (keeps image on turn)
 * 3. Standalone screenshot-content image host as assistant when needed
 */
export function extractRawMessages(root: ParentNode): RawMessageNode[] {
  const candidates = queryAll(root, MESSAGE_ROOT_SELECTORS).filter(isVisible);
  const filtered = candidates.filter((el) => {
    const role = roleFromElement(el);
    if (role === null) return false;

    for (const other of candidates) {
      if (other === el) continue;

      // Prefer enclosing data-turn=assistant over nested screenshot host.
      if (
        isScreenshotContent(el) &&
        hasDataTurn(other) &&
        other.contains(el) &&
        roleFromElement(other) !== null
      ) {
        return false;
      }

      if (!el.contains(other) || roleFromElement(other) === null) continue;

      // Nested author-role speaker wins over wrappers (including data-turn).
      if (hasDirectAuthorRole(other)) return false;

      // Keep data-turn root when the only nested candidate is screenshot-content
      // (do not collapse to a host that loses turn identity / siblings).
      if (hasDataTurn(el) && isScreenshotContent(other)) continue;

      // Assistant data-turn with image: do not collapse to a narrower nested
      // root that lacks the image attachment (e.g. empty role-less shells).
      if (
        hasDataTurn(el) &&
        el.getAttribute("data-turn") === "assistant" &&
        turnHasImageAttachment(el) &&
        !turnHasImageAttachment(other) &&
        !hasDirectAuthorRole(other)
      ) {
        continue;
      }

      // Default: deepest role-bearing candidate wins.
      return false;
    }
    return true;
  });

  const stopGlobal = pageHasStopAffordance(root);
  const out: RawMessageNode[] = [];
  let index = 0;
  for (const el of filtered) {
    const speaker = roleFromElement(el);
    if (speaker === null) continue;
    const text = textFromElement(el);
    const sourceProvidedId = sourceIdFromElement(el);
    const streaming = elementHasStreamingMarker(el);
    // Stop affordance applies to the in-progress assistant reply (typically last).
    const hasStop =
      speaker === "assistant" && stopGlobal && isLastAssistant(filtered, el);
    out.push({
      speaker,
      text,
      sourceProvidedId,
      trackKey: sourceProvidedId ?? `dom:${index}`,
      flags: {
        hasStopAffordance: hasStop,
        hasStreamingMarker: streaming,
      },
      element: el,
    });
    index += 1;
  }
  return out;
}

function isLastAssistant(nodes: Element[], el: Element): boolean {
  let lastAssistant: Element | null = null;
  for (const n of nodes) {
    if (roleFromElement(n) === "assistant") lastAssistant = n;
  }
  return lastAssistant === el;
}

/**
 * Filter raw messages to completed candidates using stability tracking.
 */
export function selectCompletedCandidates(
  messages: RawMessageNode[],
  tracker: StabilityTracker,
  nowMs: number,
  stabilityMs: number,
): CompletedCandidate[] {
  const completed: CompletedCandidate[] = [];
  for (const msg of messages) {
    if (msg.speaker === "user") {
      const hasImage =
        msg.element !== undefined && turnHasImageAttachment(msg.element);
      if (!evaluateUserCompletionWithAttachment(msg.text, hasImage)) continue;
      // Capture enqueue requires non-empty text; image-only uses a stable marker.
      const text =
        msg.text.length > 0 ? msg.text : IMAGE_ATTACHMENT_TEXT;
      completed.push({
        speaker: msg.speaker,
        text,
        sourceProvidedId: msg.sourceProvidedId,
        ...(msg.element !== undefined ? { element: msg.element } : {}),
      });
      continue;
    }
    const hasImage =
      msg.element !== undefined && turnHasImageAttachment(msg.element);
    // Never stabilize/enqueue ChatGPT chrome as semantic turn text.
    const cleaned = stripAssistantChromeText(msg.text);
    const done = evaluateAssistantCompletion(
      msg.trackKey,
      cleaned,
      msg.flags,
      tracker,
      nowMs,
      stabilityMs,
      hasImage,
    );
    if (!done) continue;
    const text =
      cleaned.length > 0
        ? cleaned
        : hasImage
          ? GENERATED_IMAGE_TEXT
          : IMAGE_ATTACHMENT_TEXT;
    completed.push({
      speaker: msg.speaker,
      text,
      sourceProvidedId: msg.sourceProvidedId,
      ...(msg.element !== undefined ? { element: msg.element } : {}),
    });
  }
  return completed;
}

/** Extract conversation_id from a ChatGPT URL path `/c/<id>`. */
export function conversationIdFromUrl(href: string): string | null {
  try {
    const url = new URL(href);
    const match = url.pathname.match(/\/c\/([A-Za-z0-9_-]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}
