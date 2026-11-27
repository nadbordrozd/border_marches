/**
 * The Deepforge's data against FACTION_DWARVES.md (sections 1 to 9): the
 * roster, the faction record, the Steamworks tree, the classes, the named
 * heroes, the guild, the Pocket Boiler and Scalding; and the faction in
 * games since its integration bead (bzc.135).
 */
import { describe, expect, it } from "vitest";
import { ability, act, hasAct } from "../../src/core/battle/index.ts";
import { eligibleFeats } from "../../src/core/game/hero.ts";
import { fightValue } from "../../src/core/game/progression.ts";
import { spellInfo } from "../../src/core/magic/catalog.ts";
import {
  FACTION_SCHOOL_WEIGHTS,
  guildSpells,
} from "../../src/core/magic/guild.ts";
import { registerSpells } from "../../src/core/magic/spells.ts";
import { rollContents } from "../../src/core/map/gen/contents.ts";
import { mysteryPool } from "../../src/core/map/mystery.ts";
import { createRng } from "../../src/core/rng.ts";
import {
  ARTIFACT_LIST,
  HELD_ARTIFACTS,
  findArtifact,
} from "../../src/data/artifacts.ts";
import {
  COMMANDS,
  NAMED_HEROES,
  getHeroClass,
} from "../../src/data/classes.ts";
import { getCreature } from "../../src/data/creatures.ts";
import { RULE_SWITCH_IDS } from "../../src/data/effects.ts";
import {
  DWARVES_CREATURES,
  rosterOf,
} from "../../src/data/factionCreatures.ts";
import {
  findFaction,
  playableFactions,
  townTree,
} from "../../src/data/factions.ts";
import { FEATS, HELD_FEATS } from "../../src/data/feats.ts";
import { rosterFor } from "../../src/data/players.ts";
import type { HeroState } from "../../src/core/game/types.ts";
import {
  galleryCreatures,
  galleryHeroClasses,
  galleryTab,
} from "../../src/ui/gallery-data.ts";

registerSpells();

const DWARVES = findFaction("dwarves")!;
const TREE = townTree("dwarves")!;

describe("Deepforge roster (section 4)", () => {
  it("six creatures, tier order, the documented stats and week", () => {
    expect(rosterOf("dwarves")).toBe(DWARVES_CREATURES);
    const rows = DWARVES_CREATURES.map((c) => [
      c.id,
      c.tier,
      c.hp,
      c.attack,
      c.defense,
      c.damage,
      c.speed,
      c.shots,
      c.growth,
      c.fightValue,
    ]);
    expect(rows).toEqual([
      ["tinker", 1, 11, 3, 5, 2, 4, 0, 14, 66],
      ["rivet-gunner", 2, 12, 5, 5, 3, 4, 8, 9, 113],
      ["gyrocopter", 3, 20, 8, 5, 5, 7, 0, 7, 165],
      ["mortar", 4, 28, 8, 8, 6, 3, 6, 4, 292],
      ["steam-tank", 5, 90, 13, 17, 14, 3, 0, 2, 887],
      ["ironclad", 6, 160, 18, 18, 28, 4, 8, 1, 2343],
    ]);
    const week = [0, 0, 0, 0, 0];
    for (const c of DWARVES_CREATURES) {
      expect(c.fightValue, c.id).toBe(fightValue(c));
      week[0]! += c.growth * (c.cost.gold ?? 0);
      week[1]! += c.growth * (c.cost.wood ?? 0);
      week[2]! += c.growth * (c.cost.ore ?? 0);
      week[3]! += c.growth * (c.cost.essence ?? 0);
      week[4]! += c.growth * c.fightValue;
    }
    // Section 4: 11,554 gold, 12 ore, 2 essence; fight value 8381.
    expect(week).toEqual([11554, 0, 12, 2, 8381]);
  });

  it("abilities registered, remains and tags, sprites as section 10.2", () => {
    expect(DWARVES_CREATURES.map((c) => c.abilities ?? [])).toEqual([
      ["patch-up"],
      ["hot-rivets"],
      ["rotors", "spotter"],
      ["lob"],
      ["ram"],
      ["turret"],
    ]);
    for (const c of DWARVES_CREATURES) {
      for (const a of c.abilities ?? []) expect(() => ability(a)).not.toThrow();
      expect(c.sprite).toBe(`dwarves-${c.id}`);
      expect(c.faction).toBe("dwarves");
    }
    expect(DWARVES_CREATURES.map((c) => c.tags)).toEqual([
      { remains: "corpse", cannotBear: [] },
      { remains: "corpse", cannotBear: [] },
      { remains: "wreck", cannotBear: [] },
      { remains: "wreck", cannotBear: ["heartened", "shaken"] },
      { remains: "wreck", cannotBear: ["heartened", "shaken"] },
      { remains: "wreck", cannotBear: ["heartened", "shaken"] },
    ]);
    // The three Drills' abilities and the Keystone's.
    for (const id of [
      "salvage",
      "red-hot-rivets",
      "incendiary-shells",
      "the-great-boiler",
      "stoke",
    ])
      expect(() => ability(id)).not.toThrow();
  });
});

