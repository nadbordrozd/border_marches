/**
 * The naval battle setup (docs/design/NAVAL.md 3.2 to 3.4, bead bzc.153):
 * the layout chosen from who is afloat and the defender's cell, the deck
 * guns, Wet Landing, and the engine setup built from them. Dry maps keep
 * their setups exactly.
 */
import { describe, expect, it } from "vitest";
import { engineSetupFromGame } from "../../../src/core/battle/index.ts";
import {
  battleSetup,
  isAfloat,
  newGame,
  type GameState,
  type HeroState,
  type PendingBattle,
} from "../../../src/core/game/index.ts";
import type { MapObject } from "../../../src/core/map/types.ts";
import type { CreatureId } from "../../../src/data/types.ts";
import { buildMap, heroStart, monster } from "./helpers.ts";
import { STRAIT, boat, navalGame } from "./naval-helpers.ts";

function hero(s: GameState, id = "hero-0"): HeroState {
  return s.heroes.find((h) => h.id === id)!;
}

/**
 * Hero 0 at (x, y) (afloat when a boat is there), a neutral stack of
 * `creature` at (mx, my), and its battle pending.
 */
function versusStack(
  creature: CreatureId,
  [x, y]: [number, number],
  [mx, my]: [number, number],
  boats: [number, number][] = [[5, 5]],
  seafaring = 0,
  objects: MapObject[] = [],
): GameState {
  const s = structuredClone(
    navalGame(
      STRAIT,
      objects,
      boats.map(([bx, by], i) => boat(`boat-${i}`, bx, by)),
    ),
  );
  const h = hero(s);
  h.x = x;
  h.y = y;
  if (seafaring > 0)
    h.skills = [...h.skills, { id: "seafaring", rank: seafaring }];
  s.monsters = {
    guard: { id: "guard", creature, count: 12, x: mx, y: my },
  };
  s.map = { ...s.map, objects: [...s.map.objects, monster("guard", mx, my)] };
  const battle: PendingBattle = {
    kind: "monster",
    objectId: "guard",
    heroId: "hero-0",
  };
  s.pendingBattle = battle;
  return s;
}

describe("the layout (NAVAL 3.2)", () => {
  it("afloat against swimmers: open water, the attacker's deck gun only", () => {
    const s = versusStack("jellyfish", [5, 5], [6, 5]);
    expect(isAfloat(s, hero(s))).toBe(true);
    const setup = battleSetup(s)!;
    expect(setup.layout).toBe("open-water");
    expect(setup.attacker.deckGun).toBe(20);
    expect(setup.defender.deckGun).toBeUndefined();
    expect(setup.attacker.wetLanding).toBeUndefined();
  });

  it("afloat against a pirate crew: deck to deck, the pirates' gun is 40", () => {
    const setup = battleSetup(versusStack("corsair", [5, 5], [6, 5]))!;
    expect(setup.layout).toBe("deck");
    expect(setup.attacker.deckGun).toBe(20);
    expect(setup.defender.deckGun).toBe(40);
  });

  it("ashore against a sea stack: the pier (water or deck), no attacker gun", () => {
    const water = battleSetup(versusStack("giant-crab", [4, 5], [5, 5], []))!;
    expect(water.layout).toBe("pier-water");
    expect(water.attacker.deckGun).toBeUndefined();
    expect(water.defender.deckGun).toBeUndefined();
    expect(water.attackerTerrain).toBe("grass");
    const deck = battleSetup(versusStack("corsair", [4, 5], [5, 5], []))!;
    expect(deck.layout).toBe("pier-deck");
    expect(deck.defender.deckGun).toBe(40);
  });

  it("afloat against a land stack: a beach landing with Wet Landing", () => {
    const setup = battleSetup(versusStack("goblin", [5, 5], [4, 5]))!;
    expect(setup.layout).toBe("beach");
    expect(setup.attacker.wetLanding).toBe(true);
    expect(setup.attacker.deckGun).toBeUndefined();
    expect(setup.terrain).toBe("grass");
    const engine = engineSetupFromGame(setup);
    expect(engine.layout).toBe("beach");
    expect(engine.attacker.wetLanding).toBe(true);
  });

  it("Seafaring: the gun grows 15 a rank; rank 3 lands dry", () => {
    const one = battleSetup(
      versusStack("jellyfish", [5, 5], [6, 5], [[5, 5]], 1),
    )!;
    expect(one.attacker.deckGun).toBe(35);
    const three = battleSetup(
      versusStack("goblin", [5, 5], [4, 5], [[5, 5]], 3),
    )!;
    expect(three.layout).toBe("beach");
    expect(three.attacker.wetLanding).toBeUndefined();
  });

  it("an Admiralty adds 20 to its player's deck guns", () => {
    const s = versusStack("corsair", [5, 5], [6, 5], [[5, 5]], 0, [
      {
        id: "town-0",
        kind: "town",
        x: 2,
        y: 5,
        footprint: { w: 1, h: 1 },
        blocked: [],
        data: { faction: "humans", owner: 0 },
      },
    ]);
    expect(battleSetup(s)!.attacker.deckGun).toBe(20);
    const town = s.towns["town-0"]!;
    town.faction = "humans";
    town.buildings.push("admiralty");
    const setup = battleSetup(s)!;
    expect(setup.attacker.specials).toContain("admiralty");
    expect(setup.attacker.deckGun).toBe(40);
    // The pirates' gun is their own (Harm 40), with no Admiralty.
    expect(setup.defender.deckGun).toBe(40);
  });

  it("two heroes afloat fight deck to deck with both guns", () => {
    const s = structuredClone(
      navalGame(
        STRAIT,
        [],
        [boat("boat-1", 6, 5), boat("boat-2", 7, 5, 1)],
        4,
        5,
        [heroStart(16, 8, 1)],
      ),
    );
    const me = hero(s);
    me.x = 6;
    me.y = 5;
    const foe = s.heroes.find((h) => h.owner === 1)!;
    foe.x = 7;
    foe.y = 5;
    s.pendingBattle = { kind: "hero", objectId: foe.id, heroId: me.id };
    const setup = battleSetup(s)!;
    expect(setup.layout).toBe("deck");
    expect(setup.attacker.deckGun).toBe(20);
    expect(setup.defender.deckGun).toBe(20);
    const engine = engineSetupFromGame(setup);
    expect(engine.layout).toBe("deck");
    expect(engine.attacker.deckGun).toBe(20);
    expect(engine.defender.deckGun).toBe(20);
  });

  it("two sides ashore on a naval map, and any battle on a dry map, are land", () => {
    const ashore = battleSetup(versusStack("goblin", [3, 5], [2, 5], []))!;
    expect("layout" in ashore).toBe(false);
    expect("deckGun" in ashore.attacker).toBe(false);
    expect("wetLanding" in ashore.attacker).toBe(false);
    expect("layout" in engineSetupFromGame(ashore)).toBe(false);
    const dry = structuredClone(
      newGame(buildMap(STRAIT, [heroStart(4, 5), monster("g", 3, 5)])),
    );
    dry.pendingBattle = { kind: "monster", objectId: "g", heroId: "hero-0" };
    const setup = battleSetup(dry)!;
    expect("layout" in setup).toBe(false);
    expect("attackerTerrain" in setup).toBe(false);
    expect("deckGun" in setup.defender).toBe(false);
  });
});
