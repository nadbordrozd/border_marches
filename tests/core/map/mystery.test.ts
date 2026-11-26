/**
 * The Mystery Bag (bead bzc.105): a pickup whose artifact is chosen
 * from the map seed and its id, kept secret until a hero opens it.
 */
import { describe, expect, it } from "vitest";
import {
  describeSite,
  isPickup,
  moveHeroAlong,
  type GameState,
  type HeroState,
} from "../../../src/core/game/index.ts";
import {
  MYSTERY_TYPE,
  isMystery,
  mysteryArtifact,
  mysteryArtifactOf,
  mysteryItem,
  mysteryPool,
} from "../../../src/core/map/mystery.ts";
import { validateMap, type MapObject } from "../../../src/core/map/types.ts";
import {
  BACKPACK_SIZE,
  findArtifact,
  isCursed,
  wornDef,
} from "../../../src/data/artifacts.ts";
import { OBJECT_TYPES } from "../../../src/data/objectTypes.ts";
import { loadGame, saveGame, type SaveStorage } from "../../../src/ui/save.ts";
import { field, gameOn, ok } from "../game/helpers.ts";

const hero = (s: GameState): HeroState =>
  s.heroes.find((h) => h.id === "hero-0")!;

function texts(s: GameState, x: number, y: number): string[] {
  const { events } = ok(moveHeroAlong(s, "hero-0", [{ x, y }]));
  return events.flatMap((e) => (e.type === "site" ? [e.text] : []));
}

function memory(): SaveStorage {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

/** A bare bag, as a map author or the generator may place one. */
function bare(id: string, x: number, y: number, grade?: string): MapObject {
  return {
    id,
    kind: "artifact",
    x,
    y,
    footprint: { w: 1, h: 1 },
    blocked: [],
    data: { type: MYSTERY_TYPE, ...(grade === undefined ? {} : { grade }) },
  };
}

describe("the Mystery Bag's artifact (bead bzc.105)", () => {
  it("is a catalogue pickup of the artifact kind, placed by a rule only", () => {
    const def = OBJECT_TYPES["mystery-bag"];
    expect(def).toMatchObject({ kind: "artifact", w: 1, h: 1, weight: 0 });
    expect(def.vanishes).toBe(true);
    expect(isPickup(mysteryItem({ seed: 1 }, "m", 0, 0))).toBe(true);
  });

  it("draws from fair pools: no curse, no Marvel piece", () => {
    for (const grade of ["trinket", "wonder"] as const) {
      const pool = mysteryPool(grade);
      expect(pool.length).toBeGreaterThan(3);
      for (const id of pool) {
        const a = wornDef(id);
        expect(a?.grade).toBe(grade);
        expect(isCursed(id)).toBe(false);
        expect(a?.pieceOf).toBeUndefined();
      }
    }
  });

  it("is a pure function of the map seed, the object id and the grade", () => {
    expect(mysteryArtifact(42, "mystery-1")).toBe(
      mysteryArtifact(42, "mystery-1"),
    );
    const picks = new Set<string>();
    for (let seed = 0; seed < 40; seed++)
      picks.add(mysteryArtifact(seed, "mystery-1"));
    for (let i = 0; i < 40; i++) picks.add(mysteryArtifact(42, `m-${i}`));
    // Many different surprises across seeds and ids.
    expect(picks.size).toBeGreaterThan(8);
    expect(mysteryPool("wonder")).toContain(
      mysteryArtifact(42, "mystery-1", "wonder"),
    );
  });

  it("is stored at creation and agrees with a bare bag's derivation", () => {
    const made = mysteryItem({ seed: 9 }, "m-3", 2, 1, { grade: "wonder" });
    expect(isMystery(made)).toBe(true);
    expect(made.data).toMatchObject({ type: MYSTERY_TYPE, grade: "wonder" });
    expect(made.data["artifact"]).toBe(mysteryArtifact(9, "m-3", "wonder"));
    expect(mysteryArtifactOf({ seed: 9 }, bare("m-3", 2, 1, "wonder"))).toBe(
      made.data["artifact"],
    );
    expect(mysteryArtifactOf({ seed: 9 }, made)).toBe(made.data["artifact"]);
  });

  it("makes a valid map object", () => {
    const s = gameOn(field(3, 1), [mysteryItem({ seed: 7 }, "m", 1, 0)]);
    expect(validateMap(s.map)).toEqual([]);
  });
});

describe("opening a Mystery Bag (bead bzc.105)", () => {
  it("keeps its artifact secret on the map", () => {
    const s = gameOn(field(3, 1), [mysteryItem({ seed: 7 }, "m", 1, 0)]);
    const obj = s.map.objects.find((o) => o.id === "m")!;
    const name = findArtifact(String(obj.data["artifact"]))!.name;
    const site = describeSite(s, 0, obj)!;
    expect(site.name).toBe("Mystery Bag");
    expect(site.what).toContain("unknown artifact");
    expect(site.what).not.toContain(name);
  });

  it("grants the seeded artifact from the next cell, then is gone", () => {
    const s = gameOn(field(3, 1), [bare("m", 1, 0)]);
    const expected = mysteryArtifact(s.map.seed, "m");
    const { state, events } = ok(moveHeroAlong(s, "hero-0", [{ x: 1, y: 0 }]));
    expect(hero(state).backpack).toContain(expected);
    expect(state.collected).toContain("m");
    const said = events.flatMap((e) => (e.type === "site" ? [e.text] : []));
    expect(said).toEqual([`Opened the bag: ${findArtifact(expected)!.name}!`]);
  });

  it("stays sealed (and secret) for a hero with a full backpack", () => {
    const s = gameOn(field(3, 1), [mysteryItem({ seed: 7 }, "m", 1, 0)]);
    hero(s).backpack = Array.from(
      { length: BACKPACK_SIZE },
      () => "bloodstone-ring",
    );
    const said = texts(s, 1, 0);
    expect(said).toEqual(["No room in the backpack: it stays sealed."]);
  });

  it("survives a save and load with the same surprise", () => {
    for (const obj of [mysteryItem({ seed: 7 }, "m", 1, 0), bare("m", 1, 0)]) {
      const s = gameOn(field(3, 1), [obj]);
      const expected = mysteryArtifactOf(s.map, obj);
      const storage = memory();
      expect(saveGame(storage, s)).toBe(true);
      const loaded = loadGame(storage)!;
      expect(loaded.map.objects.find((o) => o.id === "m")).toEqual(obj);
      const { state } = ok(moveHeroAlong(loaded, "hero-0", [{ x: 1, y: 0 }]));
      expect(hero(state).backpack).toContain(expected);
      // And the opened bag stays gone after another round trip.
      saveGame(storage, state);
      expect(loadGame(storage)!.collected).toContain("m");
    }
  });
});
