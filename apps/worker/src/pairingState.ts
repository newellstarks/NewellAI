/**
 * One-shot local pairing latch for the Worker isolate
 * (docs/CaptureClient.md Slice 2.1).
 */

let pairingConsumed = false;

export function isPairingConsumed(): boolean {
  return pairingConsumed;
}

export function markPairingConsumed(): void {
  pairingConsumed = true;
}

/** Test-only reset between cases. */
export function resetPairingStateForTests(): void {
  pairingConsumed = false;
}
