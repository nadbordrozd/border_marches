/**
 * The sea pool (docs/design/NAVAL.md 7.5, bead bzc.154): the naval spells,
 * Seafaring and the sea artifacts are drawn only on naval maps, and filtered
 * out before drawing everywhere else, so a map that is not naval draws
 * exactly what it drew before them (the named maps' pinned features and the
 * fixed-seed tests elsewhere hold that); on a naval map they can be drawn.
 */
import { describe, expect, it } from "vitest";
import {
  guildSpells,
  townGuild,
  FACTION_SCHOOL_WEIGHTS,
  EVEN_WEIGHTS,
} from "../../../src/core/magic/index.ts";
import {
  pickArtifact,
  pickSeaArtifact,
  pickSpell,
  rollContents,
  withNavalPools,
  navalPoolsOn,
} from "../../../src/core/map/gen/contents.ts";
import {
  mysteryArtifact,
  mysteryArtifactOf,
  mysteryItem,
  mysteryPool,
} from "../../../src/core/map/mystery.ts";
import {
  seaContents,
  tidesSpell,
} from "../../../src/core/map/gen/sea-contents.ts";
import { createRng } from "../../../src/core/rng.ts";
import { isNavalArtifact } from "../../../src/data/artifacts.ts";
import {
  battleSpellsOfTier,
  findMapSpell,
  MAP_SPELLS,
} from "../../../src/data/map-spells.ts";
import { NAVAL_ARTIFACTS, NAVAL_SPELLS } from "../../../src/data/naval.ts";
import { drawableSkillIds, SKILL_IDS } from "../../../src/data/skills.ts";

const naval = new Set<string>(NAVAL_SPELLS);
const sea = new Set<string>(NAVAL_ARTIFACTS);

/** Runs `n` seeded draws and collects the results. */
function draws<T>(n: number, f: (seed: number) => T): T[] {
  const out: T[] = [];
  for (let seed = 1; seed <= n; seed++) out.push(f(seed));
  return out;
}