describe("The faction record (sections 1, 2, 3)", () => {
  it("is playable (integration bead bzc.135)", () => {
    expect(DWARVES).toMatchObject({
      name: "The Deepforge",
      available: true,
      heroClasses: ["thane", "artificer"],
      colour: "#3aa38f",
      birthright: { name: "Stoke", ability: "stoke" },
      guildCap: 4,
    });
    expect(ability("stoke").name).toBe("Stoke");
    expect(playableFactions().map((f) => f.id)).toContain("dwarves");
  });

  it("school weights and guild cap match the guild's", () => {
    expect(DWARVES.schools).toEqual({
      bloom: 1,
      accord: 0,
      clock: 2,
      hush: 3,
      storm: 4,
    });
    expect(FACTION_SCHOOL_WEIGHTS["dwarves"]).toEqual({
      weights: DWARVES.schools,
      cap: DWARVES.guildCap,
    });
    const guild = TREE.order.filter((b) => b.startsWith("magic-guild-"));
    expect(guild).toEqual([1, 2, 3, 4].map((n) => `magic-guild-${n}`));
  });

  it("the guild: four levels, a Storm page at level 1, never Accord", () => {
    const { weights, cap } = FACTION_SCHOOL_WEIGHTS["dwarves"]!;
    for (const seed of [1, 2, 3, 17, 99]) {
      const levels = guildSpells(seed, weights, cap);
      expect(levels).toHaveLength(4);
      expect(levels[0]!.some((id) => spellInfo(id).school === "storm")).toBe(
        true,
      );
      expect(levels[1]!.filter((id) => spellInfo(id).tool)).toHaveLength(1);
      for (const id of levels.flat())
        expect(spellInfo(id).school, id).not.toBe("accord");
    }
  });
});

