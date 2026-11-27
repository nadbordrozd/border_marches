/**
 * The Candy Kingdom's data against FACTION_CANDY.md (sections 2, 4, 7, 8,
 * 9): the roster, the faction record, the Confectionery tree, the classes,
 * the named heroes and the guild.
 */
import { describe, expect, it } from "vitest";
import { ability, act, hasAct } from "../../src/core/battle/index.ts";
import { fightValue } from "../../src/core/game/progression.ts";
import { spellInfo } from "../../src/core/magic/catalog.ts";
import {
  FACTION_SCHOOL_WEIGHTS,
  guildSpells,
} from "../../src/core/magic/guild.ts";
import { registerSpells } from "../../src/core/magic/spells.ts";
import {
  COMMANDS,
  NAMED_HEROES,
  getHeroClass,
} from "../../src/data/classes.ts";
import { getCreature } from "../../src/data/creatures.ts";
import { CANDY_CREATURES, rosterOf } from "../../src/data/factionCreatures.ts";
import { findFaction, townTree } from "../../src/data/factions.ts";
import { rosterFor } from "../../src/data/players.ts";

registerSpells();

const CANDY = findFaction("candy")!;
const TREE = townTree("candy")!;

describe("Candy Kingdom roster (section 4)", () => {
  it("six creatures, tier order, the documented stats and week", () => {
    expect(rosterOf("candy")).toBe(CANDY_CREATURES);
    const rows = CANDY_CREATURES.map((c) => [
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
      ["gingerbread-man", 1, 9, 4, 3, 2, 6, 0, 15, 57],
      ["peppermint-archer", 2, 11, 7, 3, 3, 5, 10, 9, 108],
      ["taffy-wrangler", 3, 24, 8, 6, 5, 6, 0, 7, 186],
      ["sugarplum", 4, 30, 7, 7, 6, 6, 0, 4, 228],
      ["gummy-bear", 5, 95, 12, 15, 14, 4, 0, 2, 857],
      ["rock-candy-dragon", 6, 150, 18, 16, 28, 7, 0, 1, 1750],
    ]);
    const week = [0, 0, 0, 0, 0];
    for (const c of CANDY_CREATURES) {
      expect(c.fightValue, c.id).toBe(fightValue(c));
      week[0]! += c.growth * (c.cost.gold ?? 0);
      week[1]! += c.growth * (c.cost.wood ?? 0);
      week[2]! += c.growth * (c.cost.ore ?? 0);
      week[3]! += c.growth * (c.cost.essence ?? 0);
      week[4]! += c.growth * c.fightValue;
    }
    expect(week).toEqual([10880, 0, 1, 9, 7505]);
  });

  it("abilities registered, sweets for remains, sprites as section 10.2", () => {
    const abilities = CANDY_CREATURES.map((c) => c.abilities ?? []);
    expect(abilities).toEqual([
      ["sugar-rush"],
      ["sitting-ducks"],
      ["reel-in"],
      [],
      ["chewy"],
      ["afters"],
    ]);
    for (const c of CANDY_CREATURES) {
      for (const a of c.abilities ?? []) expect(() => ability(a)).not.toThrow();
      expect(c.tags).toEqual({ remains: "sweets", cannotBear: [] });
      expect(c.sprite).toBe(`candy-${c.id}`);
      expect(c.faction).toBe("candy");
    }
    expect(getCreature("sugarplum").caster).toEqual({
      pages: ["late-bell", "wind"],
      castPower: 1,
      castDivisor: 2,
      castCap: 8,
    });
    for (const p of ["late-bell", "wind"]) expect(hasAct(p)).toBe(true);
  });
});

