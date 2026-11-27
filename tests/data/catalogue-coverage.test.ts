/**
 * Catalogue coverage (bead bzc.12): every skill, feat, vow, artifact and
 * spell of the v0.2 catalogue (the names of CONTENT_HEROES, CONTENT_
 * ARTIFACTS and CONTENT_SPELLS, as the icon catalogue lists them) has a
 * data row, or is in an explicit deferred list with its reason.
 */
import { describe, expect, it } from "vitest";
import catalogue from "../../src/assets/icon-catalogue.json";
import { contentId } from "../../src/assets/icons.ts";
import { allSpells, adventureSpell } from "../../src/core/magic/index.ts";
import {
  ARTIFACT_LIST,
  DEFERRED_ARTIFACTS,
  findArtifact,
} from "../../src/data/artifacts.ts";
import { findFeat, isVow } from "../../src/data/feats.ts";
import {
  DEFERRED_SKILLS,
  SKILL_IDS,
  findSkill,
} from "../../src/data/skills.ts";
import { NAVAL_ICONS_PENDING } from "../../src/data/naval.ts";

/**
 * The naval content (bead bzc.154) has data rows but no catalogue icon yet:
 * its icons are art bead 9c (bzc.159). The explicit list lives in
 * src/data/naval.ts; each id there must be real content, and nothing else
 * may be missing from the catalogue.
 */
const pending = (kind: keyof typeof NAVAL_ICONS_PENDING): string[] => [
  ...NAVAL_ICONS_PENDING[kind],
];

const ids = (kind: keyof typeof catalogue): string[] =>
  Object.keys(catalogue[kind]);

describe("catalogue coverage", () => {
  it("skills: all 24 rows (none deferred)", () => {
    expect(ids("skill")).toHaveLength(24);
    expect([...SKILL_IDS].sort()).toEqual(
      [...ids("skill"), ...pending("skill")].sort(),
    );
    for (const id of pending("skill")) expect(findSkill(id), id).toBeDefined();
    for (const id of ids("skill")) {
      const deferred = DEFERRED_SKILLS[id as keyof typeof DEFERRED_SKILLS];
      if (deferred !== undefined) {
        expect(deferred.length).toBeGreaterThan(20);
        expect(findSkill(id)).toBeUndefined();
      } else expect(findSkill(id), id).toBeDefined();
    }
    expect(Object.keys(DEFERRED_SKILLS)).toEqual([]);
  });

  it("feats: all 28 rows, none a vow", () => {
    expect(ids("feat")).toHaveLength(28);
    for (const id of ids("feat")) {
      const def = findFeat(id);
      expect(def, id).toBeDefined();
      expect(isVow(def!)).toBe(false);
    }
  });

  it("vows: all 12 rows, each with a restriction", () => {
    expect(ids("vow")).toHaveLength(12);
    for (const id of ids("vow")) {
      const def = findFeat(id);
      expect(def, id).toBeDefined();
      expect(isVow(def!)).toBe(true);
      expect(def!.restrictionText).toBeTruthy();
    }
  });

  it("artifacts: all 80 kinds and 4 Marvels, ids from names, with values", () => {
    // The 84 catalogue kinds, the Candy Kingdom's Flypaper Ribbon
    // (FACTION_CANDY 5.2, icon bead bzc.112), the Deepforge's Pocket Boiler
    // (FACTION_DWARVES 5.2, icon wired in bead bzc.135) and the Keystone, a
    // relic of the map objects (not a catalogue kind) with an icon by its
    // game id (bead 9is).
    expect(ids("artifact")).toHaveLength(87);
    // The 84, the Flypaper Ribbon and the Pocket Boiler, and the eight sea
    // artifacts (bead bzc.154) whose icons are pending (bzc.159).
    expect(ARTIFACT_LIST.filter((a) => a.kind !== "relic")).toHaveLength(94);
    const listed = new Set([...ids("artifact"), ...pending("artifact")]);
    for (const a of ARTIFACT_LIST) expect(listed.has(a.id), a.id).toBe(true);
    for (const id of pending("artifact")) {
      const def = findArtifact(id);
      expect(def, id).toBeDefined();
      expect(contentId(def!.name)).toBe(id);
    }
    for (const id of ids("artifact")) {
      const def = findArtifact(id);
      expect(def, id).toBeDefined();
      expect(def!.kind === "relic" ? def!.id : contentId(def!.name)).toBe(id);
      expect(def!.value).toBeGreaterThan(0);
    }
    const grade = (g: string) =>
      ARTIFACT_LIST.filter(
        (a) =>
          a.kind === "worn" &&
          a.grade === g &&
          a.pieceOf === undefined &&
          a.cursed !== true,
      ).length;
    // 30 and three sea Trinkets.
    expect(grade("trinket")).toBe(33);
    // 20, the Flypaper Ribbon, the Pocket Boiler and four sea Wonders.
    expect(grade("wonder")).toBe(26);
    expect(
      ARTIFACT_LIST.filter(
        (a) =>
          a.kind === "worn" &&
          a.cursed === true &&
          a.grade === "wonder" &&
          a.pieceOf === undefined,
      ),
    ).toHaveLength(7); // six and the Drowned Man's Locket
    expect(
      ARTIFACT_LIST.filter((a) => a.kind === "worn" && a.pieceOf !== undefined),
    ).toHaveLength(12);
    expect(grade("marvel") + 1).toBe(4); // the Hourglass is cursed
    for (const [id, why] of Object.entries(DEFERRED_ARTIFACTS)) {
      expect(findArtifact(id), id).toBeDefined();
      expect(why.length).toBeGreaterThan(20);
    }
  });

  it("Marvels and pieces name each other", () => {
    for (const a of ARTIFACT_LIST) {
      if (a.kind !== "worn") continue;
      if (a.pieces !== undefined)
        for (const p of a.pieces) {
          const piece = findArtifact(p);
          expect(piece?.kind === "worn" && piece.pieceOf).toBe(a.id);
        }
      if (a.pieceOf !== undefined) {
        const m = findArtifact(a.pieceOf);
        expect(m?.kind === "worn" && m.pieces?.includes(a.id)).toBe(true);
      }
    }
  });

  it("spells: all 60 rows; the deferred adventure spells say why", () => {
    expect(ids("spell")).toHaveLength(60);
    const known = new Set(allSpells().map((s) => s.id));
    for (const id of ids("spell")) expect(known.has(id), id).toBe(true);
    for (const id of pending("spell")) expect(known.has(id), id).toBe(true);
    const deferred = allSpells()
      .filter((s) => s.kind === "adventure")
      .filter((s) => adventureSpell(s.id).deferred !== undefined);
    expect(deferred.map((s) => s.id).length).toBeLessThanOrEqual(2);
  });
});