describe("The Steamworks (section 9)", () => {
  const b = (id: string) => TREE.buildings[id]!;

  it("starts with the Village Hall, the Tinkers' Workshop and a Tavern", () => {
    expect(TREE.order.filter((id) => b(id).startBuilt)).toEqual([
      "village-hall",
      "tavern",
      "tinkers-workshop",
    ]);
    expect([b("fort-1").name, b("fort-2").name, b("fort-3").name]).toEqual([
      "Riveted Palisade",
      "Ironbound Wall",
      "Gun Keep",
    ]);
  });

  it("dwellings, Drills and specials with the documented costs and needs", () => {
    const rows = [
      "rivet-range",
      "gyro-hangar",
      "mortar-yard",
      "boiler-works",
      "great-foundry",
      "scrap-heap",
      "rivet-forge",
      "powder-magazine",
      "deep-shaft",
      "repair-yard",
    ].map((id) => [id, b(id).cost, b(id).requires]);
    expect(rows).toEqual([
      ["rivet-range", { gold: 800, wood: 5, ore: 3 }, ["tinkers-workshop"]],
      ["gyro-hangar", { gold: 1200, wood: 5, ore: 5 }, ["fort-1"]],
      [
        "mortar-yard",
        { gold: 2000, wood: 5, ore: 8, essence: 1 },
        ["rivet-range"],
      ],
      ["boiler-works", { gold: 4000, wood: 5, ore: 10 }, ["gyro-hangar"]],
      [
        "great-foundry",
        { gold: 8000, wood: 10, ore: 15, essence: 4 },
        ["boiler-works", "mortar-yard"],
      ],
      ["scrap-heap", { gold: 800, ore: 5 }, ["tinkers-workshop"]],
      ["rivet-forge", { gold: 1000, ore: 5 }, ["rivet-range"]],
      ["powder-magazine", { gold: 1500, wood: 5, ore: 5 }, ["mortar-yard"]],
      ["deep-shaft", { gold: 1500, wood: 10 }, ["marketplace"]],
      ["repair-yard", { gold: 3000, ore: 10, essence: 2 }, ["boiler-works"]],
    ]);
    expect(
      TREE.order.flatMap((id) => (b(id).dwelling ? [b(id).dwelling] : [])),
    ).toEqual(DWARVES_CREATURES.map((c) => c.id));
    expect(
      ["scrap-heap", "rivet-forge", "powder-magazine"].map((id) => b(id).drill),
    ).toEqual([
      { creature: "tinker", ability: "salvage" },
      { creature: "rivet-gunner", ability: "red-hot-rivets" },
      { creature: "mortar", ability: "incendiary-shells" },
    ]);
    expect(b("deep-shaft").income).toEqual({ ore: 1 });
    expect(b("repair-yard").special).toBe("repair-yard");
  });

  it("The Great Boiler is the Keystone Hall", () => {
    expect(b("the-great-boiler")).toMatchObject({
      name: "The Great Boiler",
      needsKeystone: true,
      requires: ["city-hall"],
      special: "the-great-boiler",
      growthBonus: true,
    });
    expect(TREE.order[TREE.order.length - 1]).toBe("the-great-boiler");
  });

  it("every requirement names a building of the tree; the totals of section 9", () => {
    for (const id of TREE.order)
      for (const r of b(id).requires) expect(TREE.order, id).toContain(r);
    const sum = (ids: readonly string[]) => {
      const total = [0, 0, 0, 0];
      for (const id of ids) {
        const c = b(id).cost;
        total[0]! += c.gold ?? 0;
        total[1]! += c.wood ?? 0;
        total[2]! += c.ore ?? 0;
        total[3]! += c.essence ?? 0;
      }
      return total;
    };
    expect(
      sum([
        "rivet-range",
        "fort-1",
        "gyro-hangar",
        "mortar-yard",
        "boiler-works",
        "great-foundry",
      ]),
    ).toEqual([18000, 45, 41, 5]);
    // 25 buildings with the three the town starts with and the Keystone.
    expect(TREE.order).toHaveLength(25);
    expect(sum(TREE.order)).toEqual([50800, 125, 128, 19]);
  });

  it("the neutral garrison and town names", () => {
    const fv = TREE.neutralGarrison.reduce(
      (n, g) => n + g.count * getCreature(g.creature).fightValue,
      0,
    );
    expect(fv).toBe(2356);
    expect(TREE.townNames).toEqual([
      "Kettlehold",
      "Cogsdeep",
      "Brassbottom",
      "Rivetrock",
      "Old Smokestack",
    ]);
  });
});

describe("Classes, Commands and named heroes (sections 7, 8)", () => {
  it("the Thane and the Artificer", () => {
    const thane = getHeroClass("thane");
    const art = getHeroClass("artificer");
    expect([thane.leaning, thane.nativeTerrain, thane.command]).toEqual([
      "might",
      "volcanic",
      "ramming-speed",
    ]);
    expect([art.leaning, art.nativeTerrain, art.command]).toEqual([
      "magic",
      "volcanic",
      "overpressure",
    ]);
    expect(thane.stats).toEqual({ attack: 1, defense: 3, power: 1, lore: 1 });
    expect(art.stats).toEqual({ attack: 1, defense: 1, power: 2, lore: 2 });
    expect(thane.pattern.join(" ")).toBe(
      "defense attack defense power defense attack lore defense attack power",
    );
    expect(art.pattern.join(" ")).toBe(
      "power lore power defense power lore attack power lore defense",
    );
    expect(thane.startingSkills).toEqual(["bulwark", "marksmanship"]);
    expect(art.startingSkills).toEqual(["stormcalling", "stewardship"]);
    expect(art.startingPage).toBe("jolt");
    expect(spellInfo("jolt")).toMatchObject({ school: "storm", tier: 1 });
    // Accord 0 for both; Armour leads the Thane, Storm the Artificer.
    expect([thane.weights.covenant, art.weights.covenant]).toEqual([0, 0]);
    expect([thane.weights.bulwark, art.weights.stormcalling]).toEqual([10, 10]);
    expect([thane.weights.marksmanship, thane.weights.riposte]).toEqual([8, 7]);
    const fv = (id: string) =>
      getHeroClass(id).startingArmy.reduce(
        (n, s) => n + s.count * getCreature(s.creature).fightValue,
        0,
      );
    expect([fv("thane"), fv("artificer")]).toEqual([1819, 1800]);
  });

  it("both Commands are written and registered", () => {
    for (const id of ["ramming-speed", "overpressure"]) {
      expect(COMMANDS[id]?.text.length).toBeGreaterThan(20);
      expect(act(id).kind).toBe("command");
    }
  });

  it("eight named heroes, four per class, kept out of the pool until playable", () => {
    const deep = NAMED_HEROES.filter((h) => h.faction === "dwarves");
    expect(deep.map((h) => [h.id, h.heroClass])).toEqual([
      ["brakka", "thane"],
      ["gristle", "thane"],
      ["hilde", "thane"],
      ["dunstan", "thane"],
      ["mags", "artificer"],
      ["silas", "artificer"],
      ["valvina", "artificer"],
      ["nell", "artificer"],
    ]);
    expect(deep.map((h) => h.specialty)).toEqual([
      { kind: "creature", creature: "steam-tank" },
      { kind: "creature", creature: "rivet-gunner" },
      { kind: "command" },
      { kind: "resource", resource: "wood-ore" },
      { kind: "spell", spell: "jolt" },
      { kind: "spell", spell: "on-credit" },
      { kind: "skill", skill: "stormcalling", replaces: "stormcalling" },
      { kind: "creature", creature: "mortar" },
    ]);
    expect(spellInfo("on-credit")).toMatchObject({ school: "hush", tier: 1 });
    const ids = deep.map((h) => h.id);
    expect(rosterFor(["humans", "goblins", "candy"])).toEqual(
      expect.arrayContaining(ids),
    );
    expect(rosterFor(["dwarves"])).toEqual(expect.arrayContaining(ids));
  });
});

