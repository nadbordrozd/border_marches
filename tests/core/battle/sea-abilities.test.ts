/**
 * The sea guardians' abilities and the Swimmer flag (NAVAL.md 3.1 and 4.2,
 * bead bzc.152) on hand-built land battles: the naval battlefield (sea
 * hexes) is bead 5's.
 */
import { describe, expect, it } from "vitest";
import {
  ability,
  createBattle,
  getStack,
  swims,
  teleportsToWalk,
} from "../../../src/core/battle/index.ts";
import type {
  BattleEvent,
  BattleStackSetup,
  BattleState,
} from "../../../src/core/battle/index.ts";
import { SUMMONED_CREATURES } from "../../../src/core/magic/index.ts";
import { CREATURES } from "../../../src/data/creatures.ts";
import { SEA_CREATURE_IDS } from "../../../src/data/sea.ts";
import { STRAY_CREATURE_IDS } from "../../../src/data/strays.ts";
import { at, battle, kinds, stats, strikes, unit } from "./faction-helpers.ts";
import { play } from "./helpers.ts";

function until(s: BattleState, id: string): BattleState {
  let cur = s;
  for (let i = 0; i < 40 && cur.activeStackId !== id; i++)
    cur = play(cur, {
      type: "defend",
      stackId: cur.activeStackId as string,
    }).state;
  expect(cur.activeStackId).toBe(id);
  return cur;
}

/** The multipliers' sources of the Strikes on `target` in these events. */
function multipliers(events: readonly BattleEvent[], target: string): string[] {
  return events.flatMap((e) =>
    e.type === "damage" && e.targetId === target
      ? e.breakdown.abilityMultipliers.map((m) => m.source)
      : [],
  );
}

function condition(state: BattleState, id: string, kind: string) {
  return getStack(state, id).conditions.find((c) => c.kind === kind);
}

/** A stack of `id` without one of its abilities (the control case). */
function without(
  id: Parameters<typeof stats>[0],
  drop: string,
  count: number,
  hex: { col: number; row: number },
): BattleStackSetup {
  const s = stats(id);
  return {
    creature: { ...s, abilities: s.abilities.filter((a) => a !== drop) },
    count,
    hex,
  };
}

