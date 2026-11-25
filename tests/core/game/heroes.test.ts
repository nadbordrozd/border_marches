/**
 * Heroes v2 (RULES_V2 3): stats, the XP curve, level-up offers seeded per
 * hero and level, the guarantee, wheel weights, feats and vows, the hook
 * framework's adventure numbers. Hand-built states only.
 */
import { describe, expect, it } from "vitest";
import {
  armyLuck,
  armyMorale,
  chooseLevelUp,
  cloneState,
  commandStrength,
  eligibleFeats,
  featOffers,
  gainXp,
  heroIncome,
  heroStats,
  levelUpOffer,
  manaRegen,
  maxMana,
  movementBreakdown,
  movementPoints,
  newHeroState,
  pagePower,
  regeneratedMana,
  sightRadius,
  skillOffers,
  skillWeight,
  startHeroDay,
  stepCost,
  terrainProfile,
  type GameEvent,
  type GameState,
  type HeroState,
} from "../../../src/core/game/index.ts";
import { CHIEFTAIN, HERO_CLASSES } from "../../../src/data/classes.ts";
import { PRIMARY_STATS } from "../../../src/data/effects.ts";
import { getSkill } from "../../../src/data/skills.ts";
import { spellInfo } from "../../../src/core/magic/catalog.ts";
import { FEATS } from "../../../src/data/feats.ts";
import { HERO_ROSTER } from "../../../src/data/players.ts";
import { buildMap, errorOf, field, gameOn, ok } from "./helpers.ts";

/** A one-hero game whose hero has no specialty and only `skills`. */
function plain(
  skills: Array<{ id: string; rank: number }> = [],
  edit: (h: HeroState) => void = () => {},
): GameState {
  const s = cloneState(gameOn(field(8, 3), []));
  const h = s.heroes[0]!;
  h.defId = "nobody";
  h.skills = skills;
  edit(h);
  return s;
}

const hero = (s: GameState): HeroState => s.heroes[0]!;

describe("classes (RULES_V2 3.1, 3.6)", () => {
  it("start with six stat points, Power and Lore at least 1, a valid pattern", () => {
    for (const cls of Object.values(HERO_CLASSES)) {
      const st = cls.stats;
      expect(st.attack + st.defense + st.power + st.lore, cls.id).toBe(6);
      expect(st.power).toBeGreaterThanOrEqual(1);
      expect(st.lore).toBeGreaterThanOrEqual(1);
      expect(cls.pattern).toHaveLength(10);
      for (const stat of PRIMARY_STATS) expect(cls.pattern).toContain(stat);
      const might = cls.pattern.filter(
        (p) => p === "attack" || p === "defense",
      ).length;
      expect(might, cls.id).toBe(cls.leaning === "might" ? 7 : 3);
      expect(cls.startingSkills).toHaveLength(2);
      for (const w of Object.values(cls.weights)) {
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThanOrEqual(10);
      }
      if (cls.leaning === "magic") {
        // One school skill and a tier 1 page of that school (3.6).
        const schools = cls.startingSkills.flatMap((id) => {
          const school = getSkill(id).school;
          return school === undefined ? [] : [school];
        });
        expect(schools, cls.id).toHaveLength(1);
        const page = spellInfo(cls.startingPage!);
        expect(page.tier, cls.id).toBe(1);
        expect(page.school, cls.id).toBe(schools[0]);
      }
    }
  });

  it("builds a level-1 hero with full mana and movement from its army", () => {
    const def = HERO_ROSTER.find((h) => h.specialty?.kind === "skill")!;
    const h = newHeroState("h", def, 0, 0, 0);
    expect(h).toMatchObject({ attack: 2, defense: 2, power: 1, lore: 1 });
    expect(h.mana).toBe(10);
    // Cavemen are the slowest (Speed 4): 1300 + 50 x 4 (RULES_V2 3.9).
    expect(h.maxMp).toBeGreaterThanOrEqual(1500);
    // A Skill specialty: rank 2 in place of the class skill it replaces.
    const spec = def.specialty as { skill: string; replaces: string };
    expect(h.skills).toContainEqual({ id: spec.skill, rank: 2 });
    expect(h.skills.map((x) => x.id)).not.toContain(spec.replaces);
  });
});

