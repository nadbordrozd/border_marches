/**
 * The Candy Kingdom's town in the game (FACTION_CANDY.md section 9): the
 * Bakery's growth, and the Larder and The Four O'Clock reaching the
 * battles of their owner's armies.
 */

import { describe, expect, it } from "vitest";
import {
  createBattle,
  engineSetupFromGame,
  getStack,
} from "../../../src/core/battle/index.ts";
import { battleSetup } from "../../../src/core/game/battle.ts";
import { dwellingGrowth } from "../../../src/core/game/state.ts";
import { build, buildStatus } from "../../../src/core/game/town.ts";
import { growTown } from "../../../src/core/game/turn.ts";
import { newGame } from "../../../src/core/game/newGame.ts";
import type { GameState } from "../../../src/core/game/types.ts";
import { dwellingStrip } from "../../../src/ui/town-dwellings.ts";
import { buildMap, field, heroStart, monster, ok, town } from "./helpers.ts";

const RICH = { gold: 100000, wood: 500, ore: 500, essence: 100 };

function candyGame(): GameState {
  const map = buildMap(field(10, 10), [
    town("t0", 1, 1, 0),
    heroStart(1, 2, 0),
    town("t1", 8, 8, 1),
    heroStart(8, 7, 1),
    monster("m", 2, 1),
  ]);
  const s = newGame(map, {
    players: [
      { kind: "human", faction: "candy" },
      { kind: "ai", faction: "goblins" },
    ],
  });
  return {
    ...s,
    heroes: s.heroes.map((h) => (h.owner === 0 ? { ...h, x: 1, y: 1 } : h)),
    players: s.players.map((p) =>
      p.id === 0 ? { ...p, resources: { ...RICH } } : p,
    ),
  };
}

/** Builds in t0, one a day. */
function buildAll(s0: GameState, ids: readonly string[]): GameState {
  let s = s0;
  for (const id of ids) {
    s = ok(build(s, "t0", id)).state;
    s = {
      ...s,
      towns: { ...s.towns, t0: { ...s.towns["t0"]!, builtToday: false } },
    };
  }
  return s;
}

function engineSetup(s: GameState) {
  const hero = s.heroes.find((h) => h.owner === 0)!;
  return engineSetupFromGame(
    battleSetup({
      ...s,
      pendingBattle: { kind: "monster", objectId: "m", heroId: hero.id },
    })!,
  );
}

describe("The Bakery", () => {
  it("grows 8 more Gingerbread Men a week in its town (23)", () => {
    const s = buildAll(candyGame(), ["bakery"]);
    const t = s.towns["t0"]!;
    expect(dwellingGrowth(t, "gingerbread-man")).toBe(23);
    expect(dwellingGrowth(t, "peppermint-archer")).toBe(9);
    const before = t.dwellings["gingerbread-man"]!.available;
    const grown = structuredClone(t);
    growTown(grown);
    expect(grown.dwellings["gingerbread-man"]!.available).toBe(before + 23);
    expect(
      dwellingStrip(t).find((d) => d.creature === "gingerbread-man")?.growth,
    ).toBe(23);
    // Without it, the usual 15.
    expect(dwellingGrowth(candyGame().towns["t0"]!, "gingerbread-man")).toBe(
      15,
    );
  });
});

describe("The Larder and The Four O'Clock", () => {
  it("ride on the owner's natives into battle", () => {
    let s = buildAll(candyGame(), [
      "mint-range",
      "sugarplum-bower",
      "larder",
      "town-hall",
      "fort-1",
      "marketplace",
      "city-hall",
    ]);
    expect(buildStatus(s, "t0", "the-four-oclock")).toBe("keystone");
    s = {
      ...s,
      heroes: s.heroes.map((h) =>
        h.owner === 0 ? { ...h, backpack: [...h.backpack, "keystone"] } : h,
      ),
    };
    s = buildAll(s, ["the-four-oclock"]);
    const setup = engineSetup(s);
    expect(setup.attacker.birthright).toBe("sticky");
    for (const st of setup.attacker.stacks) {
      expect(st.native).toBe(true);
      expect(st.creature.abilities).toEqual(
        expect.arrayContaining(["larder", "the-four-oclock"]),
      );
    }
    expect(
      setup.defender.stacks.every(
        (st) => !st.creature.abilities.includes("larder"),
      ),
    ).toBe(true);
    // Every native starts the battle Hastened for 1 round.
    const b = createBattle({ ...setup, obstacles: [] }).state;
    for (const st of b.stacks.filter((x) => x.owner === "attacker"))
      expect(
        getStack(b, st.id).conditions.find((c) => c.kind === "hastened")?.clock,
      ).toBe(1);
  });
});
