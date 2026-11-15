import { describe, expect, it } from "vitest";
import {
  legalActions,
  neighbors,
  previewAttack,
} from "../../../src/core/battle/index.ts";
import type { AttackAction } from "../../../src/core/battle/index.ts";
import {
  HEX_SIZE,
  feetPoint,
  hexToStage,
  stageToHex,
} from "../../../src/render/battle/geometry.ts";
import {
  BODY_H,
  hoverIntent,
  indexLegalActions,
  pickAttackFrom,
  pointAtField,
} from "../../../src/ui/battle/intent.ts";
import { at, battle, unit } from "./helpers.ts";

describe("pointAtField", () => {
  const s = battle(
    [unit("raptor", 7, at(2, 5))],
    [unit("orc-brute", 19, at(7, 6))],
  );

  it("pointing at a unit's body picks the unit's hex", () => {
    const f = feetPoint(at(7, 6));
    // Chest height: geometrically inside the hex behind (row 5).
    const chest = { x: f.x, y: f.y - BODY_H + 8 };
    expect(stageToHex(chest)?.row).toBe(5);
    const hit = pointAtField(s, chest);
    expect(hit.hex).toEqual(at(7, 6));
    // Mapped into the hex, above its centre: an attack from the north.
    expect(hit.pointer.y).toBeLessThan(hexToStage(at(7, 6)).y);
  });

  it("elsewhere it is the hex under the pointer", () => {
    const c = hexToStage(at(10, 2));
    expect(pointAtField(s, c)).toEqual({ hex: at(10, 2), pointer: c });
    // The centre of the hex behind a unit stays selectable.
    const behind = hexToStage(at(7, 5));
    expect(pointAtField(s, behind).hex).toEqual(at(7, 5));
  });
});

describe("pickAttackFrom", () => {
  it("attacks from the neighbour on the pointer's side", () => {
    const target = at(7, 5);
    const all: AttackAction[] = neighbors(target).map((from) => ({
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from,
    }));
    const c = hexToStage(target);
    for (const a of all) {
      if (a.type !== "attack") continue;
      const n = hexToStage(a.from);
      // A pointer 40% of the way from the target's centre toward the neighbour.
      const p = { x: c.x + (n.x - c.x) * 0.4, y: c.y + (n.y - c.y) * 0.4 };
      expect(pickAttackFrom(all, p)).toEqual(a);
    }
    expect(pickAttackFrom([], c)).toBeNull();
  });
});

describe("hoverIntent", () => {
  // Raptors (speed 9) at (2, 5); Orc Brutes at (7, 5); Goblins far away.
  const s = battle(
    [unit("raptor", 7, at(2, 5)), unit("caveman", 10, at(0, 0))],
    [unit("orc-brute", 19, at(7, 5)), unit("goblin", 30, at(14, 10))],
  );
  const legal = indexLegalActions(legalActions(s));
  const point = (col: number, row: number, dx = 0, dy = 0) => {
    const c = hexToStage(at(col, row));
    return { x: c.x + dx, y: c.y + dy };
  };

  it("moves to a reachable empty hex along the engine's path", () => {
    const it = hoverIntent(s, legal, at(4, 5), point(4, 5), true);
    expect(it.kind).toBe("move");
    if (it.kind !== "move") return;
    expect(it.action.to).toEqual(at(4, 5));
    expect(it.path).toHaveLength(2);
    expect(it.path[1]).toEqual(at(4, 5));
  });

  it("attacks from the pointed side with the exact preview", () => {
    const it = hoverIntent(
      s,
      legal,
      at(7, 5),
      point(7, 5, -HEX_SIZE * 0.6, 0),
      true,
    );
    expect(it.kind).toBe("attack");
    if (it.kind !== "attack") return;
    expect(it.action).toEqual({
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: at(6, 5),
    });
    expect(it.preview).toEqual(previewAttack(s, it.action));
    expect(it.path.at(-1)).toEqual(at(6, 5));
  });

  it("marks enemies out of reach, inspects friends, ignores walls of nothing", () => {
    expect(hoverIntent(s, legal, at(14, 10), point(14, 10), true).kind).toBe(
      "out-of-reach",
    );
    expect(hoverIntent(s, legal, at(0, 0), point(0, 0), true).kind).toBe(
      "inspect",
    );
    expect(hoverIntent(s, legal, at(14, 0), point(14, 0), true).kind).toBe(
      "none",
    );
    expect(hoverIntent(s, legal, null, { x: 0, y: 0 }, true).kind).toBe("none");
  });

  it("only inspects while the AI acts", () => {
    expect(hoverIntent(s, legal, at(7, 5), point(7, 5), false).kind).toBe(
      "inspect",
    );
    expect(hoverIntent(s, legal, at(4, 5), point(4, 5), false).kind).toBe(
      "none",
    );
  });

  it("a ranged stack with shots shoots instead of walking up", () => {
    const r = battle(
      [unit("spitter", 10, at(2, 5))],
      [unit("orc-brute", 19, at(5, 5))],
    );
    const it = hoverIntent(
      r,
      indexLegalActions(legalActions(r)),
      at(5, 5),
      point(5, 5, -10, 0),
      true,
    );
    expect(it.kind).toBe("attack");
    if (it.kind !== "attack") return;
    expect(it.action.type).toBe("shoot");
    expect(it.path).toEqual([]);
  });
});
