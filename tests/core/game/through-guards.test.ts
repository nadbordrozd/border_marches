// Planning through guards (bead bzc.77): a target that only lies beyond
// zones of control gets the walk to the first guard, ending with the fight.
import { describe, expect, it } from "vitest";
import {
  findPath,
  moveHeroAlong,
  type Path,
} from "../../../src/core/game/index.ts";
import { field, gameOn, mine, monster, ok, pickup } from "./helpers.ts";

const THROUGH = { ignoreFog: true, throughGuards: true } as const;

const cells = (p: Path | null) =>
  p?.steps.map((s) => [s.x, s.y, s.attack] as const);

describe("findPath with throughGuards", () => {
  it("plans to the fight with the guard of a blocked corridor", () => {
    // The stack at (3,1) guards the whole 3-row corridor.
    const s = gameOn(field(7, 3), [monster("m", 3, 1)], 0, 1);
    expect(findPath(s, "hero-0", 6, 1, { ignoreFog: true })).toBeNull();
    const p = findPath(s, "hero-0", 6, 1, THROUGH);
    expect(p).not.toBeNull();
    expect(p?.blockedBy).toBe("m");
    const steps = p?.steps ?? [];
    const stand = steps[steps.length - 2];
    // Stops on the first zone cell it enters, then the attack step.
    expect(stand?.x).toBe(2);
    expect(stand?.attack).toBe(false);
    expect(steps.at(-1)).toMatchObject({ x: 3, y: 1, attack: true, cost: 0 });
    expect(p?.total).toBe(stand?.total);
  });

  it("is off by default: the AI and other callers still get null", () => {
    const s = gameOn(field(7, 3), [monster("m", 3, 1)], 0, 1);
    expect(findPath(s, "hero-0", 6, 1, { ignoreFog: true })).toBeNull();
    expect(
      findPath(s, "hero-0", 6, 1, { ignoreFog: true, throughGuards: false }),
    ).toBeNull();
  });

  it("changes nothing when the target is reachable without a fight", () => {
    const s = gameOn(field(9, 7), [monster("m", 4, 3)], 0, 3);
    const plain = findPath(s, "hero-0", 8, 3, { ignoreFog: true });
    const through = findPath(s, "hero-0", 8, 3, THROUGH);
    expect(through).toEqual(plain);
    expect(through?.blockedBy).toBeUndefined();
    // Attacking the stack itself is an ordinary attack path.
    const attack = findPath(s, "hero-0", 4, 3, THROUGH);
    expect(attack?.blockedBy).toBeUndefined();
    expect(attack?.steps.at(-1)?.attack).toBe(true);
  });

  it("stops at the first of two guards on the way", () => {
    const s = gameOn(
      field(12, 3),
      [monster("a", 3, 1), monster("b", 8, 1), mine("mine-ore", 11, 1, "ore")],
      0,
      1,
    );
    const p = findPath(s, "hero-0", 11, 1, THROUGH);
    expect(p?.blockedBy).toBe("a");
    expect(p?.steps.at(-1)).toMatchObject({ x: 3, y: 1, attack: true });
  });

  it("returns null when even a fight would not open the way", () => {
    const rows = ["gggg~gg", "gggg~gg", "gggg~gg"];
    const s = gameOn(rows, [monster("m", 2, 1)], 0, 1);
    expect(findPath(s, "hero-0", 6, 1, THROUGH)).toBeNull();
  });

  it("gives the days to the fight", () => {
    const s = gameOn(field(7, 3), [monster("m", 3, 1)], 0, 1);
    const hero = s.heroes[0];
    if (hero === undefined) throw new Error("no hero");
    hero.mp = 0;
    const p = findPath(s, "hero-0", 6, 1, THROUGH);
    expect(p?.steps.at(-1)?.day).toBe(1);
  });

  it("is a walk moveHeroAlong stops at the fight with the named guard", () => {
    const s = gameOn(field(7, 3), [monster("m", 3, 1)], 0, 1);
    const p = findPath(s, "hero-0", 6, 1, THROUGH);
    if (p === null) throw new Error("no path");
    const { state, events } = ok(moveHeroAlong(s, "hero-0", p.steps));
    const moved = events.find((e) => e.type === "moved");
    expect(moved).toMatchObject({ stop: "guarded" });
    const stand = p.steps[p.steps.length - 2];
    expect(state.heroes[0]).toMatchObject({ x: stand?.x, y: stand?.y });
    expect(state.pendingBattle).toMatchObject({
      kind: "monster",
      objectId: "m",
    });
    expect(cells(p)?.filter(([, , attack]) => attack)).toHaveLength(1);
  });
});

