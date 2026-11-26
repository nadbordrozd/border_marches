/**
 * The shipped named maps (bead bzc.18): they build deterministically from
 * seed, options and edits, their generated base has not drifted, they are
 * dense, guarded in proportion, fair to every start, and their puzzles
 * (a key-and-gate valley, a Marvel piece behind a strong guard) hold.
 */
import { describe, expect, it } from "vitest";
import { wornDef } from "../../../src/data/artifacts.ts";
import { getCreature, isCreatureId } from "../../../src/data/creatures.ts";
import { isPickup } from "../../../src/core/game/site-state.ts";
import {
  isObjectTypeId,
  type ObjectTypeId,
} from "../../../src/data/objectTypes.ts";
import { mapDensity } from "../../../src/core/map/density.ts";
import {
  DAY_MP,
  startFairness,
  startTownsOf,
  travelCosts,
} from "../../../src/core/map/fairness.ts";
import {
  NAMED_MAPS,
  buildNamedMap,
  findNamedMap,
  generateNamedBase,
  mapFingerprint,
  namedConfig,
} from "../../../src/core/map/named.ts";
import type { NamedMapDef } from "../../../src/core/map/named.ts";
import type { GameMap, MapObject } from "../../../src/core/map/types.ts";
import {
  DIRECTIONS_8,
  cellAt,
  inBounds,
  validateMap,
} from "../../../src/core/map/types.ts";
import { moveCosts, walkable } from "./map-helpers.ts";

const built = new Map<string, GameMap>();
function mapOf(id: string): GameMap {
  let map = built.get(id);
  if (map === undefined) {
    map = buildNamedMap(id);
    built.set(id, map);
  }
  return map;
}
const def = (id: string): NamedMapDef => {
  const d = findNamedMap(id);
  if (d === undefined) throw new Error(`no map ${id}`);
  return d;
};
const obj = (map: GameMap, id: string): MapObject => {
  const o = map.objects.find((x) => x.id === id);
  if (o === undefined) throw new Error(`no object ${id}`);
  return o;
};
const costAt = (d: Float64Array, map: GameMap, o: MapObject): number =>
  d[o.y * map.width + o.x] ?? Infinity;

/** Object families of the catalogue (CONTENT_MAP_OBJECTS section 3). */
const FAMILIES: Record<string, readonly ObjectTypeId[]> = {
  producers: [
    "sawmill",
    "ore-pit",
    "essence-spring",
    "gold-mine",
    "haunted-mine",
    "windmill",
    "water-wheel",
    "orchard",
  ],
  dwellings: ["faction-outpost", "stray-hut", "caretaker-lodge"],
  buildings: [
    "stat-shrine",
    "learning-stone",
    "arena",
    "library",
    "tree-of-knowledge",
    "academy",
    "tutors-hut",
    "school-shrine",
    "hermit",
    "rally-camp",
    "wishing-well",
    "oasis",
    "school-temple",
    "mana-well",
    "stables",
    "sanctuary",
    "observatory",
    "scholar",
  ],
  banks: [
    "overgrown-greenhouse",
    "sealed-registry",
    "stopped-belfry",
    "quiet-yard",
    "thunderstruck-pylon-yard",
    "landfall-wreck",
    "keepers-vault",
  ],
  treasure: [
    "resource-pile",
    "treasure-chest",
    "campfire",
    "loose-artifact",
    "loose-scroll",
    "fallen-adventurer",
  ],
  hidden: ["obelisk", "buried-keystone", "buried-cache"],
  quests: [
    "keymasters-tent",
    "border-gate",
    "seer-hut",
    "quest-gate",
    "prison",
  ],
  services: [
    "trading-post",
    "tollhouse",
    "drill-yard",
    "curse-lifters-shrine",
    "roadside-inn",
    "altar-of-sacrifice",
  ],
  teleports: ["two-way-waystone", "one-way-waystone", "pylon"],
  events: ["event-tile", "sealed-box", "sign"],
};