describe("XP and levels (RULES_V2 3.2, 3.3)", () => {
  it("adds the pattern stat for each level and counts pending choices", () => {
    const s = plain();
    const h = hero(s);
    const events: GameEvent[] = [];
    gainXp(h, 1800, events); // level 4
    expect(h.level).toBe(4);
    expect(h.pendingLevelUps).toBe(3);
    // Chieftain pattern A, D, A, P, ...: levels 2, 3, 4.
    expect(CHIEFTAIN.pattern.slice(0, 3)).toEqual([
      "attack",
      "defense",
      "attack",
    ]);
    expect(h).toMatchObject({ attack: 4, defense: 3, power: 1, lore: 1 });
    expect(events.filter((e) => e.type === "stat-gained")).toHaveLength(3);
  });

  it("applies XP percentages to each gain, floored", () => {
    const s = plain([{ id: "quick-study", rank: 2 }]);
    const events: GameEvent[] = [];
    gainXp(hero(s), 333, events);
    expect(hero(s).xp).toBe(399); // floor(333 x 1.2)
  });
});

describe("skill offers (RULES_V2 3.3)", () => {
  it("are fixed for a hero and level, and differ by level", () => {
    const s = plain([{ id: "onslaught", rank: 1 }]);
    gainXp(hero(s), 400, []);
    const a = levelUpOffer(s, "hero-0");
    const b = levelUpOffer(cloneState(s), "hero-0");
    expect(a).toEqual(b);
    expect(a?.step).toBe("skill");
    expect(a?.offers).toHaveLength(3);
    const other = cloneState(s);
    gainXp(hero(other), 600, []); // now level 3 pending as well
    hero(other).pendingLevelUps = 1; // pretend level 2 was taken
    expect(levelUpOffer(other, "hero-0")?.level).toBe(3);
  });

  it("guarantees an upgrade of a held skill as offer 1", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = plain([
        { id: "onslaught", rank: 1 },
        { id: "wayfaring", rank: 3 },
      ]);
      s.seed = seed;
      gainXp(hero(s), 400, []);
      const offers = skillOffers(s, hero(s));
      expect(offers[0]).toEqual({
        kind: "upgrade",
        skill: "onslaught",
        rank: 2,
      });
      const skills = offers.map((o) => ("skill" in o ? o.skill : o.stat));
      expect(new Set(skills).size).toBe(3);
      // A rank-3 skill is never offered again.
      expect(skills).not.toContain("wayfaring");
    }
  });

  it("weights school skills by the wheel: allied x4, opposed x1, else x2", () => {
    const s = plain([{ id: "covenant", rank: 1 }]); // Accord
    const h = hero(s);
    const w = CHIEFTAIN.weights;
    // Bloom is allied to Accord; Hush is opposed; Onslaught is not a school.
    expect(skillWeight(h, "greencraft", 1)).toBe((w.greencraft ?? 0) * 4);
    expect(skillWeight(h, "quietus", 1)).toBe((w.quietus ?? 0) * 1);
    expect(skillWeight(h, "onslaught", 1)).toBe((w.onslaught ?? 0) * 2);
    // Opposed wins when both apply: Clock is allied to Accord, opposed to Bloom.
    h.skills.push({ id: "greencraft", rank: 1 });
    expect(skillWeight(h, "horology", 1)).toBe((w.horology ?? 0) * 1);
  });

  it("falls back to stat offers in pattern order after this level's entry", () => {
    const full = [
      "onslaught",
      "bulwark",
      "banner",
      "wayfaring",
      "lookout",
      "stewardship",
    ].map((id) => ({ id, rank: 3 }));
    const s = plain(full);
    gainXp(hero(s), 400, []); // level 2 uses entry 0 (A); next: D, A, P
    expect(skillOffers(s, hero(s))).toEqual([
      { kind: "stat", stat: "defense" },
      { kind: "stat", stat: "attack" },
      { kind: "stat", stat: "power" },
    ]);
    const r = ok(chooseLevelUp(s, "hero-0", 2)).state;
    expect(hero(r).power).toBe(2);
  });

  it("takes a new skill or an upgrade, then a feat at level 3", () => {
    let s = plain([{ id: "onslaught", rank: 1 }]);
    gainXp(hero(s), 1000, []); // levels 2 and 3
    s = ok(chooseLevelUp(s, "hero-0", 0)).state; // level 2: guarantee
    expect(hero(s).skills[0]).toEqual({ id: "onslaught", rank: 2 });
    const l3 = levelUpOffer(s, "hero-0")!;
    expect(l3).toMatchObject({ step: "skill", level: 3 });
    s = ok(chooseLevelUp(s, "hero-0", 1)).state;
    const feat = levelUpOffer(s, "hero-0")!;
    expect(feat).toMatchObject({ step: "feat", level: 3 });
    expect(feat.offers.length).toBeGreaterThan(0);
    const r = ok(chooseLevelUp(s, "hero-0", 0));
    expect(hero(r.state).feats).toEqual([feat.offers[0]]);
    expect(hero(r.state).pendingLevelUps).toBe(0);
    expect(errorOf(chooseLevelUp(r.state, "hero-0", 0))).toBe("no-level-up");
    expect(errorOf(chooseLevelUp(s, "hero-0", 7))).toBe("bad-choice");
  });

  it("still pays out levels once the game is won, not once it is lost", () => {
    const s = plain([{ id: "onslaught", rank: 1 }]);
    gainXp(hero(s), 400, []);
    const won = cloneState(s);
    won.status = "won";
    const r = ok(chooseLevelUp(won, "hero-0", 0));
    expect(hero(r.state).pendingLevelUps).toBe(0);
    expect(r.state.status).toBe("won");
    const lost = cloneState(s);
    lost.status = "lost";
    expect(errorOf(chooseLevelUp(lost, "hero-0", 0))).toBe("game-over");
  });

  it("redraws the next offer once with the Elixir of Hindsight", () => {
    const s = plain([{ id: "onslaught", rank: 1 }]);
    gainXp(hero(s), 400, []);
    const before = skillOffers(s, hero(s));
    const drawn = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) {
      s.seed = seed;
      hero(s).redraw = false;
      const a = JSON.stringify(skillOffers(s, hero(s)));
      hero(s).redraw = true;
      const b = JSON.stringify(skillOffers(s, hero(s)));
      drawn.add(a === b ? "same" : "different");
    }
    expect(drawn.has("different")).toBe(true);
    expect(before).toHaveLength(3);
  });
});