// Bead bzc.79: a stack standing in a one-cell gap, a visit or a pickup in
// the way used to make everything beyond it "Can't reach".
describe("findPath with throughGuards past things in a one-cell gap", () => {
  const CORRIDOR = ["MMMMMMMMM", "ggggggggg", "MMMMMMMMM"];

  it("plans to the fight with a stack standing in the gap", () => {
    const s = gameOn(CORRIDOR, [monster("m", 4, 1)], 0, 1);
    expect(findPath(s, "hero-0", 8, 1, { ignoreFog: true })).toBeNull();
    const p = findPath(s, "hero-0", 8, 1, THROUGH);
    expect(p?.blockedBy).toBe("m");
    expect(p?.stopsAt).toBeUndefined();
    expect(cells(p)).toEqual([
      [1, 1, false],
      [2, 1, false],
      [3, 1, false],
      [4, 1, true],
    ]);
    const { state } = ok(moveHeroAlong(s, "hero-0", p?.steps ?? []));
    expect(state.heroes[0]).toMatchObject({ x: 3, y: 1 });
    expect(state.pendingBattle).toMatchObject({ objectId: "m" });
  });

  it("plans to the fight with a parleyed stack still standing in the gap", () => {
    const s = gameOn(CORRIDOR, [monster("m", 4, 1)], 0, 1);
    s.magic = {
      heroes: { "hero-0": { castToday: [], parley: ["m"], parleyDay: s.day } },
    };
    const p = findPath(s, "hero-0", 8, 1, THROUGH);
    expect(p?.blockedBy).toBe("m");
    expect(p?.steps.at(-1)).toMatchObject({ x: 4, y: 1, attack: true });
    expect(p?.steps.at(-2)).toMatchObject({ x: 3, y: 1, attack: false });
    const { state } = ok(moveHeroAlong(s, "hero-0", p?.steps ?? []));
    expect(state.pendingBattle).toMatchObject({ objectId: "m" });
  });

  it("plans to a visit in the gap and names it", () => {
    const s = gameOn(CORRIDOR, [mine("mine-ore", 4, 1, "ore")], 0, 1);
    expect(findPath(s, "hero-0", 8, 1, { ignoreFog: true })).toBeNull();
    const p = findPath(s, "hero-0", 8, 1, THROUGH);
    expect(p?.stopsAt).toBe("mine-ore");
    expect(p?.blockedBy).toBeUndefined();
    expect(p?.steps.at(-1)).toMatchObject({ x: 4, y: 1, attack: false });
    const { state } = ok(moveHeroAlong(s, "hero-0", p?.steps ?? []));
    expect(state.heroes[0]).toMatchObject({ x: 4, y: 1 });
    // From the visit the next plan goes on to the target.
    const on = findPath(state, "hero-0", 8, 1, THROUGH);
    expect(on?.stopsAt).toBeUndefined();
    expect(on?.steps.at(-1)).toMatchObject({ x: 8, y: 1 });
  });

  it("plans to a pickup in the gap and takes it from the cell before", () => {
    const s = gameOn(
      CORRIDOR,
      [pickup("p", 4, 1, { resource: "wood", amount: 5 })],
      0,
      1,
    );
    expect(findPath(s, "hero-0", 8, 1, { ignoreFog: true })).toBeNull();
    const p = findPath(s, "hero-0", 8, 1, THROUGH);
    expect(p?.stopsAt).toBe("p");
    expect(p?.steps.at(-1)).toMatchObject({ x: 4, y: 1, pickup: true });
    expect(p?.steps.at(-1)?.cost).toBe(0);
    const { state, events } = ok(moveHeroAlong(s, "hero-0", p?.steps ?? []));
    expect(events.find((e) => e.type === "moved")).toMatchObject({
      stop: "pickup",
    });
    expect(state.collected).toContain("p");
  });

  it("stops at the first thing on the way: a visit before a guard", () => {
    const s = gameOn(
      CORRIDOR,
      [mine("mine-ore", 2, 1, "ore"), monster("m", 6, 1)],
      0,
      1,
    );
    const p = findPath(s, "hero-0", 8, 1, THROUGH);
    expect(p?.stopsAt).toBe("mine-ore");
    expect(p?.blockedBy).toBeUndefined();
    expect(p?.steps.at(-1)).toMatchObject({ x: 2, y: 1 });
  });

  it("still returns null when nothing opens the way", () => {
    const rows = ["MMMMMMMMM", "ggggMgggg", "MMMMMMMMM"];
    const s = gameOn(rows, [monster("m", 2, 1)], 0, 1);
    expect(findPath(s, "hero-0", 8, 1, THROUGH)).toBeNull();
  });
});