describe("The faction record (sections 1, 2, 3)", () => {
  it("is playable (integration bead bzc.117)", () => {
    expect(CANDY).toMatchObject({
      name: "The Candy Kingdom",
      available: true,
      heroClasses: ["nutcracker", "confectioner"],
      colour: "#e2589b",
      birthright: { name: "Sticky", ability: "sticky" },
      guildCap: 4,
    });
    expect(ability("sticky").name).toBe("Sticky");
  });

  it("school weights and guild cap match the guild's", () => {
    expect(CANDY.schools).toEqual({
      bloom: 1,
      accord: 3,
      clock: 4,
      hush: 2,
      storm: 0,
    });
    expect(FACTION_SCHOOL_WEIGHTS["candy"]).toEqual({
      weights: CANDY.schools,
      cap: CANDY.guildCap,
    });
    const guild = TREE.order.filter((b) => b.startsWith("magic-guild-"));
    expect(guild).toEqual([1, 2, 3, 4].map((n) => `magic-guild-${n}`));
  });

  it("the guild: four levels, a Clock page at level 1, never Storm", () => {
    const { weights, cap } = FACTION_SCHOOL_WEIGHTS["candy"]!;
    for (const seed of [1, 2, 3, 17, 99]) {
      const levels = guildSpells(seed, weights, cap);
      expect(levels).toHaveLength(4);
      expect(levels[0]!.some((id) => spellInfo(id).school === "clock")).toBe(
        true,
      );
      expect(levels[1]!.filter((id) => spellInfo(id).tool)).toHaveLength(1);
      expect(levels[1]).not.toContain("set-off");
      for (const id of levels.flat())
        expect(spellInfo(id).school, id).not.toBe("storm");
    }
  });
});

describe("The Confectionery (section 9)", () => {
  const b = (id: string) => TREE.buildings[id]!;

  it("starts with the Village Hall, the Gingerbread House and a Tavern", () => {
    expect(TREE.order.filter((id) => b(id).startBuilt)).toEqual([
      "village-hall",
      "tavern",
      "gingerbread-house",
    ]);
    expect([b("fort-1").name, b("fort-2").name, b("fort-3").name]).toEqual([
      "Candy-Cane Fence",
      "Gingerbread Wall",
      "Sugar-Glass Keep",
    ]);
  });

  it("dwellings, Drills and specials with the documented costs and needs", () => {
    const rows = [
      "mint-range",
      "taffy-ranch",
      "sugarplum-bower",
      "gummy-den",
      "rock-candy-grotto",
      "bread-oven",
      "mint-press",
      "pulling-hooks",
      "bakery",
      "larder",
    ].map((id) => [id, b(id).cost, b(id).requires]);
    expect(rows).toEqual([
      ["mint-range", { gold: 750, wood: 5, essence: 1 }, ["gingerbread-house"]],
      ["taffy-ranch", { gold: 1200, wood: 10 }, ["fort-1"]],
      ["sugarplum-bower", { gold: 2000, wood: 5, essence: 4 }, ["mint-range"]],
      [
        "gummy-den",
        { gold: 3800, wood: 10, ore: 3, essence: 3 },
        ["taffy-ranch"],
      ],
      [
        "rock-candy-grotto",
        { gold: 8000, wood: 10, ore: 5, essence: 8 },
        ["gummy-den", "sugarplum-bower"],
      ],
      ["bread-oven", { gold: 800, wood: 5 }, ["gingerbread-house"]],
      ["mint-press", { gold: 1000, wood: 5, essence: 1 }, ["mint-range"]],
      ["pulling-hooks", { gold: 1500, wood: 10 }, ["taffy-ranch"]],
      ["bakery", { gold: 1000, wood: 5 }, ["gingerbread-house"]],
      ["larder", { gold: 3000, wood: 5, essence: 3 }, ["sugarplum-bower"]],
    ]);
    // One dwelling per creature, in tier order.
    expect(
      TREE.order.flatMap((id) => (b(id).dwelling ? [b(id).dwelling] : [])),
    ).toEqual(CANDY_CREATURES.map((c) => c.id));
    expect(
      ["bread-oven", "mint-press", "pulling-hooks"].map((id) => b(id).drill),
    ).toEqual([
      { creature: "gingerbread-man", ability: "hot-from-the-oven" },
      { creature: "peppermint-archer", ability: "cool-mint" },
      { creature: "taffy-wrangler", ability: "long-pull" },
    ]);
    for (const id of ["hot-from-the-oven", "cool-mint", "long-pull"])
      expect(() => ability(id)).not.toThrow();
    expect(b("bakery").growthExtra).toEqual({
      creature: "gingerbread-man",
      amount: 8,
    });
    expect(b("larder").special).toBe("larder");
  });

  it("The Four O'Clock is the Keystone Hall", () => {
    expect(b("the-four-oclock")).toMatchObject({
      name: "The Four O'Clock",
      needsKeystone: true,
      requires: ["city-hall"],
      special: "the-four-oclock",
      growthBonus: true,
    });
    expect(TREE.order[TREE.order.length - 1]).toBe("the-four-oclock");
  });

  it("every requirement names a building of the tree; the tier 6 chain", () => {
    for (const id of TREE.order)
      for (const r of b(id).requires) expect(TREE.order, id).toContain(r);
    const chain = [
      "mint-range",
      "fort-1",
      "taffy-ranch",
      "sugarplum-bower",
      "gummy-den",
      "rock-candy-grotto",
    ];
    const total = [0, 0, 0, 0];
    for (const id of chain) {
      const c = b(id).cost;
      total[0]! += c.gold ?? 0;
      total[1]! += c.wood ?? 0;
      total[2]! += c.ore ?? 0;
      total[3]! += c.essence ?? 0;
    }
    expect(total).toEqual([17750, 55, 8, 16]);
  });

  it("the neutral garrison and town names", () => {
    const fv = TREE.neutralGarrison.reduce(
      (n, g) => n + g.count * getCreature(g.creature).fightValue,
      0,
    );
    expect(fv).toBe(2346);
    expect(TREE.townNames).toEqual([
      "Sugarloaf",
      "Toffee Hollow",
      "Marzipan Mews",
      "Fudgecombe",
      "Gumdrop Green",
    ]);
  });
});

