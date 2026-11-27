/**
 * Sea guardians' data (NAVAL.md section 4, bead bzc.152): the stats and
 * fight values of the doc's tables, the Swimmer flag, where they live, and
 * that no land pool ever draws them (maps stay byte for byte).
 */
import { describe, expect, it } from "vitest";
import { stackFor } from "../../src/core/map/gen/guards.ts";
import { rollContents } from "../../src/core/map/gen/contents.ts";
import { TERRAINS } from "../../src/core/map/types.ts";
import { fightValue } from "../../src/core/game/progression.ts";
import { SUMMONED_CREATURES } from "../../src/core/magic/index.ts";
import { createRng } from "../../src/core/rng.ts";
import { CREATURES, isSwimmer } from "../../src/data/creatures.ts";
import {
  SEA_ABILITY_IDS,
  SEA_CREATURE_IDS,
  SEA_CREATURES,
  SEA_GUARD_IDS,
  SEA_HOMES,
  SWIMMING_STRAYS,
} from "../../src/data/sea.ts";
import {
  GUARD_CREATURE_IDS,
  HUT_STRAYS,
  LODGE_CARETAKERS,
  STRAY_HOMES,
} from "../../src/data/strays.ts";
import type { CreatureDef } from "../../src/data/types.ts";

const SEA = new Set<string>([...SEA_CREATURE_IDS, "hermit-crab"]);

describe("sea guardians: stats (NAVAL.md 4.1)", () => {
  it("has the eight guardians of the doc's table", () => {
    const rows = SEA_CREATURE_IDS.map((id) => {
      const c = SEA_CREATURES[id];
      return [
        c.name,
        c.tier,
        isSwimmer(c),
        c.hp,
        c.attack,
        c.defense,
        c.damage,
        c.speed,
        c.shots,
        c.fightValue,
        c.tags?.remains,
        c.tags?.cannotBear,
      ];
    });
    // prettier-ignore
    expect(rows).toEqual([
      ["Jellyfish", 1, true, 6, 4, 2, 2, 5, 0, 45, "nothing", []],
      ["Drowned Sailor", 2, true, 15, 6, 5, 3, 4, 0, 104, "bones", ["heartened", "shaken"]],
      ["Giant Crab", 2, true, 16, 5, 9, 3, 4, 0, 118, "corpse", []],
      ["Corsair", 3, false, 24, 9, 6, 5, 6, 0, 192, "corpse", []],
      ["Siren", 3, true, 20, 8, 5, 5, 6, 0, 165, "corpse", []],
      ["Hammerhead", 4, true, 50, 13, 7, 10, 7, 0, 447, "corpse", []],
      ["Sea Serpent", 5, true, 95, 14, 11, 16, 7, 0, 877, "corpse", []],
      ["Kraken", 6, true, 170, 17, 15, 26, 5, 0, 1729, "corpse", []],
    ]);
  });

  it("stores fight values that match GAME_DESIGN 8.2", () => {
    for (const id of SEA_CREATURE_IDS) {
      const c = SEA_CREATURES[id];
      expect(fightValue(c), id).toBe(c.fightValue);
      expect(CREATURES[id]).toBe(c);
    }
  });

  it("each is a neutral melee creature with one ability (and Swimmer)", () => {
    const abilities = SEA_CREATURE_IDS.map((id) => SEA_CREATURES[id].abilities);
    expect(abilities).toEqual([
      ["stinging-bell", "swimmer"],
      ["dead-weight", "swimmer"],
      ["carapace", "swimmer"],
      ["swing-across"],
      ["siren-song", "swimmer"],
      ["blood-in-the-water", "swimmer"],
      ["coil", "swimmer"],
      ["many-arms", "swimmer"],
    ]);
    for (const id of SEA_CREATURE_IDS) {
      const c = SEA_CREATURES[id];
      expect([c.faction, c.growth, c.cost, c.ability]).toEqual([
        "neutral",
        0,
        {},
        null,
      ]);
      expect(c.sprite).toBe(`sea-${id}`);
      for (const a of c.abilities ?? []) expect(SEA_ABILITY_IDS).toContain(a);
    }
  });

  it("sits on the scale: each FV within the band of its tier's other creatures", () => {
    const others = Object.values(CREATURES).filter(
      (c) => !SEA.has(c.id) && c.faction !== "lost-world",
    );
    for (const id of SEA_CREATURE_IDS) {
      const c = SEA_CREATURES[id];
      const peers = others
        .filter((o: CreatureDef) => o.tier === c.tier)
        .map((o) => o.fightValue);
      const lo = Math.min(...peers);
      const hi = Math.max(...peers);
      expect(c.fightValue, id).toBeGreaterThanOrEqual(Math.floor(lo * 0.8));
      expect(c.fightValue, id).toBeLessThanOrEqual(Math.ceil(hi * 1.2));
    }
  });

  it("has the summoned Hermit Crab of NAVAL.md 4.3", () => {
    const h = SUMMONED_CREATURES["hermit-crab"];
    expect(h).toBeDefined();
    if (h === undefined) return;
    expect([h.hp, h.attack, h.defense, h.damage, h.speed, h.tier]).toEqual([
      10, 4, 8, 2, 4, 1,
    ]);
    expect(h.abilities).toEqual(["carapace", "swimmer"]);
    expect(h.tags?.remains).toBe("nothing");
    // FV 72 by GAME_DESIGN 8.2 (a summon carries none of its own).
    const fv = fightValue({ ...h, shots: 0 } as unknown as CreatureDef);
    expect(fv).toBe(72);
    expect(Object.hasOwn(CREATURES, "hermit-crab")).toBe(false);
  });
});

