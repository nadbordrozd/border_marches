/**
 * The magic wheel (bead border_marches-bzc.100): its model is read from the
 * game's data, so these check that it says what the rules say. The dialog
 * itself is checked by the screen tour (tests/ui/screens-check.mjs,
 * "wheel-*").
 */

import { describe, expect, it } from "vitest";
import {
  SCHOOLS,
  alliedSchools,
  opposedSchools,
  schoolRelation,
} from "../../src/core/battle/index.ts";
import type { School } from "../../src/core/battle/index.ts";
import { FACTION_SCHOOL_WEIGHTS } from "../../src/core/magic/guild.ts";
import { FACTIONS, playableFactions } from "../../src/data/factions.ts";
import { keyword } from "../../src/data/keywords.ts";
import { SCHOOL_NAMES } from "../../src/data/effects.ts";
import {
  leaningAngle,
  magicWheelModel,
  rankWords,
} from "../../src/ui/magic-wheel-model.ts";

const model = magicWheelModel();

/** Smallest distance between two angles in degrees. */
function apart(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

describe("magic wheel model: schools and links", () => {
  it("has the five schools in wheel order, 72 degrees apart", () => {
    expect(model.schools.map((s) => s.id)).toEqual([...SCHOOLS]);
    expect(model.schools.map((s) => s.angle)).toEqual([0, 72, 144, 216, 288]);
  });

  it("gives each school the rule's allied and opposed pairs", () => {
    for (const s of model.schools) {
      expect([...s.allied].sort()).toEqual(alliedSchools(s.id).sort());
      expect([...s.opposed].sort()).toEqual(opposedSchools(s.id).sort());
    }
  });

  it("has every pair once: five allied, five opposed, symmetric", () => {
    const allied = model.links.filter((l) => l.kind === "allied");
    const opposed = model.links.filter((l) => l.kind === "opposed");
    expect(allied).toHaveLength(5);
    expect(opposed).toHaveLength(5);
    const keys = model.links.map((l) => [l.a, l.b].sort().join("-"));
    expect(new Set(keys).size).toBe(10);
    for (const l of model.links) {
      expect(schoolRelation(l.a, l.b)).toBe(l.kind);
      expect(schoolRelation(l.b, l.a)).toBe(l.kind);
    }
    // Allied are neighbours (one step), opposed are across (two steps).
    for (const l of model.links) {
      const d = Math.abs(SCHOOLS.indexOf(l.a) - SCHOOLS.indexOf(l.b));
      expect(Math.min(d, 5 - d)).toBe(l.kind === "allied" ? 1 : 2);
    }
  });

  it("takes each theme from the glossary, whose relation sentence matches the rule", () => {
    for (const s of model.schools) {
      expect(s.theme.length).toBeGreaterThan(10);
      expect(s.theme).not.toMatch(/Allied|opposed/);
      const text = keyword(`school-${s.id}`).text;
      const names = (list: readonly School[]): string =>
        list.map((x) => SCHOOL_NAMES[x]).join(" and ");
      expect(text).toContain(
        `Allied with ${names(s.allied)}; opposed to ${names(s.opposed)}.`,
      );
    }
  });

  it("says what each rank gives (RULES_V2 2.2)", () => {
    expect(model.ranks.map(rankWords)).toEqual([
      "learns tiers 1-2",
      "learns tiers 1-4, +2 Power",
      "learns tiers 1-5, +4 Power",
    ]);
    expect(model.schools.map((s) => s.skill)).toEqual(
      expect.arrayContaining(["Greencraft", "Stormcalling", "Quietus"]),
    );
  });

  it("explains allied and opposed in play: Echo, Fuel, the Glove", () => {
    expect(model.echo).toMatch(/allied/);
    expect(model.fuel).toMatch(/opposed/);
    const names = model.opposedArtifacts.map((a) => a.name);
    expect(names).toContain("The Second Left Glove");
    expect(names.length).toBeGreaterThanOrEqual(4);
  });
});

describe("magic wheel model: factions", () => {
  it("lists every magical faction with the schools its guild teaches", () => {
    const magical = model.factions.filter((f) => f.magical);
    expect(magical.map((f) => f.id).sort()).toEqual(
      Object.keys(FACTION_SCHOOL_WEIGHTS).sort(),
    );
    for (const f of magical) {
      const w = FACTION_SCHOOL_WEIGHTS[f.id]?.weights;
      expect(f.weights).toEqual(w);
      expect(f.schools.length).toBeGreaterThanOrEqual(2);
      for (const s of SCHOOLS)
        expect(f.schools.includes(s)).toBe((w?.[s] ?? 0) > 0);
      // Heaviest first.
      const ws = f.schools.map((s) => f.weights[s]);
      expect(ws).toEqual([...ws].sort((a, b) => b - a));
      expect(f.guildCap).toBe(FACTION_SCHOOL_WEIGHTS[f.id]?.cap);
      expect(f.angle).not.toBeNull();
      expect(f.hero.leaning).toBe("magic");
    }
    // Every playable faction is on the wheel and magical.
    for (const p of playableFactions())
      expect(magical.map((f) => f.id)).toContain(p.id);
  });

  it("sits each faction nearest its heaviest school", () => {
    for (const f of model.factions.filter((x) => x.magical)) {
      const top = f.schools[0] as School;
      const near = [...model.schools].sort(
        (a, b) =>
          apart(a.angle, f.angle as number) - apart(b.angle, f.angle as number),
      );
      expect(near.slice(0, 2).map((s) => s.id)).toContain(top);
    }
    expect(
      leaningAngle({ bloom: 0, accord: 0, clock: 0, hush: 0, storm: 0 }),
    ).toBeNull();
    expect(
      leaningAngle({ bloom: 0, accord: 0, clock: 4, hush: 0, storm: 0 }),
    ).toBeCloseTo(144);
  });

  it("shows the Lost World apart, without magic", () => {
    const lost = model.factions.find((f) => f.id === "lost-world");
    expect(lost).toBeDefined();
    expect(lost?.magical).toBe(false);
    expect(lost?.schools).toEqual([]);
    expect(lost?.guildCap).toBe(0);
    expect(lost?.angle).toBeNull();
    expect(lost?.hero.leaning).toBe("might");
    expect(model.factions.filter((f) => !f.magical)).toHaveLength(1);
    // The magical ones come first.
    expect(model.factions.at(-1)?.id).toBe("lost-world");
  });

  it("lists, for each school, the factions that lean on it", () => {
    for (const s of model.schools) {
      for (const f of model.factions)
        expect(s.leaners.some((l) => l.faction === f.id)).toBe(
          f.weights[s.id] > 0,
        );
    }
    // Nobody's guild skips every faction's school: each is taught somewhere.
    for (const s of model.schools) expect(s.leaners.length).toBeGreaterThan(0);
  });

  it("keeps the faction registry's leanings equal to the guild's", () => {
    for (const f of FACTIONS) {
      if (f.schools === undefined) continue;
      expect(f.schools).toEqual(FACTION_SCHOOL_WEIGHTS[f.id]?.weights);
      expect(f.guildCap).toBe(FACTION_SCHOOL_WEIGHTS[f.id]?.cap);
    }
  });
});
