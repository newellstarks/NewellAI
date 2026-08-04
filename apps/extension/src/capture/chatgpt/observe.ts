import type { Speaker } from "@newellai/contracts";
import {
  CAPTURE_STABILITY_MS,
  OBSERVER_DEBOUNCE_MS,
  PERIODIC_RESCAN_MS,
} from "../constants";
import {
  conversationIdFromUrl,
  extractRawMessages,
  selectCompletedCandidates,
} from "./adapter";
import type { StabilityTracker } from "./completion";
import { assignSourceKeys, isValidSourceProvidedId } from "./identity";
import { CAPTURE_ENQUEUE_TYPE } from "../messaging";

/**
 * Page-session observation: MutationObserver + bounded rescans +
 * conversation_id buffering (docs/CaptureClient.md).
 */

export interface CaptureEnqueuePayload {
  type: typeof CAPTURE_ENQUEUE_TYPE;
  conversation_id: string;
  source_key: string;
  speaker: Speaker;
  text: string;
  captured_at: string;
}

export type EnqueueSender = (payload: CaptureEnqueuePayload) => void | Promise<void>;

export interface ObserveCandidate {
  speaker: Speaker;
  text: string;
  sourceProvidedId: string | null;
}

export interface ObserveDeps {
  document: Document;
  getHref: () => string;
  isCaptureEnabled: () => boolean;
  sendEnqueue: EnqueueSender;
  now?: () => number;
  stabilityMs?: number;
  debounceMs?: number;
  rescanMs?: number;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
  setInterval?: typeof setInterval;
  clearInterval?: typeof clearInterval;
}

export interface ChatgptObserver {
  start: () => void;
  stop: () => void;
  rescan: () => Promise<void>;
  resetSession: () => void;
}

/**
 * Coalesce a candidate list for buffer/flush:
 * - validated source-provided ids: first occurrence wins (dedupe by id)
 * - missing source ids: keep every entry in order (no speaker+text collapse)
 */
export function coalesceCandidates(
  candidates: ObserveCandidate[],
): ObserveCandidate[] {
  const out: ObserveCandidate[] = [];
  const seenSourceIds = new Set<string>();
  for (const c of candidates) {
    if (isValidSourceProvidedId(c.sourceProvidedId)) {
      const id = c.sourceProvidedId.trim();
      if (seenSourceIds.has(id)) continue;
      seenSourceIds.add(id);
      out.push({ ...c, sourceProvidedId: id });
      continue;
    }
    out.push({
      speaker: c.speaker,
      text: c.text,
      sourceProvidedId: null,
    });
  }
  return out;
}

export function createChatgptObserver(deps: ObserveDeps): ChatgptObserver {
  const now = deps.now ?? Date.now;
  const stabilityMs = deps.stabilityMs ?? CAPTURE_STABILITY_MS;
  const debounceMs = deps.debounceMs ?? OBSERVER_DEBOUNCE_MS;
  const rescanMs = deps.rescanMs ?? PERIODIC_RESCAN_MS;
  const schedule = deps.setTimeout ?? setTimeout;
  const clearSchedule = deps.clearTimeout ?? clearTimeout;
  const interval = deps.setInterval ?? setInterval;
  const clearIntervalFn = deps.clearInterval ?? clearInterval;

  const tracker: StabilityTracker = new Map();
  /** Snapshot of completed turns while waiting for /c/<id>. */
  let buffered: ObserveCandidate[] = [];
  let lastHref = deps.getHref();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let periodicTimer: ReturnType<typeof setInterval> | null = null;
  let observer: MutationObserver | null = null;
  let running = false;

  function resetSession(): void {
    tracker.clear();
    buffered = [];
  }

  async function flushCompleted(
    conversationId: string,
    candidates: ObserveCandidate[],
  ): Promise<void> {
    if (candidates.length === 0) return;
    const keyed = await assignSourceKeys(conversationId, candidates);
    const captured_at = new Date(now()).toISOString();
    for (const turn of keyed) {
      await deps.sendEnqueue({
        type: CAPTURE_ENQUEUE_TYPE,
        conversation_id: conversationId,
        source_key: turn.source_key,
        speaker: turn.speaker,
        text: turn.text,
        captured_at,
      });
    }
  }

  async function rescan(): Promise<void> {
    if (!deps.isCaptureEnabled()) return;

    const href = deps.getHref();
    if (href !== lastHref) {
      const prevId = conversationIdFromUrl(lastHref);
      const nextId = conversationIdFromUrl(href);
      // Preserve buffer/tracker when URL first gains /c/<id> (null → id).
      // Reset when switching conversations or leaving one.
      const graduating = prevId === null && nextId !== null;
      if (prevId !== nextId && !graduating) {
        resetSession();
      }
      lastHref = href;
    }

    const conversationId = conversationIdFromUrl(href);
    const raw = extractRawMessages(deps.document);
    const completed = coalesceCandidates(
      selectCompletedCandidates(raw, tracker, now(), stabilityMs),
    );

    if (conversationId === null) {
      // Replace snapshot — do not accumulate across rescans (would multiply
      // missing-id turns). coalesce already preserves duplicate texts once.
      buffered = completed;
      return;
    }

    // Prefer the current DOM scan; fall back to buffer if the DOM briefly
    // has no completed nodes when /c/<id> first appears.
    const toSend = completed.length > 0 ? completed : coalesceCandidates(buffered);
    buffered = [];
    await flushCompleted(conversationId, toSend);
  }

  function scheduleRescan(): void {
    if (debounceTimer !== null) clearSchedule(debounceTimer);
    debounceTimer = schedule(() => {
      debounceTimer = null;
      void rescan();
    }, debounceMs);
  }

  function start(): void {
    if (running) return;
    running = true;
    lastHref = deps.getHref();
    observer = new MutationObserver(() => scheduleRescan());
    const root = deps.document.body ?? deps.document.documentElement;
    if (root) {
      observer.observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
    periodicTimer = interval(() => {
      if (deps.document.visibilityState === "hidden") return;
      void rescan();
    }, rescanMs);
    void rescan();
  }

  function stop(): void {
    running = false;
    observer?.disconnect();
    observer = null;
    if (debounceTimer !== null) clearSchedule(debounceTimer);
    debounceTimer = null;
    if (periodicTimer !== null) clearIntervalFn(periodicTimer);
    periodicTimer = null;
  }

  return { start, stop, rescan, resetSession };
}