describe("feats and vows (RULES_V2 3.5)", () => {
  it("weighs feats by the hero's ranks in their tags", () => {
    const s = plain([{ id: "onslaught", rank: 2 }]);
    const pile = FEATS["pile-on"]!; // Horology, Onslaught
    const offers = new Map<string, number>();
    for (let seed = 1; seed <= 200; seed++) {
      s.seed = seed;
      for (const f of featOffers(s, hero(s))) {
        offers.set(f, (offers.get(f) ?? 0) + 1);
      }
    }
    expect(pile.tags).toContain("onslaught");
    // Weight 5 against 1 for untagged feats: drafted the most.
    const most = [...offers.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    expect(["pile-on", "vow-of-the-unlettered"]).toContain(most);
  });

  it("offers a vow only when the hero already keeps its restriction", () => {
    const school = plain([{ id: "covenant", rank: 1 }]);
    const ids = eligibleFeats(hero(school)).map((f) => f.id);
    expect(ids).not.toContain("vow-of-the-unlettered"); // holds a school skill
    expect(ids).toContain("vow-of-the-grave");
    const booted = plain([], (h) => {
      h.worn[8] = "seven-furlong-boots";
    });
    expect(eligibleFeats(hero(booted)).map((f) => f.id)).not.toContain(
      "vow-of-the-barefoot-pilgrim",
    );
  });

  it("drafts at least one non-vow feat", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const s = plain();
      s.seed = seed;
      const offers = featOffers(s, hero(s));
      expect(offers.length).toBe(3);
      expect(offers.some((id) => FEATS[id]!.restriction === undefined)).toBe(
        true,
      );
    }
  });

  it("enforces a vow: barred skills weigh 0", () => {
    const s = plain([], (h) => {
      h.feats = ["vow-of-the-unlettered", "vow-of-the-grave"];
    });
    const h = hero(s);
    for (const id of ["greencraft", "covenant", "stormcalling"] as const) {
      expect(skillWeight(h, id, 1)).toBe(0);
    }
    expect(skillWeight(h, "onslaught", 1)).toBeGreaterThan(0);
    for (let seed = 1; seed <= 20; seed++) {
      s.seed = seed;
      gainXp(h, seed === 1 ? 400 : 0, []);
      for (const o of skillOffers(s, h)) {
        if (o.kind !== "stat") {
          expect(["greencraft", "covenant", "horology"]).not.toContain(o.skill);
        }
      }
    }
  });
});