/**
 * Key features of each map, pinned so a generator change that would move
 * what the edits rely on fails here first. If this fails after a generator
 * change: re-check the map (posters, `npm run map:poster -- --named ID`),
 * re-tune its edits in src/data/named-maps.ts, and update these numbers.
 */
const SNAPSHOT: Record<
  string,
  {
    base: string;
    built: string;
    objects: number;
    towns: Array<[string, number, number, string | null]>;
  }
> = {
  "keepers-toll": {
    base: "6c151624",
    built: "c64ed1bd",
    objects: 356,
    towns: [
      ["town-1", 7, 7, null],
      ["town-2", 35, 40, null],
      ["town-3", 38, 7, "Tollbridge"],
      ["town-4", 12, 36, "Low Barrow"],
      ["town-5", 18, 25, "Warlord's Hold"],
    ],
  },
  "hourglass-marches": {
    base: "96e6c49b",
    built: "b1b1d58a",
    objects: 721,
    towns: [
      ["town-1", 30, 60, null],
      ["town-2", 11, 20, null],
      ["town-3", 63, 23, null],
      ["town-4", 61, 50, "Bangwhistle"],
      ["town-5", 11, 62, "Lantern Cross"],
      ["town-6", 26, 21, "Sexton's Rest"],
      ["town-7", 36, 41, "Warlord's Hold"],
    ],
  },
  "ninefold-landfall": {
    base: "72e779c3",
    built: "30e59ca3",
    objects: 791,
    towns: [
      ["town-1", 62, 59, null],
      ["town-2", 14, 40, null],
      ["town-3", 40, 11, null],
      ["town-4", 28, 51, "Cinderford"],
      ["town-5", 63, 37, "Greyfold"],
      ["town-6", 64, 11, "Redcairn"],
      ["town-7", 44, 39, "Warlord's Hold"],
    ],
  },
};

/** Each map's puzzles: the gated vault valley and the Marvel cleft. */
const PUZZLES: Record<
  string,
  {
    gate: string[];
    tent: string;
    behindGate: string[];
    piece: string;
    pieceGuard: string;
  }
> = {
  "keepers-toll": {
    gate: ["border-gate-red"],
    tent: "keymasters-tent-red",
    behindGate: [
      "keepers-vault-1",
      "curse-lifters-shrine-1",
      "school-shrine-6",
      "loose-artifact-3",
      "pickup-essence-3",
      "obelisk-6",
      "monster-26",
      "monster-28",
    ],
    piece: "loose-artifact-sand",
    pieceGuard: "monster-52",
  },
  "hourglass-marches": {
    gate: ["border-gate-2", "border-gate-blue-east"],
    tent: "keymasters-tent-blue",
    behindGate: ["trading-post-5", "keepers-vault-north"],
    piece: "loose-artifact-sand",
    pieceGuard: "monster-124",
  },
};