describe("Classes, Commands and named heroes (sections 7, 8)", () => {
  it("the Nutcracker and the Confectioner", () => {
    const nut = getHeroClass("nutcracker");
    const con = getHeroClass("confectioner");
    expect([nut.leaning, nut.nativeTerrain, nut.command]).toEqual([
      "might",
      "frosting",
      "crack",
    ]);
    expect([con.leaning, con.nativeTerrain, con.command]).toEqual([
      "magic",
      "frosting",
      "come-in-dear",
    ]);
    expect(nut.stats).toEqual({ attack: 2, defense: 2, power: 1, lore: 1 });
    expect(con.stats).toEqual({ attack: 1, defense: 1, power: 2, lore: 2 });
    expect(nut.pattern.join(" ")).toBe(
      "defense attack defense power attack defense lore attack defense power",
    );
    expect(con.pattern.join(" ")).toBe(
      "lore power lore defense power lore attack power lore defense",
    );
    expect(nut.startingSkills).toEqual(["bulwark", "vanguard"]);
    expect(con.startingSkills).toEqual(["horology", "silver-tongue"]);
    expect(con.startingPage).toBe("appointment");
    expect(spellInfo("appointment").school).toBe("clock");
    // Storm is 0 for both; Armour leads the Nutcracker, Clock the Confectioner.
    expect([nut.weights.stormcalling, con.weights.stormcalling]).toEqual([
      0, 0,
    ]);
    expect([nut.weights.bulwark, con.weights.horology]).toEqual([9, 10]);
    expect(con.weights["silver-tongue"]).toBe(8);
    const fv = (id: string) =>
      getHeroClass(id).startingArmy.reduce(
        (n, s) => n + s.count * getCreature(s.creature).fightValue,
        0,
      );
    expect([fv("nutcracker"), fv("confectioner")]).toEqual([1788, 1794]);
  });

  it("both Commands are written and registered", () => {
    for (const id of ["crack", "come-in-dear"]) {
      expect(COMMANDS[id]?.text.length).toBeGreaterThan(20);
      expect(act(id).kind).toBe("command");
    }
  });

  it("eight named heroes, four per class, in every game's pool", () => {
    const candy = NAMED_HEROES.filter((h) => h.faction === "candy");
    expect(candy.map((h) => [h.id, h.heroClass])).toEqual([
      ["kernel", "nutcracker"],
      ["brittle", "nutcracker"],
      ["walnut", "nutcracker"],
      ["humbug", "nutcracker"],
      ["praline", "confectioner"],
      ["treacle", "confectioner"],
      ["fondant", "confectioner"],
      ["gingersnap", "confectioner"],
    ]);
    expect(candy.map((h) => h.specialty)).toEqual([
      { kind: "creature", creature: "peppermint-archer" },
      { kind: "creature", creature: "gummy-bear" },
      { kind: "command" },
      { kind: "resource", resource: "gold" },
      { kind: "spell", spell: "late-bell" },
      { kind: "spell", spell: "treacle" },
      { kind: "skill", skill: "horology", replaces: "horology" },
      { kind: "creature", creature: "gingerbread-man" },
    ]);
    const ids = candy.map((h) => h.id);
    expect(rosterFor(["humans", "goblins"])).toEqual(
      expect.arrayContaining(ids),
    );
    expect(rosterFor(["candy"])).toEqual(expect.arrayContaining(ids));
  });
});