describe("sea abilities", () => {
  it("every sea guardian's and the Hermit Crab's abilities are registered", () => {
    for (const id of SEA_CREATURE_IDS)
      for (const a of CREATURES[id].abilities ?? [])
        expect(() => ability(a), `${id}: ${a}`).not.toThrow();
    for (const a of SUMMONED_CREATURES["hermit-crab"]?.abilities ?? [])
      expect(() => ability(a), a).not.toThrow();
  });

  it("Swimmer: the seven swimmers, the Hermit Crab and three strays", () => {
    const swimmers = [...SEA_CREATURE_IDS, ...STRAY_CREATURE_IDS].filter((id) =>
      swims(stats(id)),
    );
    expect(swimmers).toEqual([
      "jellyfish",
      "drowned-sailor",
      "giant-crab",
      "siren",
      "hammerhead",
      "sea-serpent",
      "kraken",
      "bog-leech",
      "deep-sea-diver",
      "lagoon-lurker",
    ]);
    expect(swims(SUMMONED_CREATURES["hermit-crab"]!)).toBe(true);
    expect(swims(stats("corsair"))).toBe(false);
    expect(ability("swimmer").swimmer).toBe(true);
  });

  it("Swimmer: on a land field a swimmer walks like any other stack", () => {
    const s = battle(
      { stacks: [unit("lagoon-lurker", 3, at(2, 5))] },
      { stacks: [unit("bellhop", 5, at(12, 2))] },
    );
    const ready = until(s, "a0");
    const { state, events } = play(ready, {
      type: "move",
      stackId: "a0",
      to: at(5, 5),
    });
    expect(getStack(state, "a0").hex).toEqual(at(5, 5));
    const move = events.find((e) => e.type === "move");
    expect(move?.type === "move" && move.mode).toBe("walk");
  });

  it("Jellyfish: Stinging Bell starts the battle Thorned, size = count, at most 20", () => {
    const s = battle(
      {
        stacks: [
          unit("jellyfish", 7, at(5, 5)),
          unit("jellyfish", 30, at(5, 7)),
        ],
      },
      { stacks: [unit("bellhop", 10, at(6, 5))] },
    );
    const small = condition(s, "a0", "thorned");
    const big = condition(s, "a1", "thorned");
    expect([small?.size, small?.clock]).toEqual([7, null]);
    expect([big?.size, big?.clock]).toEqual([20, null]);
  });

  it("Jellyfish: a stack striking them in melee takes the Thorned Harm", () => {
    const s = battle(
      { stacks: [unit("jellyfish", 10, at(6, 5))] },
      { stacks: [unit("tin-titan", 2, at(7, 5))] },
    );
    const ready = until(s, "d0");
    const { events } = play(ready, {
      type: "attack",
      stackId: "d0",
      targetId: "a0",
      from: at(7, 5),
    });
    const harm = events.filter((e) => e.type === "harm" && e.targetId === "d0");
    expect(harm.length).toBeGreaterThan(0);
  });

  it("Drowned Sailor: Dead Weight adds Slowed 1 for 2 rounds", () => {
    const s = battle(
      { stacks: [unit("drowned-sailor", 10, at(5, 5))] },
      { stacks: [unit("tin-titan", 2, at(6, 5))] },
    );
    const ready = until(s, "a0");
    const { state } = play(ready, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: at(5, 5),
    });
    const slowed = condition(state, "d0", "slowed");
    expect([slowed?.size, slowed?.clock]).toEqual([1, 2]);
  });

  it("Giant Crab and Hermit Crab: Carapace halves shots, as Bony", () => {
    const shoot = (target: BattleStackSetup) => {
      const s = battle(
        { stacks: [unit("newsie", 20, at(2, 5))] },
        { stacks: [target] },
      );
      return play(until(s, "a0"), {
        type: "shoot",
        stackId: "a0",
        targetId: "d0",
      }).events;
    };
    const crab = shoot(unit("giant-crab", 20, at(12, 5)));
    const bare = shoot(without("giant-crab", "carapace", 20, at(12, 5)));
    expect(multipliers(crab, "d0")).toContain("carapace");
    const dmg = (ev: BattleEvent[]) => strikes(ev)[0]?.[3] ?? 0;
    expect(dmg(crab)).toBe(Math.floor(dmg(bare) / 2));
    const hermit = shoot({
      creature: SUMMONED_CREATURES["hermit-crab"]!,
      count: 20,
      hex: at(12, 5),
    });
    expect(multipliers(hermit, "d0")).toContain("carapace");
  });

  it("Corsair: Swing Across is a teleport walk, over whatever is in the way", () => {
    const s = battle(
      { stacks: [unit("corsair", 5, at(2, 5))] },
      {
        stacks: [
          unit("bellhop", 5, at(3, 4)),
          unit("bellhop", 5, at(3, 5)),
          unit("bellhop", 5, at(3, 6)),
        ],
      },
    );
    expect(teleportsToWalk(getStack(s, "a0"))).toBe(true);
    const ready = until(s, "a0");
    const { state, events } = play(ready, {
      type: "move",
      stackId: "a0",
      to: at(6, 5),
    });
    expect(getStack(state, "a0").hex).toEqual(at(6, 5));
    const move = events.find((e) => e.type === "move");
    expect(move?.type === "move" && move.mode).toBe("teleport");
  });

  it("Siren: Siren Song pulls an enemy 3 hexes and adds Mollified 30", () => {
    const s = battle(
      { stacks: [unit("siren", 5, at(3, 5))] },
      { stacks: [unit("tin-titan", 2, at(9, 5))] },
    );
    const ready = until(s, "a0");
    const { state } = play(ready, {
      type: "ability",
      stackId: "a0",
      ability: "siren-song",
      targets: [{ stack: "d0" }],
    });
    expect(getStack(state, "d0").hex).toEqual(at(6, 5));
    const m = condition(state, "d0", "mollified");
    expect([m?.size, m?.clock]).toEqual([30, 2]);
    expect(getStack(state, "a0").abilitiesUsed).toEqual(["siren-song"]);
  });

  it("Siren: Siren Song refuses a friend and a stack beyond 6 hexes", () => {
    const s = battle(
      { stacks: [unit("siren", 5, at(3, 5)), unit("bellhop", 5, at(4, 7))] },
      { stacks: [unit("tin-titan", 2, at(10, 5))] },
    );
    const ready = until(s, "a0");
    for (const target of ["a1", "d0"])
      expect(() =>
        play(ready, {
          type: "ability",
          stackId: "a0",
          ability: "siren-song",
          targets: [{ stack: target }],
        }),
      ).toThrow();
  });

  it("Hammerhead: Blood in the Water is x 150% on a stack below its deployed count", () => {
    const hit = (wounded: boolean) => {
      let s = battle(
        { stacks: [unit("hammerhead", 2, at(5, 5))] },
        { stacks: [unit("tin-titan", 6, at(6, 5))] },
      );
      if (wounded)
        s = {
          ...s,
          stacks: s.stacks.map((x) => (x.id === "d0" ? { ...x, count: 5 } : x)),
        };
      return play(until(s, "a0"), {
        type: "attack",
        stackId: "a0",
        targetId: "d0",
        from: at(5, 5),
      }).events;
    };
    const fresh = hit(false);
    const bleeding = hit(true);
    expect(multipliers(fresh, "d0")).not.toContain("blood-in-the-water");
    expect(multipliers(bleeding, "d0")).toContain("blood-in-the-water");
    const first = (ev: BattleEvent[]) =>
      strikes(ev).find((x) => x[0] === "a0")?.[3] ?? 0;
    expect(first(bleeding)).toBe(Math.floor((first(fresh) * 3) / 2));
  });

  it("Sea Serpent: Coil makes the stack it attacks Stuck for 2 rounds", () => {
    const s = battle(
      { stacks: [unit("sea-serpent", 1, at(5, 5))] },
      { stacks: [unit("tin-titan", 3, at(6, 5))] },
    );
    const ready = until(s, "a0");
    const { state } = play(ready, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: at(5, 5),
    });
    const stuck = condition(state, "d0", "stuck");
    expect(stuck?.clock).toBe(2);
    expect(ability("coil").aiMeleeMakes).toBe("stuck");
  });

  it("Kraken: Many Arms strikes every other adjacent enemy at x 50%, unretaliated", () => {
    const s = battle(
      {
        stacks: [unit("kraken", 1, at(5, 5)), unit("bellhop", 5, at(4, 5))],
      },
      {
        stacks: [
          unit("tin-titan", 3, at(6, 5)),
          unit("tin-titan", 3, at(5, 4)),
          unit("tin-titan", 3, at(12, 2)),
        ],
      },
    );
    const ready = until(s, "a0");
    const { events } = play(ready, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: at(5, 5),
    });
    const hits = strikes(events).filter((x) => x[0] === "a0");
    expect(hits.map((x) => [x[1], x[2]])).toEqual([
      ["d0", "melee"],
      ["d1", "special"],
    ]);
    // Half damage: the special Strike carries the 50% multiplier.
    const special = events.find(
      (e) => e.type === "damage" && e.targetId === "d1",
    );
    expect(
      special?.type === "damage" &&
        special.breakdown.abilityMultipliers.some((m) => m.percent === 50),
    ).toBe(true);
    // Only the target retaliates; the friend and the far stack are untouched.
    const retaliators = strikes(events)
      .filter((x) => x[2] === "retaliation")
      .map((x) => x[0]);
    expect(retaliators).toEqual(["d0"]);
    expect(strikes(events).some((x) => x[1] === "a1" || x[1] === "d2")).toBe(
      false,
    );
  });

  it("Kraken: a retaliation is not a melee attack and makes no Many Arms", () => {
    const s = battle(
      { stacks: [unit("tin-titan", 3, at(4, 5))] },
      {
        stacks: [unit("kraken", 1, at(5, 5)), unit("bellhop", 5, at(5, 4))],
      },
    );
    // The bellhop at (5, 4) is the Kraken's friend: never struck anyway;
    // check the Kraken's retaliation alone strikes the attacker.
    const ready = until(s, "a0");
    const { events } = play(ready, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: at(4, 5),
    });
    const fromKraken = strikes(events).filter((x) => x[0] === "d0");
    expect(fromKraken.map((x) => x[2])).toEqual(["retaliation"]);
  });

  it("the stacks carry the sea guardians' remains tags", () => {
    const s = createBattle({
      seed: 1,
      obstacles: [],
      attacker: {
        hero: null,
        stacks: [
          unit("jellyfish", 1, at(0, 1)),
          unit("drowned-sailor", 1, at(0, 3)),
        ],
      },
      defender: { hero: null, stacks: [unit("kraken", 1, at(14, 5))] },
    }).state;
    expect(getStack(s, "a0").tags.remains).toBe("nothing");
    expect(getStack(s, "a1").tags).toEqual({
      remains: "bones",
      cannotBear: ["heartened", "shaken"],
    });
    expect(kinds(s, "d0")).toEqual([]);
  });
});