describe("named maps", { timeout: 60_000 }, () => {
  it("ships a two-player map and two three-player Realm, Restless, Horde maps", () => {
    expect(NAMED_MAPS.map((m) => [m.id, m.players, m.size])).toEqual([
      ["keepers-toll", 2, "M"],
      ["hourglass-marches", 3, "L"],
      ["ninefold-landfall", 3, "L"],
    ]);
    for (const id of ["hourglass-marches", "ninefold-landfall"]) {
      expect(def(id).factions).toEqual(["humans", "undead", "goblins"]);
    }
    for (const m of NAMED_MAPS) {
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.intro.length).toBeGreaterThan(200);
      expect(m.factions).toHaveLength(m.players);
      for (const e of m.edits) expect(e.note.length).toBeGreaterThan(10);
    }
  });

  it("builds valid maps, the same every time", () => {
    for (const m of NAMED_MAPS) {
      const map = mapOf(m.id);
      expect(validateMap(map), m.id).toEqual([]);
      expect(JSON.stringify(buildNamedMap(m.id))).toBe(JSON.stringify(map));
      expect(startTownsOf(map)).toHaveLength(m.players);
    }
  });

  it("draws each start town in its seat's recommended faction", () => {
    for (const m of NAMED_MAPS) {
      expect(
        startTownsOf(mapOf(m.id)).map((t) => t.data["faction"]),
        m.id,
      ).toEqual(m.factions);
    }
  });

  it("has not drifted: the generated base and key features are pinned", () => {
    for (const m of NAMED_MAPS) {
      const want = SNAPSHOT[m.id];
      const map = mapOf(m.id);
      expect(mapFingerprint(generateNamedBase(m)), `${m.id} base`).toBe(
        want?.base,
      );
      expect(mapFingerprint(map), `${m.id} built`).toBe(want?.built);
      expect(map.objects).toHaveLength(want?.objects ?? -1);
      expect(
        map.objects
          .filter((o) => o.kind === "town")
          .map((o) => [o.id, o.x, o.y, o.data["name"] ?? null]),
      ).toEqual(want?.towns);
    }
  });

  it("refuses an edit whose generated object has moved", () => {
    const m = def("keepers-toll");
    const moved: NamedMapDef = {
      ...m,
      edits: [{ op: "remove", id: "tollhouse-2", at: [0, 0], note: "drift" }],
    };
    expect(() => buildNamedMap(moved)).toThrow(/tollhouse-2 is at/);
    const taken: NamedMapDef = {
      ...m,
      edits: [
        { op: "add", id: "sign-x", type: "sign", at: [7, 7], note: "taken" },
      ],
    };
    expect(() => buildNamedMap(taken)).toThrow(/taken by town-1/);
  });

  it("is dense: several of every object family and 20 visitable per 100 cells", () => {
    for (const m of NAMED_MAPS) {
      const map = mapOf(m.id);
      for (const [family, types] of Object.entries(FAMILIES)) {
        const n = map.objects.filter((o) =>
          types.includes(o.data["type"] as ObjectTypeId),
        ).length;
        expect(n, `${m.id} ${family}`).toBeGreaterThanOrEqual(3);
      }
      // Bead bzc.50: about twice the 11.2 and 10.3 of the first versions.
      expect(mapDensity(map).visitable, m.id).toBeGreaterThanOrEqual(20);
    }
  });

  it("places map-authored events and signs with text", () => {
    for (const m of NAMED_MAPS) {
      const map = mapOf(m.id);
      const events = map.objects.filter((o) => o.data["type"] === "event-tile");
      const signs = map.objects.filter((o) => o.data["type"] === "sign");
      expect(events.length, m.id).toBeGreaterThanOrEqual(m.players + 1);
      expect(signs.length, m.id).toBeGreaterThanOrEqual(m.players + 2);
      for (const o of [...events, ...signs]) {
        expect(String(o.data["text"]).length, o.id).toBeGreaterThan(20);
      }
      // At least one event is a fight for its prize.
      expect(events.some((o) => Array.isArray(o.data["guard"]))).toBe(true);
    }
  });

  it("sizes every guard in proportion to its prize", () => {
    const fv = (stacks: Array<{ creature: string; count: number }>): number =>
      stacks.reduce(
        (n, s) =>
          n +
          (isCreatureId(s.creature)
            ? s.count * getCreature(s.creature).fightValue
            : NaN),
        0,
      );
    for (const m of NAMED_MAPS) {
      for (const o of mapOf(m.id).objects) {
        let stacks: Array<{ creature: string; count: number }> | null = null;
        if (o.kind === "monster") {
          stacks = [
            {
              creature: String(o.data["creature"]),
              count: Number(o.data["count"]),
            },
          ];
        } else if (Array.isArray(o.data["guard"])) {
          stacks = o.data["guard"] as Array<{
            creature: string;
            count: number;
          }>;
        }
        if (stacks === null) continue;
        const ratio = fv(stacks) / Number(o.data["value"]);
        expect(ratio, `${m.id} ${o.id}`).toBeGreaterThanOrEqual(0.45);
        expect(ratio, `${m.id} ${o.id}`).toBeLessThanOrEqual(1.3);
      }
    }
  });

  it("gives every start a fair share: towns, mines, loot, sites and fights", () => {
    for (const m of NAMED_MAPS) {
      const report = startFairness(mapOf(m.id));
      const spread = (xs: number[]): number =>
        Math.max(...xs) - Math.min(...xs);
      const ratio = (xs: number[]): number => Math.min(...xs) / Math.max(...xs);
      const s = report.starts;
      expect(s).toHaveLength(m.players);
      const who = (k: string): string => `${m.id}: ${k}`;
      // Nearest neutral town and nearest mine of each resource, in days.
      for (const x of s) expect(x.neutralTown, who("town")).toBeLessThan(2);
      expect(spread(s.map((x) => x.neutralTown)), who("town")).toBeLessThan(
        0.75,
      );
      for (const r of ["wood", "ore", "gold", "essence"] as const) {
        for (const x of s) expect(x.mine[r], who(r)).toBeLessThan(3);
        expect(spread(s.map((x) => x.mine[r])), who(r)).toBeLessThan(0.75);
      }
      for (const x of s) {
        expect(x.mine.wood, who("wood")).toBeLessThan(1);
        expect(x.mine.ore, who("ore")).toBeLessThan(1);
      }
      // Free loot and mines near home, things to do, first fights.
      expect(ratio(s.map((x) => x.freeLoot)), who("loot")).toBeGreaterThan(
        0.85,
      );
      expect(spread(s.map((x) => x.freeMines)), who("free mines")).toBe(0);
      expect(ratio(s.map((x) => x.nearSites)), who("sites")).toBeGreaterThan(
        0.75,
      );
      expect(ratio(s.map((x) => x.nearGuards)), who("guards")).toBeGreaterThan(
        0.85,
      );
      // Start to start: every pair within 20% of the others.
      const pairs = report.pairs.map((p) => p[2]);
      expect(pairs).toHaveLength((m.players * (m.players - 1)) / 2);
      for (const d of pairs) expect(d, who("pairs")).toBeGreaterThan(3);
      expect(
        Math.max(...pairs) / Math.min(...pairs),
        who("pairs"),
      ).toBeLessThan(1.2);
    }
  });

  it("uses a broad mix: 55 or more of the 62 catalogue types", () => {
    for (const m of NAMED_MAPS) {
      const types = new Set(
        mapOf(m.id)
          .objects.map((o) => o.data["type"])
          .filter((t) => isObjectTypeId(t)),
      );
      expect(types.size, m.id).toBeGreaterThanOrEqual(55);
    }
  });

  it("never seals a way with a pickup taken from beside it", () => {
    for (const m of NAMED_MAPS) {
      const map = mapOf(m.id);
      const w = map.width;
      // One-time pickups (the game's rule) as walls.
      const walls = new Set(
        map.objects.filter((o) => isPickup(o)).map((o) => o.y * w + o.x),
      );
      for (const t of startTownsOf(map)) {
        const d = travelCosts(map, t.x, t.y, { gatesOpen: true, avoid: walls });
        for (const o of map.objects) {
          const cells = walls.has(o.y * w + o.x)
            ? DIRECTIONS_8.map(([dx, dy]) => [o.x + dx, o.y + dy] as const)
            : [[o.x, o.y] as const];
          const reached = cells.some(
            ([x, y]) =>
              inBounds(map, x, y) && Number.isFinite(d[y * w + x] ?? Infinity),
          );
          expect(reached, `${m.id} ${o.id} from ${t.id}`).toBe(true);
        }
      }
    }
  });

  it("lets every start reach every object (gates open)", () => {
    for (const m of NAMED_MAPS) {
      const map = mapOf(m.id);
      for (const t of startTownsOf(map)) {
        const d = travelCosts(map, t.x, t.y, { gatesOpen: true });
        const lost = map.objects.filter(
          (o) => !Number.isFinite(costAt(d, map, o)),
        );
        expect(
          lost.map((o) => o.id),
          `${m.id} from ${t.id}`,
        ).toEqual([]);
      }
    }
  });

  it("gives the first two maps their key-and-gate and Marvel puzzles", () => {
    // The Ninefold Landfall spreads its Marvel over its three wild lands
    // instead (tested with that map below).
    expect(Object.keys(PUZZLES)).toEqual(["keepers-toll", "hourglass-marches"]);
  });

  it("locks the vault valley behind gates whose key is in reach of all", () => {
    for (const [id, p] of Object.entries(PUZZLES)) {
      const m = def(id);
      const map = mapOf(m.id);
      const tent = obj(map, p.tent);
      for (const g of p.gate) {
        expect(obj(map, g).data["colour"]).toBe(tent.data["colour"]);
      }
      const totals: number[] = [];
      for (const t of startTownsOf(map)) {
        const shut = travelCosts(map, t.x, t.y);
        const lost = map.objects
          .filter((o) => o.kind !== "gate")
          .filter((o) => !Number.isFinite(costAt(shut, map, o)))
          .map((o) => o.id);
        // Exactly the valley is shut, and the key is outside it.
        expect(lost.sort(), `${m.id} from ${t.id}`).toEqual(
          [...p.behindGate].sort(),
        );
        const toTent = costAt(shut, map, tent);
        expect(Number.isFinite(toTent)).toBe(true);
        // From the tent to the nearest gate.
        const fromTent = travelCosts(map, tent.x, tent.y, { gatesOpen: true });
        const toGate = Math.min(
          ...p.gate.map((g) => costAt(fromTent, map, obj(map, g))),
        );
        totals.push((toTent + toGate) / DAY_MP);
      }
      // Start, tent, gate: no start more than half a day behind.
      expect(Math.max(...totals) - Math.min(...totals), m.id).toBeLessThan(
        0.75,
      );
      const vault = map.objects.find(
        (o) =>
          p.behindGate.includes(o.id) && o.data["type"] === "keepers-vault",
      );
      expect(vault, m.id).toBeDefined();
    }
  });

  it("forces n zones of a landscape with a chance that never fails", () => {
    const m = def("ninefold-landfall");
    const two = namedConfig({ ...m, gen: { landscapes: { winter: 2 } } });
    expect(two.terrain?.winter?.chance).toEqual({ S: 2, M: 2, L: 2 });
    expect(two.terrain?.winter?.maxZones).toEqual({ S: 2, M: 2, L: 2 });
    // Landscapes not asked for stay off, as on the first two maps.
    expect(two.terrain?.volcanic?.chance).toEqual({ S: 0, M: 0, L: 0 });
    expect(namedConfig(def("keepers-toll"))).toBe(
      namedConfig(def("hourglass-marches")),
    );
  });

  it("keeps the first two maps free of forced landscapes and extra fill", () => {
    // Their bases are pinned above; this says why they stay put.
    for (const id of ["keepers-toll", "hourglass-marches"]) {
      expect(def(id).gen, id).toBeUndefined();
    }
  });

  it("keeps a Marvel piece in a pocket behind a strong guard", () => {
    for (const [id, p] of Object.entries(PUZZLES)) {
      const m = def(id);
      const map = mapOf(m.id);
      const piece = obj(map, p.piece);
      expect(wornDef(String(piece.data["artifact"]))?.pieceOf).toBe(
        "the-hourglass-with-no-bottom",
      );
      const guard = obj(map, p.pieceGuard);
      expect(guard.data["guards"]).toContain(p.piece);
      expect(Number(guard.data["fv"]), m.id).toBeGreaterThanOrEqual(7500);
      // The guard's zone of control (bar the piece's own cell) seals it.
      const zoc = new Set<number>();
      for (const [dx, dy] of [[0, 0], ...DIRECTIONS_8] as const) {
        if (inBounds(map, guard.x + dx, guard.y + dy)) {
          zoc.add((guard.y + dy) * map.width + guard.x + dx);
        }
      }
      zoc.delete(piece.y * map.width + piece.x);
      for (const t of startTownsOf(map)) {
        const avoid = travelCosts(map, t.x, t.y, {
          gatesOpen: true,
          avoid: zoc,
        });
        expect(costAt(avoid, map, piece), `${m.id} ${t.id}`).toBe(Infinity);
      }
    }
  });
});