describe("the sea pool (NAVAL 7.5)", () => {
  it("lists the five naval spells and eight sea artifacts as content", () => {
    for (const id of NAVAL_SPELLS)
      expect(findMapSpell(id)?.naval, id).toBe(true);
    for (const id of NAVAL_ARTIFACTS)
      expect(isNavalArtifact(id), id).toBe(true);
    expect(MAP_SPELLS.filter((s) => s.naval)).toHaveLength(5);
  });

  it("guilds draw naval spells only on a naval map", () => {
    const factions = Object.keys(FACTION_SCHOOL_WEIGHTS);
    let seen = 0;
    for (let seed = 1; seed <= 60; seed++) {
      for (const faction of factions) {
        const town = { id: `town-${seed}`, faction };
        const dry = townGuild(seed, town).flat();
        expect(dry.some((id) => naval.has(id))).toBe(false);
        expect(townGuild(seed, town, false)).toEqual(townGuild(seed, town));
        if (
          townGuild(seed, town, true)
            .flat()
            .some((id) => naval.has(id))
        )
          seen++;
      }
    }
    expect(seen).toBeGreaterThan(0);
    // The engine-level draw too.
    const all = draws(40, (s) =>
      guildSpells(s, EVEN_WEIGHTS, 5, undefined, true),
    );
    expect(all.flat(2).some((id) => naval.has(id))).toBe(true);
  });

  it("battle spells of a tier hold Tidal Wave only for a naval map", () => {
    expect(battleSpellsOfTier(4).map((s) => s.id)).not.toContain("tidal-wave");
    expect(battleSpellsOfTier(4, true).map((s) => s.id)).toContain(
      "tidal-wave",
    );
    for (const t of [1, 2, 3, 5])
      expect(battleSpellsOfTier(t, true)).toEqual(battleSpellsOfTier(t));
  });

  it("Seafaring is drawable by tutors, scholars and witches only on a naval map", () => {
    expect(SKILL_IDS).toContain("seafaring");
    expect(drawableSkillIds(false)).not.toContain("seafaring");
    expect(drawableSkillIds(true)).toEqual([
      ...drawableSkillIds(false),
      "seafaring",
    ]);
  });

  it("the generator's draws keep the sea out unless the map is naval", () => {
    expect(navalPoolsOn()).toBe(false);
    const dry = draws(400, (seed) => {
      const rng = createRng(seed);
      return [
        pickArtifact(rng, "trinket"),
        pickArtifact(rng, "wonder"),
        pickArtifact(rng, "cursed"),
        pickSpell(rng, 4),
        JSON.stringify(rollContents("tutors-hut", rng, 1)),
        JSON.stringify(rollContents("school-shrine", rng, 2)),
        JSON.stringify(rollContents("scholar", rng, 2)),
        JSON.stringify(rollContents("tollhouse", rng, 1)),
      ];
    }).flat();
    const leaks = dry.filter(
      (x) =>
        x !== undefined &&
        ([...sea, ...naval, "seafaring"] as string[]).some(
          (id) => x.includes(`"${id}"`) || x === id,
        ),
    );
    expect(leaks).toEqual([]);
    const wet = withNavalPools(true, () => {
      expect(navalPoolsOn()).toBe(true);
      return draws(400, (seed) => {
        const rng = createRng(seed);
        return [
          pickArtifact(rng, "trinket"),
          pickArtifact(rng, "wonder"),
          pickArtifact(rng, "cursed"),
          pickSpell(rng, 4),
          JSON.stringify(rollContents("tutors-hut", rng, 1)),
          JSON.stringify(rollContents("school-shrine", rng, 2)),
        ];
      }).flat();
    });
    expect(navalPoolsOn()).toBe(false);
    const has = (id: string) =>
      wet.some((x) => x === id || (x ?? "").includes(`"${id}"`));
    expect(has("captains-tricorne") || has("brass-sextant")).toBe(true);
    expect(has("the-drowned-mans-locket")).toBe(true);
    expect(has("tidal-wave")).toBe(true);
    expect(has("seafaring")).toBe(true);
    // A naval map's shrines may teach the naval adventure spells too.
    expect(has("call-the-boat") || has("scuttle")).toBe(true);
  });

  it("the same draw off a naval map is exactly what it was without the sea", () => {
    // pickSeaArtifact is pickArtifact off a naval map: same rng use.
    for (let seed = 1; seed <= 50; seed++) {
      const a = createRng(seed);
      const b = createRng(seed);
      expect(pickSeaArtifact(a, "wonder")).toBe(pickArtifact(b, "wonder"));
      expect(a.int(0, 1_000_000)).toBe(b.int(0, 1_000_000));
    }
    // On a naval map about half come from the sea.
    const wet = withNavalPools(true, () =>
      draws(200, (seed) => pickSeaArtifact(createRng(seed), "trinket")),
    );
    const fromSea = wet.filter((id) => id !== undefined && sea.has(id)).length;
    expect(fromSea).toBeGreaterThan(60);
    expect(fromSea).toBeLessThan(160);
  });

  it("the Shrine of the Tides teaches the five naval spells; sea banks prefer sea artifacts", () => {
    const taught = new Set(draws(200, (seed) => tidesSpell(createRng(seed))));
    expect([...taught].sort()).toEqual([...NAVAL_SPELLS].sort());
    const prizes = withNavalPools(true, () =>
      draws(200, (seed) =>
        JSON.stringify(seaContents("shipwreck", createRng(seed), 3)),
      ),
    );
    expect(
      prizes.some((p) => NAVAL_ARTIFACTS.some((id) => p.includes(`"${id}"`))),
    ).toBe(true);
  });

  it("Mystery Bags hold sea artifacts only on a naval map", () => {
    for (const grade of ["trinket", "wonder"] as const) {
      expect(mysteryPool(grade).some((id) => sea.has(id))).toBe(false);
      expect(mysteryPool(grade, true).some((id) => sea.has(id))).toBe(true);
    }
    const dryIds = draws(300, (seed) => mysteryArtifact(seed, "bag-1"));
    expect(dryIds.some((id) => sea.has(id))).toBe(false);
    const wetIds = draws(300, (seed) =>
      mysteryArtifact(seed, "bag-1", "trinket", true),
    );
    expect(wetIds.some((id) => sea.has(id))).toBe(true);
    // A bare bag on a naval map derives from the naval pool at the visit.
    const bare = {
      id: "bag-7",
      kind: "artifact" as const,
      x: 0,
      y: 0,
      footprint: { w: 1, h: 1 },
      blocked: [],
      data: { type: "mystery-bag" },
    };
    for (let seed = 1; seed <= 50; seed++) {
      expect(mysteryArtifactOf({ seed }, bare)).toBe(
        mysteryArtifact(seed, "bag-7"),
      );
      expect(mysteryArtifactOf({ seed, naval: true }, bare)).toBe(
        mysteryArtifact(seed, "bag-7", "trinket", true),
      );
      expect(mysteryItem({ seed }, "bag-7", 0, 0).data["artifact"]).toBe(
        mysteryArtifact(seed, "bag-7"),
      );
    }
  });
});
