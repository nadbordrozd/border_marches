/**
 * The map's spell table (src/data/map-spells.ts) is a copy of the magic
 * catalogue for the generator; it must agree with it (bead bzc.13).
 */
import { describe, expect, it } from "vitest";
import { allSpells } from "../../src/core/magic/catalog.ts";
import { MAP_SPELLS } from "../../src/data/map-spells.ts";

describe("map spells", () => {
  it("match the magic catalogue's drawable spells (id, school, tier, kind)", () => {
    const catalogue = allSpells()
      .filter((s) => s.pool)
      .map((s) => `${s.id}:${s.school}:${s.tier}:${s.kind}`)
      .sort();
    const ours = MAP_SPELLS.map(
      (s) =>
        `${s.id}:${s.school}:${s.tier}:${s.adventure ? "adventure" : "battle"}`,
    );
    for (const s of ours) expect(catalogue).toContain(s);
  });
});