/**
 * The showcase map (bead bzc.89): every landscape, every winter and desert
 * site, the Second Left Glove spread over the three wild lands, and more
 * artifacts and banks than the other named maps.
 */
describe("The Ninefold Landfall", { timeout: 60_000 }, () => {
  const ID = "ninefold-landfall";
  const count = (map: GameMap, test: (o: MapObject) => boolean): number =>
    map.objects.filter(test).length;
  const ofType = (map: GameMap, type: string): MapObject[] =>
    map.objects.filter((o) => o.data["type"] === type);

  it("asks the generator for one zone of each new landscape and three neutral towns", () => {
    expect(def(ID).gen?.landscapes).toEqual({
      volcanic: 1,
      winter: 1,
      desert: 1,
    });
    const towns = mapOf(ID).objects.filter(
      (o) =>
        o.kind === "town" &&
        o.data["hold"] === false &&
        typeof o.data["start"] !== "number",
    );
    expect(towns.map((t) => t.data["name"])).toEqual([
      "Cinderford",
      "Greyfold",
      "Redcairn",
    ]);
  });

  it("has every landscape: the five grounds, lava, snow, sand and water", () => {
    const map = mapOf(ID);
    const cells: Record<string, number> = {};
    for (const c of map.cells) cells[c.terrain] = (cells[c.terrain] ?? 0) + 1;
    for (const t of [
      "grass",
      "jungle",
      "steppe",
      "badlands",
      "wasteland",
      "volcanic",
      "snow",
      "sand",
      "water",
    ]) {
      // A landscape is a region, not a patch: about two screens at least.
      expect(cells[t] ?? 0, t).toBeGreaterThanOrEqual(50);
    }
    for (const t of ["volcanic", "snow", "sand"]) {
      expect(cells[t] ?? 0, t).toBeGreaterThanOrEqual(250);
    }
    // Every landscape carries its own decorations.
    const decorated = new Set(
      (map.decorations ?? []).map((d) => cellAt(map, d.x, d.y)?.terrain),
    );
    for (const t of ["volcanic", "snow", "sand", "jungle", "grass"]) {
      expect(decorated.has(t as never), t).toBe(true);
    }
  });

  it("has every winter and desert site, and the old families besides", () => {
    const map = mapOf(ID);
    const ground = (o: MapObject): string | undefined =>
      cellAt(map, o.x, o.y)?.terrain;
    for (const type of [
      "pyramid",
      "sphinx",
      "sun-temple",
      "sunken-tomb",
      "oasis",
    ]) {
      expect(ofType(map, type).length, type).toBeGreaterThanOrEqual(1);
    }
    for (const type of [
      "frost-giants-barrow",
      "aurora-spire",
      "hunters-lodge",
      "walrus-rookery",
    ]) {
      const sites = ofType(map, type);
      expect(sites.length, type).toBeGreaterThanOrEqual(1);
      for (const o of sites) expect(ground(o), o.id).toBe("snow");
    }
    for (const o of ofType(map, "pyramid")) expect(ground(o)).toBe("sand");
    expect(ofType(map, "pyramid")).toHaveLength(1);
    expect(ofType(map, "sunken-tomb").length).toBeGreaterThanOrEqual(2);
    expect(ofType(map, "frost-giants-barrow")).toHaveLength(2);
    // The old families, in numbers.
    expect(count(map, (o) => o.kind === "mine")).toBeGreaterThanOrEqual(30);
    expect(count(map, (o) => o.kind === "dwelling")).toBeGreaterThanOrEqual(20);
    expect(
      ofType(map, "stat-shrine").length + ofType(map, "school-shrine").length,
    ).toBeGreaterThanOrEqual(40);
    expect(count(map, (o) => o.kind === "town")).toBe(7);
  });

  it("is rich: 35 or more artifacts, 24 guarded banks, 175 guards, more than the others", () => {
    const map = mapOf(ID);
    const artifacts = (m: GameMap): number =>
      count(m, (o) => o.kind === "artifact");
    const banks = (m: GameMap): number =>
      count(
        m,
        (o) =>
          o.kind === "bank" &&
          Array.isArray(o.data["guard"]) &&
          (o.data["guard"] as unknown[]).length > 0,
      );
    const guards = (m: GameMap): number =>
      count(m, (o) => o.kind === "monster");
    expect(artifacts(map)).toBeGreaterThanOrEqual(35);
    expect(banks(map)).toBeGreaterThanOrEqual(24);
    expect(guards(map)).toBeGreaterThanOrEqual(175);
    expect(
      count(map, (o) => o.kind === "pickup" || o.kind === "artifact"),
    ).toBeGreaterThanOrEqual(110);
    for (const other of ["keepers-toll", "hourglass-marches"]) {
      const m = mapOf(other);
      expect(artifacts(map), other).toBeGreaterThan(artifacts(m));
      expect(banks(map), other).toBeGreaterThan(banks(m));
      expect(guards(map), other).toBeGreaterThan(guards(m));
    }
  });

  it("spreads the Second Left Glove over the desert, the snow and the lava", () => {
    const map = mapOf(ID);
    const prizeHas = (o: MapObject, artifact: string): boolean => {
      const prize = o.data["prize"] as { artifacts?: string[] } | undefined;
      return prize?.artifacts?.includes(artifact) ?? false;
    };
    const pyramid = obj(map, "pyramid-1");
    expect(prizeHas(pyramid, "the-gloves-thumb")).toBe(true);
    const barrow = obj(map, "frost-giants-barrow-1");
    expect(prizeHas(barrow, "the-gloves-lining")).toBe(true);
    expect(barrow.data["size"]).toBe("large");
    const cufflink = obj(map, "loose-artifact-cufflink");
    expect(cufflink.data["artifact"]).toBe("the-odd-cufflink");
    expect(cellAt(map, cufflink.x, cufflink.y)?.terrain).toBe("volcanic");
    for (const piece of [
      "the-gloves-thumb",
      "the-gloves-lining",
      "the-odd-cufflink",
    ]) {
      expect(wornDef(piece)?.pieceOf).toBe("the-second-left-glove");
    }
    // Each piece behind a strong fight: the banks' own guards, the lizards.
    const fv = (stacks: Array<{ creature: string; count: number }>): number =>
      stacks.reduce(
        (n, s) => n + s.count * getCreature(s.creature).fightValue,
        0,
      );
    for (const bank of [pyramid, barrow]) {
      const stacks = bank.data["guard"] as Array<{
        creature: string;
        count: number;
      }>;
      expect(fv(stacks), bank.id).toBeGreaterThanOrEqual(7500);
    }
    const lizards = obj(map, "monster-cufflink");
    expect(lizards.data["creature"]).toBe("t-rex");
    expect(lizards.data["guards"]).toEqual(["loose-artifact-cufflink"]);
    expect(Number(lizards.data["fv"])).toBeGreaterThanOrEqual(7500);
    // Each piece is at least two days from every start.
    for (const t of startTownsOf(map)) {
      const d = travelCosts(map, t.x, t.y, { gatesOpen: true });
      for (const o of [pyramid, barrow, cufflink]) {
        expect(
          costAt(d, map, o) / DAY_MP,
          `${o.id} from ${t.id}`,
        ).toBeGreaterThan(2);
      }
    }
  });

  it("lets every start reach every object and all open ground", () => {
    // The generator's many-seed rules (tests/core/map/generate.test.ts):
    // every object entrance and every walkable cell is reachable.
    const map = mapOf(ID);
    const walk = walkable(map);
    for (const t of startTownsOf(map)) {
      const cost = moveCosts(map, t.x, t.y);
      for (const o of map.objects) {
        expect(Number.isFinite(cost[o.y * map.width + o.x]), o.id).toBe(true);
      }
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          if (!walk(x, y)) continue;
          expect(
            Number.isFinite(cost[y * map.width + x]),
            `pocket at (${x},${y}) from ${t.id}`,
          ).toBe(true);
        }
      }
    }
  });
});
