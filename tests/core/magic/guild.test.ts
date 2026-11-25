/**
 * Magic guilds (RULES_V2 2.9): seeded, faction-weighted draws per level,
 * the level 1 and level 2 guarantees, and learning in an own town.
 */

import { describe, expect, it } from "vitest";
import { findPath, moveHeroAlong } from "../../../src/core/game/index.ts";
import type { GameState } from "../../../src/core/game/index.ts";
import { cloneState } from "../../../src/core/game/state.ts";
import {
  EVEN_WEIGHTS,
  FACTION_SCHOOL_WEIGHTS,
  guildLevelOf,
  guildSpells,
  heroMagic,
  spellInfo,
  townGuild,
} from "../../../src/core/magic/index.ts";
import { field, gameOn, ok, town } from "../game/helpers.ts";

const humans = FACTION_SCHOOL_WEIGHTS.humans!;
const undead = FACTION_SCHOOL_WEIGHTS.undead!;
const goblins = FACTION_SCHOOL_WEIGHTS.goblins!;

describe("guild draws", () => {
  it("offers 4, 3, 3, 2, 1 spells of tiers 1 to 5, up to the cap", () => {
    const g = guildSpells(11, undead.weights, undead.cap);
    expect(g.map((l) => l.length)).toEqual([4, 3, 3, 2, 1]);
    g.forEach((l, i) => {
      for (const id of l) expect(spellInfo(id).tier).toBe(i + 1);
    });
    expect(guildSpells(11, humans.weights, humans.cap)).toHaveLength(4);
    expect(guildSpells(11, goblins.weights, goblins.cap)).toHaveLength(3);
  });

  it("is a pure function of the seed, and differs between seeds", () => {
    expect(guildSpells(5, EVEN_WEIGHTS)).toEqual(guildSpells(5, EVEN_WEIGHTS));
    const draws = new Set(
      [1, 2, 3, 4, 5, 6].map((s) =>
        JSON.stringify(guildSpells(s, EVEN_WEIGHTS)),
      ),
    );
    expect(draws.size).toBeGreaterThan(1);
  });

  it("never offers a school weighted 0, nor faction-only pages", () => {
    for (let seed = 0; seed < 30; seed++) {
      const ids = guildSpells(seed, humans.weights, humans.cap).flat();
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) {
        expect(spellInfo(id).school).not.toBe("hush");
        expect(["mend", "thunderclap", "last-breath"]).not.toContain(id);
      }
    }
  });

  it("level 1 holds the heaviest school; level 2 exactly one tool", () => {
    for (let seed = 0; seed < 30; seed++) {
      const g = guildSpells(seed, humans.weights, humans.cap);
      expect(g[0]!.some((id) => spellInfo(id).school === "accord")).toBe(true);
      const tools = g[1]!.filter((id) => spellInfo(id).tool);
      expect(tools).toHaveLength(1);
      expect(spellInfo(tools[0]!).school).not.toBe("hush");
      // The Horde's heaviest school is Bloom since balance round 3.
      const h = guildSpells(seed, goblins.weights, goblins.cap);
      expect(h[0]!.some((id) => spellInfo(id).school === "bloom")).toBe(true);
    }
  });

  it("weights favour heavy schools", () => {
    const count: Record<string, number> = {};
    for (let seed = 0; seed < 200; seed++) {
      for (const id of guildSpells(seed, goblins.weights, goblins.cap).flat()) {
        const s = spellInfo(id).school;
        count[s] = (count[s] ?? 0) + 1;
      }
    }
    expect(count.accord ?? 0).toBe(0);
    expect(count.storm!).toBeGreaterThan(count.clock!);
  });

  it("rejects weights with fewer than two schools above 0", () => {
    expect(() =>
      guildSpells(1, { bloom: 4, accord: 0, clock: 0, hush: 0, storm: 0 }),
    ).toThrow(/two schools/);
  });

  it("a town's guild is seeded by the game seed and the town", () => {
    const a = townGuild(9, { id: "t1", faction: "humans" });
    expect(townGuild(9, { id: "t1", faction: "humans" })).toEqual(a);
    expect(a).toHaveLength(4);
  });
});

describe("learning in town", () => {
  function withGuild(level: number): GameState {
    const s = cloneState(gameOn(field(5, 3), [town("t", 2, 1, 0)], 0, 1));
    const t = s.towns.t!;
    t.faction = "humans";
    for (let l = 1; l <= level; l++) t.buildings.push(`magic-guild-${l}`);
    // Rank 1 in every school, an empty book.
    const h = s.heroes[0]!;
    h.feats = [];
    h.pages = [];
    h.skills = [
      "greencraft",
      "covenant",
      "horology",
      "quietus",
      "stormcalling",
    ].map((id) => ({ id, rank: 1 }));
    return s;
  }

  it("reads the built guild level from magic-guild-<n> buildings", () => {
    expect(
      guildLevelOf({ buildings: ["fort", "magic-guild-1", "magic-guild-2"] }),
    ).toBe(2);
    expect(guildLevelOf({ buildings: [] })).toBe(0);
  });

  it("a hero entering its own town learns every guild spell it can", () => {
    const s0 = withGuild(3);
    const s1 = ok(
      moveHeroAlong(s0, "hero-0", findPath(s0, "hero-0", 2, 1)!.steps),
    );
    const known = heroMagic(s1.state.heroes[0]!).knownSpells;
    const offer = townGuild(s0.seed, s0.towns.t!);
    // Rank 1 everywhere: tiers 1 and 2 only.
    expect(known).toEqual([...offer[0]!, ...offer[1]!]);
    expect(s1.events).toContainEqual({
      type: "spells-learnt",
      heroId: "hero-0",
      townId: "t",
      spells: known,
    });
  });
});
