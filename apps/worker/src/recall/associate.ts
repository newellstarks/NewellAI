/**
 * Associate artifacts to turns for Desktop Recall conversation UI.
 * Prefer turn_id when present; otherwise fall back to client_turn_id.
 * Artifacts that match neither key are returned as unlinked.
 * (Mirrored in public/recall/app.js — keep behavior aligned.)
 */

export interface TurnKey {
  turn_id: string;
  client_turn_id: string;
}

export interface ArtifactLinkKey {
  turn_id: string | null;
  client_turn_id: string;
  artifact_id?: string;
}

export interface AssociateResult<TTurn extends TurnKey, TArt extends ArtifactLinkKey> {
  rows: Array<{ turn: TTurn; artifacts: TArt[] }>;
  unlinked: TArt[];
  /** Safe counts only — no identifiers or URLs. */
  diagnostics: {
    artifactCount: number;
    linkedCount: number;
    unlinkedCount: number;
    withTurnId: number;
    withClientTurnId: number;
    turnIdNull: number;
  };
}

export function associateArtifactsToTurns<
  TTurn extends TurnKey,
  TArt extends ArtifactLinkKey,
>(
  turns: TTurn[],
  artifacts: TArt[],
): AssociateResult<TTurn, TArt> {
  const byTurnId = new Map<string, TArt[]>();
  const byClientTurnId = new Map<string, TArt[]>();
  let withTurnId = 0;
  let withClientTurnId = 0;
  let turnIdNull = 0;

  for (const art of artifacts) {
    if (art.turn_id) {
      withTurnId += 1;
      const list = byTurnId.get(art.turn_id) ?? [];
      list.push(art);
      byTurnId.set(art.turn_id, list);
    } else {
      turnIdNull += 1;
    }
    if (art.client_turn_id) {
      withClientTurnId += 1;
      const list = byClientTurnId.get(art.client_turn_id) ?? [];
      list.push(art);
      byClientTurnId.set(art.client_turn_id, list);
    }
  }

  const claimed = new Set<TArt>();
  const rows = turns.map((turn) => {
    const matched: TArt[] = [];
    for (const art of byTurnId.get(turn.turn_id) ?? []) {
      if (!claimed.has(art)) {
        matched.push(art);
        claimed.add(art);
      }
    }
    if (matched.length === 0) {
      for (const art of byClientTurnId.get(turn.client_turn_id) ?? []) {
        if (!claimed.has(art)) {
          matched.push(art);
          claimed.add(art);
        }
      }
    }
    return { turn, artifacts: matched };
  });

  const unlinked = artifacts.filter((art) => !claimed.has(art));
  return {
    rows,
    unlinked,
    diagnostics: {
      artifactCount: artifacts.length,
      linkedCount: claimed.size,
      unlinkedCount: unlinked.length,
      withTurnId,
      withClientTurnId,
      turnIdNull,
    },
  };
}