describe("Swimmer (NAVAL.md 3.1)", () => {
  it("swims: seven guardians and the Bog Leech, Diver and Lurker", () => {
    const swimmers = Object.values(CREATURES)
      .filter(isSwimmer)
      .map((c) => c.id)
      .sort();
    expect(swimmers).toEqual(
      [
        ...SEA_CREATURE_IDS.filter((id) => id !== "corsair"),
        ...SWIMMING_STRAYS,
      ].sort(),
    );
    // The strays keep their land ability first.
    expect(CREATURES["bog-leech"].abilities).toEqual(["latch", "swimmer"]);
    expect(CREATURES["deep-sea-diver"].abilities).toEqual([
      "pressure-suit",
      "swimmer",
    ]);
    expect(CREATURES["lagoon-lurker"].abilities).toEqual([
      "drag-under",
      "swimmer",
    ]);
  });
});

describe("where sea guards live (NAVAL.md 4.4)", () => {
  it("has the doc's rings, dwellings, stock and hire costs", () => {
    const rows = SEA_GUARD_IDS.map((id) => {
      const h = SEA_HOMES[id];
      return [id, h.rings, h.dwelling, h.weekly, h.hire];
    });
    expect(rows).toEqual([
      ["jellyfish", [0, 1], "wild", 0, 0],
      ["drowned-sailor", [0, 2], "wild", 0, 0],
      ["giant-crab", [0, 2], "wild", 0, 0],
      ["corsair", [1, 2], "pirate-cove", 3, 290],
      ["siren", [1, 2], "siren-grotto", 3, 250],
      ["hammerhead", [1, 3], "wild", 0, 0],
      ["sea-serpent", [2, 3], "wild", 0, 0],
      ["kraken", [3, 3], "wild", 0, 0],
      ["bog-leech", [0, 2], "wild", 0, 0],
      ["deep-sea-diver", [1, 2], "wild", 0, 0],
      ["lagoon-lurker", [1, 3], "wild", 0, 0],
    ]);
    expect(SEA_HOMES.corsair.pirateShip).toBe(true);
    expect(SEA_HOMES.kraken.site).toBe("krakens-deep");
  });

  it("prices hires at FV x 1.5, rounded to 5 gold", () => {
    for (const id of SEA_GUARD_IDS) {
      const h = SEA_HOMES[id];
      if (h.dwelling === "wild") continue;
      const fv = CREATURES[id].fightValue;
      expect(h.hire, id).toBe(Math.round((fv * 1.5) / 5) * 5);
    }
  });

  it("guards every ring with two or more creatures", () => {
    for (let ring = 0; ring <= 3; ring++) {
      const n = SEA_GUARD_IDS.filter((id) => {
        const [lo, hi] = SEA_HOMES[id].rings;
        return ring >= lo && ring <= hi;
      }).length;
      expect(n, `ring ${ring}`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("sea guardians stay out of the land pools", () => {
  it("are in no land roster, hut or lodge", () => {
    for (const pool of [GUARD_CREATURE_IDS, HUT_STRAYS, LODGE_CARETAKERS])
      for (const id of pool) expect(SEA.has(id), id).toBe(false);
    for (const id of SEA_CREATURE_IDS)
      expect(Object.hasOwn(STRAY_HOMES, id), id).toBe(false);
  });

  it("leave the swimming strays' land homes as they were", () => {
    expect(STRAY_HOMES["bog-leech"].terrain).toEqual([
      "jungle",
      "wasteland",
      "swamp",
    ]);
    expect(STRAY_HOMES["deep-sea-diver"].terrain).toEqual([
      "jungle",
      "wasteland",
      "snow",
      "swamp",
    ]);
    expect(STRAY_HOMES["lagoon-lurker"].terrain).toEqual([
      "jungle",
      "wasteland",
      "swamp",
    ]);
  });

  it("are never drawn as a land guard, on any terrain, ring or size", () => {
    const rng = createRng(152);
    for (const terrain of [...TERRAINS, undefined])
      for (let ring = 0; ring <= 3; ring++)
        for (const target of [100, 400, 1500, 6000, 20000, 90000]) {
          const g = stackFor(rng, target, {
            ...(terrain !== undefined ? { terrain } : {}),
            ring,
          });
          expect(SEA.has(g.creature), `${terrain} ${ring} ${target}`).toBe(
            false,
          );
        }
  });

  it("are never offered by a faction outpost, stray hut or caretaker lodge", () => {
    const rng = createRng(4);
    for (let i = 0; i < 200; i++)
      for (const type of [
        "faction-outpost",
        "stray-hut",
        "caretaker-lodge",
      ] as const) {
        const c = rollContents(type, rng, i % 4)["creature"];
        expect(SEA.has(String(c)), `${type} ${String(c)}`).toBe(false);
      }
  });
});