describe("Outside the faction (section 5.2)", () => {
  it("the Pocket Boiler is a pocket Wonder worth 4000 with its rule", () => {
    expect(findArtifact("pocket-boiler")).toMatchObject({
      kind: "worn",
      slot: "pocket",
      grade: "wonder",
      value: 4000,
      effects: [{ kind: "switch", id: "pocket-boiler" }],
    });
    expect(RULE_SWITCH_IDS).toContain("pocket-boiler");
  });

  it("Scalding is a feat tagged Stormcalling and Bulwark", () => {
    expect(FEATS["scalding"]).toMatchObject({
      tags: ["stormcalling", "bulwark"],
      effects: [{ kind: "switch", id: "scalding" }],
    });
    expect(RULE_SWITCH_IDS).toContain("scalding");
  });
});

describe("In games since the integration bead (bzc.135)", () => {
  it("generated outposts offer the four lower Deepforge creatures", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const data = rollContents("faction-outpost", createRng(seed), 3);
      if (data["faction"] === "dwarves") seen.add(String(data["creature"]));
    }
    expect([...seen].sort()).toEqual([
      "gyrocopter",
      "mortar",
      "rivet-gunner",
      "tinker",
    ]);
  });

  it("the Pocket Boiler is in the Mystery Bags, the map pool and the gallery", () => {
    expect([...HELD_ARTIFACTS]).toEqual([]);
    expect(mysteryPool("wonder")).toContain("pocket-boiler");
    const shown = galleryTab("artifacts").sections.flatMap((s) =>
      s.entries.map((e) => e.id),
    );
    expect(shown).toContain("pocket-boiler");
    expect(shown).toHaveLength(ARTIFACT_LIST.length);
  });

  it("Scalding is drafted and in the gallery", () => {
    expect([...HELD_FEATS]).toEqual([]);
    const hero = {
      skills: [
        { id: "stormcalling", rank: 3 },
        { id: "bulwark", rank: 3 },
      ],
      feats: [],
      worn: Array.from({ length: 11 }, () => null),
      army: [],
    } as unknown as HeroState;
    const offered = eligibleFeats(hero).map((f) => f.id);
    expect(offered).toContain("firewalkers");
    expect(offered).toContain("scalding");
    const shown = galleryTab("skills").sections.flatMap((s) =>
      s.entries.map((e) => e.id),
    );
    expect(shown).toContain("scalding");
  });

  it("the gallery shows the Deepforge's creatures and classes", () => {
    expect(
      galleryCreatures()
        .filter((c) => c.faction === "dwarves")
        .map((c) => c.id),
    ).toEqual([
      "tinker",
      "rivet-gunner",
      "gyrocopter",
      "mortar",
      "steam-tank",
      "ironclad",
    ]);
    expect(galleryHeroClasses()).toContain("thane");
    expect(galleryHeroClasses()).toContain("artificer");
  });

  it("every Deepforge act and ability the data names is registered", () => {
    for (const id of ["patch-up", "ramming-speed", "overpressure"])
      expect(hasAct(id), id).toBe(true);
  });
});
