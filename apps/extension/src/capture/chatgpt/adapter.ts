import type { Speaker } from "@newellai/contracts";
import {
  evaluateAssistantCompletion,
  evaluateUserCompletion,
  type StabilityTracker,
} from "./completion";
import { normalizePlainText } from "./normalize";
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
}

export interface CompletedCandidate {
  speaker: Speaker;
  text: string;
  sourceProvidedId: string | null;
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

function roleFromElement(el: Element): Speaker | null {
  const role =
    el.getAttribute("data-message-author-role") ??
    el.getAttribute("data-author-role") ??
    el.getAttribute("data-role");
  if (role === "user" || role === "assistant") return role;

  // article[data-testid=conversation-turn-…] — look for nested role.
  const nested = el.querySelector("[data-message-author-role]");
  if (nested) {
    const nestedRole = nested.getAttribute("data-message-author-role");
    if (nestedRole === "user" || nestedRole === "assistant") return nestedRole;
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
 */
export function extractRawMessages(root: ParentNode): RawMessageNode[] {
  const candidates = queryAll(root, MESSAGE_ROOT_SELECTORS).filter(isVisible);
  // Prefer deepest message nodes with author role to avoid double-counting
  // article wrappers that also match.
  const filtered = candidates.filter((el) => {
    const role = roleFromElement(el);
    if (role === null) return false;
    // Drop wrappers that contain another matching message root with a role.
    for (const other of candidates) {
      if (other === el) continue;
      if (el.contains(other) && roleFromElement(other) !== null) return false;
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
      if (!evaluateUserCompletion(msg.text)) continue;
      completed.push({
        speaker: msg.speaker,
        text: msg.text,
        sourceProvidedId: msg.sourceProvidedId,
      });
      continue;
    }
    const done = evaluateAssistantCompletion(
      msg.trackKey,
      msg.text,
      msg.flags,
      tracker,
      nowMs,
      stabilityMs,
    );
    if (!done) continue;
    completed.push({
      speaker: msg.speaker,
      text: msg.text,
      sourceProvidedId: msg.sourceProvidedId,
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
