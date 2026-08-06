import { describe, expect, it } from "vitest";
import { associateArtifactsToTurns } from "./associate";

describe("associateArtifactsToTurns", () => {
  it("associates by turn_id when present", () => {
    const { rows, unlinked, diagnostics } = associateArtifactsToTurns(
      [
        { turn_id: "t1", client_turn_id: "c1" },
        { turn_id: "t2", client_turn_id: "c2" },
      ],
      [
        { turn_id: "t2", client_turn_id: "c2", artifact_id: "a2" },
        { turn_id: "t1", client_turn_id: "other", artifact_id: "a1" },
      ],
    );
    expect(rows[0]!.artifacts.map((a) => a.artifact_id)).toEqual(["a1"]);
    expect(rows[1]!.artifacts.map((a) => a.artifact_id)).toEqual(["a2"]);
    expect(unlinked).toHaveLength(0);
    expect(diagnostics.linkedCount).toBe(2);
  });

  it("falls back to client_turn_id when turn_id is null", () => {
    const { rows, unlinked } = associateArtifactsToTurns(
      [{ turn_id: "t9", client_turn_id: "client-x" }],
      [
        {
          turn_id: null,
          client_turn_id: "client-x",
          artifact_id: "a-fallback",
        },
      ],
    );
    expect(rows[0]!.artifacts).toHaveLength(1);
    expect(rows[0]!.artifacts[0]!.artifact_id).toBe("a-fallback");
    expect(unlinked).toHaveLength(0);
  });

  it("falls back to client_turn_id when turn_id is set but does not match any turn", () => {
    const { rows, unlinked } = associateArtifactsToTurns(
      [{ turn_id: "t-real", client_turn_id: "client-x" }],
      [
        {
          turn_id: "t-orphan",
          client_turn_id: "client-x",
          artifact_id: "a-orphan-tid",
        },
      ],
    );
    expect(rows[0]!.artifacts.map((a) => a.artifact_id)).toEqual([
      "a-orphan-tid",
    ]);
    expect(unlinked).toHaveLength(0);
  });

  it("returns unlinked artifacts when neither turn_id nor client_turn_id matches", () => {
    const { rows, unlinked, diagnostics } = associateArtifactsToTurns(
      [{ turn_id: "t1", client_turn_id: "c1" }],
      [
        {
          turn_id: null,
          client_turn_id: "c-missing",
          artifact_id: "a-unlinked",
        },
      ],
    );
    expect(rows[0]!.artifacts).toHaveLength(0);
    expect(unlinked.map((a) => a.artifact_id)).toEqual(["a-unlinked"]);
    expect(diagnostics).toEqual({
      artifactCount: 1,
      linkedCount: 0,
      unlinkedCount: 1,
      withTurnId: 0,
      withClientTurnId: 1,
      turnIdNull: 1,
    });
  });
});
