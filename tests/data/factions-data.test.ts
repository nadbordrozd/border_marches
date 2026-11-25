/**
 * The v0.2 faction data against the faction documents (sections 4, 7, 8).
 */
import { describe, expect, it } from "vitest";
import { unitArt } from "../../src/assets/unit-art.ts";
import { buildingArt } from "../../src/assets/town-art.ts";
import { ability, hasAct } from "../../src/core/battle/index.ts";
import { registerSpells } from "../../src/core/magic/spells.ts";
import {
  GOBLIN_CREATURES,
  HUMAN_CREATURES,
  UNDEAD_CREATURES,
} from "../../src/data/factionCreatures.ts";
import { getCreature } from "../../src/data/creatures.ts";
import { NAMED_HEROES, getHeroClass } from "../../src/data/classes.ts";
import {
  FACTIONS,
  playableFactions,
  townTree,
} from "../../src/data/factions.ts";

const ROSTERS = {
  humans: HUMAN_CREATURES,
  undead: UNDEAD_CREATURES,
  goblins: GOBLIN_CREATURES,
};

describe("v0.2 faction data", () => {
  it("has six creatures per faction with the documented weekly totals", () => {
    // [gold, wood, ore, essence, fight value] for one week of all six.
    const week = {
      // Prices tuned by the balance bead (bzc.24, BALANCE.md section 5).
      humans: [11045, 0, 7, 6, 8335],
      undead: [10350, 0, 2, 9, 7700],
      goblins: [9300, 11, 3, 4, 7716],
    };
    for (const [faction, roster] of Object.entries(ROSTERS)) {
      expect(roster.map((c) => c.tier)).toEqual([1, 2, 3, 4, 5, 6]);
      const t = [0, 0, 0, 0, 0];
      for (const c of roster) {
        t[0]! += c.growth * (c.cost.gold ?? 0);
        t[1]! += c.growth * (c.cost.wood ?? 0);
        t[2]! += c.growth * (c.cost.ore ?? 0);
        t[3]! += c.growth * (c.cost.essence ?? 0);
        t[4]! += c.growth * c.fightValue;
      }
      expect(t, faction).toEqual(week[faction as keyof typeof week]);
    }
  });

  it("every ability is registered and every sprite is the unit art's", () => {
    for (const roster of Object.values(ROSTERS)) {
      for (const c of roster) {
        for (const a of c.abilities ?? [])
          expect(() => ability(a)).not.toThrow();
        expect(c.sprite, c.id).toBe(unitArt(c.id).key);
      }
    }
  });

  it("the Restless cannot bear Heartened or Shaken; Banshees leave nothing", () => {
    for (const c of UNDEAD_CREATURES)
      expect(c.tags?.cannotBear).toEqual(["heartened", "shaken"]);
    expect(getCreature("banshee").tags?.remains).toBe("nothing");
    expect(getCreature("skeleton").tags?.remains).toBe("bones");
  });

  it("24 named heroes, four per class, with valid specialties", () => {
    expect(NAMED_HEROES).toHaveLength(24);
    const perClass = new Map<string, number>();
    for (const h of NAMED_HEROES) {
      perClass.set(h.heroClass, (perClass.get(h.heroClass) ?? 0) + 1);
      const cls = getHeroClass(h.heroClass);
      expect(cls.faction).toBe(h.faction);
      const sp = h.specialty;
      if (sp.kind === "skill")
        expect(cls.startingSkills, h.id).toContain(sp.replaces);
      if (sp.kind === "creature")
        expect(getCreature(sp.creature).faction).toBe(h.faction);
    }
    expect([...perClass.values()]).toEqual([4, 4, 4, 4, 4, 4]);
  });

  it("the classes' starting armies are the documents' (fight value about 1800)", () => {
    const fv = {
      "knight-errant": 1803,
      enchanter: 1795,
      revenant: 1775,
      mortician: 1780,
      warlord: 1798,
      weatherwitch: 1800,
    };
    for (const [id, want] of Object.entries(fv)) {
      const army = getHeroClass(id).startingArmy;
      const total = army.reduce(
        (n, s) => n + s.count * getCreature(s.creature).fightValue,
        0,
      );
      expect(total, id).toBe(want);
    }
  });

  it("only the three v0.2 factions are playable", () => {
    expect(playableFactions().map((f) => f.id)).toEqual([
      "humans",
      "undead",
      "goblins",
    ]);
    expect(FACTIONS.find((f) => f.id === "lost-world")?.available).toBe(false);
  });

  it("every building of the three trees has town-screen art", () => {
    for (const faction of ["humans", "undead", "goblins"]) {
      for (const id of townTree(faction)!.order)
        expect(buildingArt(faction, id), `${faction} ${id}`).not.toBeNull();
    }
  });

  it("the casters' pages are the magic catalogue's spells", () => {
    registerSpells();
    for (const id of ["friar", "gravecaller", "boomshaman"] as const) {
      const pages = getCreature(id).caster?.pages ?? [];
      expect(pages, id).toHaveLength(2);
      for (const p of pages) expect(hasAct(p), p).toBe(true);
    }
    expect(getCreature("friar").caster?.pages).toEqual(["mend", "share"]);
  });
});