describe("hook framework: adventure numbers (RULES_V2 2.3, 3.1, 3.9)", () => {
  it("adds artifact and skill stats, clamped 0..40", () => {
    const s = plain([], (h) => {
      h.worn[0] = "thinking-cap"; // +2 Power
      h.worn[6] = "knuckle-dusters"; // +1 A, +1 D
      h.attack = 45;
    });
    expect(heroStats(hero(s))).toEqual({
      attack: 40,
      defense: 3,
      power: 3,
      lore: 1,
    });
  });

  it("computes mana: 10 x Lore, percentages, daily return, no regen above max", () => {
    const s = plain([{ id: "deep-wells", rank: 2 }], (h) => {
      h.lore = 6;
      h.worn[3] = "oilskin-of-deep-pockets"; // +15%
    });
    const h = hero(s);
    expect(maxMana(h)).toBe(Math.floor((60 * 135) / 100)); // 81
    expect(manaRegen(h)).toBe(1 + 2 + 2);
    h.mana = 0;
    expect(regeneratedMana(h)).toBe(5);
    h.mana = 100;
    expect(regeneratedMana(h)).toBe(100);
  });

  it("computes movement from the slowest creature, percentages and flat", () => {
    const s = plain([{ id: "wayfaring", rank: 2 }], (h) => {
      h.worn[8] = "seven-furlong-boots";
    });
    const h = hero(s);
    // Cavemen Speed 4: base 1500; +30%; floor.
    expect(movementBreakdown(h)).toMatchObject({ base: 1500, percent: 30 });
    expect(movementPoints(h)).toBe(1950);
    h.army = [
      { creature: "t-rex", count: 1 },
      null,
      null,
      null,
      null,
      null,
      null,
    ];
    // A T-rex alone sets the base by its own Speed, clamped to 2..8.
    expect(movementBreakdown(h).base).toBeGreaterThanOrEqual(1400);
    h.mpDebt = 300;
    startHeroDay(h);
    expect(h.mpDebt).toBe(0);
    expect(h.mp).toBe(h.maxMp);
  });

  it("caps movement at 3000 and sight at 12", () => {
    const s = plain([{ id: "lookout", rank: 3 }], (h) => {
      h.worn[9] = "spyglass";
      h.feats = ["vow-of-the-barefoot-pilgrim"];
    });
    expect(sightRadius(hero(s))).toBe(10);
    hero(s).skills.push({ id: "wayfaring", rank: 3 });
    expect(movementPoints(hero(s))).toBeLessThanOrEqual(3000);
  });

  it("lowers rough terrain toward 100 (Trailcraft, Galoshes), roads stay 70", () => {
    const map = buildMap(["gjbw"], []);
    const t1 = plain([{ id: "trailcraft", rank: 1 }]);
    const p1 = terrainProfile(hero(t1));
    expect(stepCost(map, p1, 0, 0, 1, 0)).toBe(100); // jungle native
    expect(stepCost(map, p1, 1, 0, 2, 0)).toBe(100); // badlands 125 - 25
    expect(stepCost(map, p1, 2, 0, 3, 0)).toBe(125); // wasteland 150 - 25
    const gal = plain([], (h) => {
      h.worn[8] = "galoshes";
    });
    expect(stepCost(map, terrainProfile(hero(gal)), 2, 0, 3, 0)).toBe(100);
    expect(stepCost(map, terrainProfile(hero(gal)), 1, 0, 2, 0)).toBe(125);
  });

  it("pays income from skills, artifacts and Resource specialties", () => {
    const s = plain([{ id: "stewardship", rank: 1 }], (h) => {
      h.worn[6] = "moneylenders-ring";
    });
    expect(heroIncome(hero(s), 3).gold).toBe(250);
    const essence = HERO_ROSTER.find(
      (d) =>
        d.specialty?.kind === "resource" && d.specialty.resource === "essence",
    )!;
    const e = cloneState(s);
    hero(e).defId = essence.id;
    hero(e).skills = [];
    hero(e).worn[6] = null;
    expect(heroIncome(hero(e), 2).essence).toBe(1);
    expect(heroIncome(hero(e), 3).essence).toBe(0);
  });

  it("reads Morale, Luck, page Power and the Command's C", () => {
    const s = plain(
      [
        { id: "banner", rank: 2 },
        { id: "greencraft", rank: 3 },
      ],
      (h) => {
        h.worn[3] = "regimental-sash";
        h.worn[1] = "sprig-pendant";
        h.nextBattle = ["bottled-cheer", "jar-of-fair-chances"];
        h.level = 10;
      },
    );
    const h = hero(s);
    expect(armyMorale(h)).toBe(3); // 2 + 1 + 1, clamped to 3
    expect(armyLuck(h)).toBe(1);
    // Power 1 + rank 3 bonus 4 + pendant 2.
    expect(pagePower(h, "bloom")).toBe(7);
    expect(pagePower(h, "storm")).toBe(1);
    expect(commandStrength(h)).toBe(3);
  });
});
