/**
 * Object placement (bead bzc.3): towns (early, so the landscape leaves room
 * for them), then everything else from the shared object table in
 * src/data/mapObjects.ts.
 *
 * 1. Pockets: dead-end rooms behind a single gap. A guard in the gap holds
 *    the whole room, which is filled with prizes (a big one is a treasure
 *    clearing with a set mix, bead bzc.96). Then the guarded treasure
 *    clusters' nooks (gen/hoards.ts, bead bzc.96), and the costs: movement
 *    cost from every start town (plus a lower bound as if roads ran
 *    everywhere, for "at least N days away" rules).
 * 2. Requests: the start kit (rolled once, placed for every player, so every
 *    start is equally fair), the pocket prizes, and a random fill per zone
 *    from the table's weights up to the zone kind's density (start zones are
 *    filled once and the same list goes into every start zone); a zone's
 *    treasure clusters stand in for as many of its loose pickups.
 * 3. Placement: the clusters' loot first, then footprints that block cells
 *    (only where they cannot cut anything off; with reserveRare the rule
 *    and rare big sites before the common ones, on the plazas kept for
 *    them), then roads between all towns and spurs to mines, then
 *    single-cell objects. A rare big site with no room left tries the
 *    other wild zones; a fill footprint then gets a single-cell stand-in;
 *    one-time pickups are placed as if they block their cell (taken from
 *    beside them), off the roads (bead bzc.50).
 * 4. Guards: every object worth at least its zone's free value gets a guard
 *    beside its entrance unless a pocket guard already holds it; passes get
 *    a guard from the value of the zone they open; neutral towns get a
 *    garrison. Every guard's fight value follows the value it holds.
 */
import type { MapZoneKind } from "../../../data/mapObjects.ts";
import {
  DESERT_ROWS,
  FREE_VALUE,
  NEUTRAL_TOWN_VALUE,
  PASS_VALUE,
  minDaysForValue,
} from "../../../data/mapObjects.ts";
import { GATE_COLOURS, WAYSTONE_COLOURS } from "../../../data/objectTypes.ts";
import type { ObjectTypeId } from "../../../data/objectTypes.ts";
import { isPickup } from "../../game/site-state.ts";
import { desertSites } from "./desert.ts";
import { carveHoards, hoardRate } from "./hoards.ts";
import { assignQuests } from "./quests.ts";
import { rollContents, strangeThing } from "./contents.ts";
import type { MapObjectRow } from "../../../data/mapObjects.ts";
import { deriveSeed } from "../../rng.ts";
import type { Rng } from "../../rng.ts";
import type { GameMap, MapObject } from "../types.ts";
import type { GenConfig, MapSize, PlayerCount } from "./config.ts";
import { chamferDistance, N8, noiseField } from "./grid.ts";
import {
  HOLD_DEFENSE_BONUS,
  HOLD_GARRISON,
  HOLD_NAME,
  garrisonFor,
  guardTarget,
  ringOf,
  sizeGuard,
  type GuardStack,
} from "./guards.ts";
import {
  canStep,
  movementCost,
  reachable,
  roadCosts,
  roadPath,
} from "./paths.ts";
import type { RoadCosts } from "./paths.ts";
import {
  O,
  T,
  TERRAIN_OF,
  corridorMask,
  homeCell,
  isWalkable,
  newState,
  stageRng,
  stageSalt,
} from "./state.ts";
import type { GenState, PassInfo, TownSite } from "./state.ts";

// ---------------------------------------------------------------------------
// Towns

/** The winter sites each snow zone gets (bead bzc.87), in placing order. */
export const WINTER_SITES: readonly ObjectTypeId[] = [
  "frost-giants-barrow",
  "walrus-rookery",
  "aurora-spire",
  "hunters-lodge",
];

const TOWN_NAMES = [
  "Ashford",
  "Greywatch",
  "Thornbury",
  "Millbrook",
  "Redcliff",
  "Oakhollow",
  "Saltmere",
  "Dunmoor",
];

/** Footprint cells of a town whose entrance (bottom middle) is at (x, y). */
function townBlocked(
  st: GenState,
  x: number,
  y: number,
): Array<[number, number]> {
  const { w, h } = st.cfg.objects.town;
  const left = -Math.floor(w / 2);
  const out: Array<[number, number]> = [];
  for (let dy = -(h - 1); dy <= 0; dy++) {
    for (let dx = left; dx < left + w; dx++) {
      if (dx === 0 && dy === 0) continue;
      out.push([x + dx, y + dy]);
    }
  }
  return out;
}

/**
 * Choose every town site deep inside its zone and reserve it: one per start
 * zone (in player order), one per neutral-town zone, the Hold in its zone.
 */
export function placeTowns(st: GenState): void {
  const rng = stageRng(st, "towns");
  const starts = st.zones
    .filter((z) => z.role === "start")
    .sort((a, b) => (a.player ?? 0) - (b.player ?? 0));
  for (const z of starts) {
    const player = z.player ?? 0;
    addTown(st, {
      cell: siteFor(st, rng, z.id),
      zone: z.id,
      role: player < st.activePlayers ? "player" : "open-start",
      player,
    });
  }
  for (const z of st.zones.filter((q) => q.role === "town")) {
    addTown(st, { cell: siteFor(st, rng, z.id), zone: z.id, role: "neutral" });
  }
  const hold = st.zones.find((z) => z.role === "hold");
  if (!hold) throw new Error("mapgen: missing the Hold's zone");
  addTown(st, { cell: siteFor(st, rng, hold.id), zone: hold.id, role: "hold" });
}

function siteFor(st: GenState, rng: Rng, zone: number): number {
  const { g, cfg } = st;
  const { dist } = chamferDistance(g, (i) => (st.zone[i] ?? 0) !== zone);
  const { w, h } = cfg.objects.town;
  const scored: Array<{ i: number; s: number }> = [];
  for (let i = 0; i < g.n; i++) {
    if ((st.zone[i] ?? 0) !== zone) continue;
    const x = g.x(i);
    const y = g.y(i);
    const edge = Math.min(x - w / 2, y - h, g.w - 1 - x - w / 2, g.h - 3 - y);
    if (edge < 2) continue;
    scored.push({ i, s: Math.min(dist[i] ?? 0, edge * 1.3) });
  }
  if (scored.length === 0) throw new Error("mapgen: no town site");
  const best = Math.max(...scored.map((p) => p.s));
  const pool = scored.filter((p) => p.s >= best - 1.2);
  return rng.pick(pool).i;
}

/** The v0.2 factions a neutral town may belong to (seeded per town). */
export const NEUTRAL_TOWN_FACTIONS = [
  "humans",
  "undead",
  "goblins",
  "candy",
] as const;

/** A neutral town's faction: seeded by the map seed and the town's index. */
export function neutralTownFaction(seed: number, index: number): string {
  const k = deriveSeed(seed, "neutral-town-faction", index);
  return NEUTRAL_TOWN_FACTIONS[
    (k >>> 0) % NEUTRAL_TOWN_FACTIONS.length
  ] as string;
}

function townData(st: GenState, site: TownSite): Record<string, unknown> {
  const named = (k: number): string =>
    TOWN_NAMES[(k + (st.seed >>> 0)) % TOWN_NAMES.length] ?? "Ashford";
  switch (site.role) {
    case "player":
      return {
        faction: "lost-world",
        owner: site.player ?? 0,
        start: site.player,
      };
    case "open-start":
    case "neutral":
      // A neutral town: today's game treats an open start like one. Its
      // garrison is sized with the guards (see placeObjects).
      return {
        faction: neutralTownFaction(st.seed, st.towns.length),
        owner: null,
        hold: false,
        name: named(st.towns.length),
        value: NEUTRAL_TOWN_VALUE,
        garrison: [],
        ...(site.role === "open-start" ? { start: site.player } : {}),
      };
    case "hold":
      return {
        faction: "goblin",
        owner: null,
        hold: true,
        name: HOLD_NAME,
        garrison: HOLD_GARRISON.map((s) => ({ ...s })),
        defenseBonus: HOLD_DEFENSE_BONUS,
      };
  }
}

function addTown(st: GenState, site: TownSite): void {
  const { g, cfg } = st;
  const x = g.x(site.cell);
  const y = g.y(site.cell);
  const blocked = townBlocked(st, x, y);
  const { w, h } = cfg.objects.town;
  const obj: MapObject = {
    id: `town-${st.towns.length + 1}`,
    kind: "town",
    x,
    y,
    footprint: { w, h },
    blocked,
    data: townData(st, site),
  };
  st.towns.push(site);
  commit(st, obj);
  const r = cfg.objects.townClearance;
  for (const [cx, cy] of [[x, y] as [number, number], ...blocked]) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (g.inside(cx + dx, cy + dy))
          st.keepOpen[g.idx(cx + dx, cy + dy)] = 1;
      }
    }
  }
  // The entrance's south side stays open: a hero starts there.
  for (let dy = 1; dy <= r + 2 && g.inside(x, y + dy); dy++) {
    st.keepOpen[g.idx(x, y + dy)] = 1;
  }
  if (site.role === "player" && g.inside(x, y + 1)) {
    const player = site.player ?? 0;
    commit(st, {
      id: `hero-start-${player}`,
      kind: "hero-start",
      x,
      y: y + 1,
      footprint: { w: 1, h: 1 },
      blocked: [],
      data: { player },
    });
  }
}

function commit(st: GenState, obj: MapObject): void {
  const { g } = st;
  st.objects.push(obj);
  st.occupied[g.idx(obj.x, obj.y)] = 1;
  for (const [bx, by] of obj.blocked) {
    const i = g.idx(bx, by);
    st.occupied[i] = 1;
    st.objBlocked[i] = 1;
  }
}

// ---------------------------------------------------------------------------
// Placement

/** A thing to place: a table row with its rolled payload and constraints. */
interface Request {
  row: MapObjectRow;
  data: Record<string, unknown>;
  value: number;
  /** Zones it may go into. */
  zones: readonly number[];
  /** Cost window (movement points) from `from`, when set. */
  from?: number;
  minCost: number;
  maxCost: number;
  /** Keep at least this cost from every start (lower bound, roads anywhere). */
  minFar: number;
  /** A start exempt from `minFar` (the owner of a start-kit item). */
  except?: number;
  /** Required: report when it finds no site. */
  required: boolean;
  /** Pocket index it must go into, or -1 for none (and never a pocket). */
  pocket: number;
  /** Guard it with its own stack (not for pocket contents). */
  guarded: boolean;
  label: string;
  /**
   * The random fill's single-cell stand-in for a footprint that finds no
   * room (narrow valleys hold few 2x2 sites), so the zone still gets its
   * share of things to do.
   */
  fallback?: Fill;
  /** A big rare site (the vault): one more try at half the distance. */
  relax?: boolean;
  /** Placed by rule (CONTENT_MAP_OBJECTS 3.6, 3.9, 3.4). */
  rule?: boolean;
  /**
   * Its entrance stands on this terrain while any such site is free (the
   * winter sites on snow, bead bzc.87); the last try takes any ground.
   */
  ground?: number;
  /**
   * The candidate-order stream (default: the stage's own). The desert's
   * sites (bead bzc.88) use their own, so trying them leaves the other
   * placements' draws as they were.
   */
  order?: Rng;
}

/** A drawn fill row with its rolled payload. */
interface Fill {
  row: MapObjectRow;
  data: Record<string, unknown>;
}

interface Pocket {
  zone: number;
  /** The guard cell (in the gap). */
  cell: number;
  cells: number[];
  ids: string[];
  value: number;
}

interface GuardRequest {
  cell: number;
  value: number;
  /** A creature that must guard (a Haunted Mine's Sextons). */
  force?: string;
  /** Cell whose distance sets the ring. */
  ringAt: number;
  guards: string[];
  pass?: boolean;
  /**
   * Requests of one group get the first one's stack and ring (bead
   * bzc.102: the starts' own clusters, guarded alike).
   */
  group?: string;
}

export interface PlacementReport {
  /** Requests that found no site (should stay empty). */
  skipped: string[];
  /** Optional requests (fill, pocket prizes, rules) that found no site. */
  unplaced: number;
  /** Treasure clusters placed (bead bzc.96): guard and loot cells. */
  hoards: Array<{ guard: number; loot: number[] }>;
  /** Pockets that became treasure clearings (their gap cells). */
  clearings: number[];
}

/**
 * A one-time pickup taken from a cell beside it: the game's own rule
 * ({@link isPickup}, bead bzc.49), so the two never drift apart. The
 * generator treats its cell as blocked, so it never seals a passage, keeps
 * it off the roads, and puts its guard where the guard's zone of control
 * covers every cell it can be taken from (bead bzc.50).
 */
export function collectedBeside(row: MapObjectRow): boolean {
  // Single cells only (every catalogue pickup is one; a made-up bigger
  // "pickup" row is placed like any footprint).
  if (row.footprint.w * row.footprint.h !== 1) return false;
  return isPickup({
    id: row.id,
    kind: row.kind,
    x: 0,
    y: 0,
    footprint: { ...row.footprint },
    blocked: [],
    data: { ...row.data, type: row.type },
  });
}

export function placeObjects(st: GenState): PlacementReport {
  const { g, cfg } = st;
  const oc = cfg.objects;
  const day = cfg.movement.day;
  const report: PlacementReport = {
    skipped: [],
    unplaced: 0,
    hoards: [],
    clearings: [],
  };
  const rng = stageRng(st, "objects");

  const starts = st.towns.filter(
    (t) => t.role === "player" || t.role === "open-start",
  );
  const nearTown = (i: number, r: number): boolean =>
    st.towns.some((t) => g.cheb(t.cell, i) <= r);

  // 1. Pockets (dead-end rooms behind a gap), first.
  const pocketOf = new Int32Array(g.n).fill(-1);
  const pockets = findPockets(
    st,
    reachable(st, homeCell(st)),
    pocketOf,
    nearTown,
  );
  for (const p of pockets) st.occupied[p.cell] = 1;

  // Treasure clusters (bead bzc.96): how many things each holds, drawn per
  // zone from their own stream, then the sites and their walls, before
  // the costs (the walls lengthen some ways) and the fill.
  const hrng = stageRng(st, "hoards");
  const hc = cfg.hoards;
  const hoardSizes: number[][] = st.zones.map(() => []);
  const hoardOpen: number[] = st.zones.map(() => 0);
  const hoardArts: number[][] = st.zones.map(() => []);
  if (Object.values(hc.rate).some((r) => r > 0) || hc.start.things >= 2) {
    const seen = reachable(st, homeCell(st));
    for (let i = 0; i < g.n; i++) {
      if (seen[i] === 1 && isWalkable(st, i) && (pocketOf[i] ?? -1) < 0) {
        const z = st.zone[i] ?? 0;
        hoardOpen[z] = (hoardOpen[z] ?? 0) + 1;
      }
    }
    for (const z of st.zones) {
      const want = Math.round(
        ((hoardOpen[z.id] ?? 0) * hoardRate(st, z.id)) / 100,
      );
      // The treasure zones' clusters are richer (bead bzc.102).
      const rich = hc.rich[z.role];
      const chance = rich?.artifacts ?? hc.artifacts;
      for (let k = 0; k < want; k++) {
        const arts = hrng.chance(chance[0])
          ? 1 + (hrng.chance(chance[1]) ? 1 : 0)
          : 0;
        const piles = Math.min(
          hrng.int(...(rich?.piles ?? hc.piles)),
          hc.most - arts,
        );
        hoardSizes[z.id]?.push(piles + arts);
        hoardArts[z.id]?.push(arts);
      }
    }
  }
  const hoardSites = carveHoards(st, {
    open: hoardOpen,
    pocketOf,
    pocketGaps: pockets.map((p) => p.cell),
    sizes: (z) => hoardSizes[z] ?? [],
  });
  report.hoards = hoardSites.map((h) => ({ guard: h.guard, loot: h.loot }));

  // Then the costs from every start town.
  const startCost = starts.map((t) => movementCost(st, t.cell));
  // A lower bound as if roads ran everywhere: roads built later cannot
  // bring anything closer than this.
  const roadLow = starts.map((t) =>
    movementCost(st, t.cell, cfg.movement.road),
  );
  const near = movementCost(
    st,
    starts.map((t) => t.cell),
  );
  st.cost = startCost[0] ?? near;
  const reach = reachable(st, homeCell(st));
  // Cells an object may use: reachable open ground, not a pass or gap
  // corridor and not a town yard (footprints and guards are tracked in
  // st.occupied). Other kept-open cells (pass mouths) are fine: objects
  // that block cells are checked not to cut anything off.
  const corridor = corridorMask(st);
  const base = new Uint8Array(g.n);
  for (let i = 0; i < g.n; i++) {
    base[i] =
      reach[i] === 1 &&
      isWalkable(st, i) &&
      corridor[i] === 0 &&
      !nearTown(i, oc.townClearance + 1)
        ? 1
        : 0;
  }

  // Zone open cells (reachable walkable ground).
  const zoneCells: number[][] = st.zones.map(() => []);
  for (let i = 0; i < g.n; i++) {
    if ((reach[i] ?? 0) && isWalkable(st, i))
      zoneCells[st.zone[i] ?? 0]?.push(i);
  }

  // 2. Requests.
  const roll = (
    r: Rng,
    row: MapObjectRow,
    tier: number,
  ): Record<string, unknown> => {
    const data: Record<string, unknown> = { ...row.data, type: row.type };
    for (const [k, [lo, hi, step]] of Object.entries(row.rolls ?? {})) {
      data[k] = r.int(Math.round(lo / step), Math.round(hi / step)) * step;
    }
    // Seeded contents (bead bzc.13): variant, spell, prize, guard, value.
    return { ...data, ...rollContents(row.type, r, tier) };
  };
  const tierOf = (z: number): number => {
    const zone = st.zones[z];
    if (zone === undefined) return 1;
    return zone.role === "hold" ? 3 : Math.min(3, zone.tier);
  };
  const valueOf = (
    row: MapObjectRow,
    data: Record<string, unknown>,
  ): number => {
    const set = data["value"];
    if (typeof set === "number") return set;
    const unit = row.unitValue;
    const amount = unit ? Number(data[unit.field] ?? 0) : 0;
    return row.value + (unit ? amount * unit.value : 0);
  };
  const kindOf = (z: number): MapZoneKind => st.zones[z]?.role ?? "middle";
  const guardedIn = (
    row: MapObjectRow,
    value: number,
    z: number,
    data: Record<string, unknown> = {},
  ): boolean =>
    data["guard"] === undefined &&
    (row.guard === "always" ||
      (row.guard === "auto" && value >= FREE_VALUE[kindOf(z)]));
  /**
   * Ring placement by value (CONTENT_MAP_OBJECTS section 2); a mine of a
   * resource (a Haunted Mine too) keeps at least as far out as that
   * resource's plain mine (ECONOMY 4: one Essence Spring near home).
   */
  const farFor = (
    row: MapObjectRow,
    value: number,
    data: Record<string, unknown>,
  ): number => {
    const res = row.kind === "mine" ? data["resource"] : undefined;
    const plain =
      typeof res === "string"
        ? (oc.table.find((r) => r.id === `mine-${res}`)?.minDays ?? 0)
        : 0;
    return Math.max(row.minDays ?? 0, plain, minDaysForValue(value)) * day;
  };
  const requests: Request[] = [];

  // The start kit: rolled once, the same for every player.
  const krng = stageRng(st, "start-kit");
  const neighbours = (z: number): number[] =>
    st.connections
      .filter((c) => c.a === z || c.b === z)
      .map((c) => (c.a === z ? c.b : c.a))
      .filter((m) => st.zones[m]?.role !== "hold");
  for (const item of oc.startKit) {
    // "One strange thing near home" (concept section 3): rolled once.
    const strange = item.row === "strange-thing" ? strangeThing(krng) : null;
    const row =
      strange !== null
        ? oc.table.find((r) => r.type === strange.type)
        : oc.table.find((r) => r.id === item.row);
    if (!row) throw new Error(`mapgen: unknown start kit row ${item.row}`);
    for (let c = 0; c < item.count; c++) {
      const data =
        strange !== null
          ? { ...row.data, type: row.type, ...strange.data }
          : roll(krng, row, 0);
      const value = valueOf(row, data);
      starts.forEach((t, k) => {
        requests.push({
          row,
          data,
          value,
          zones: item.nextZone ? [t.zone, ...neighbours(t.zone)] : [t.zone],
          from: k,
          minCost: item.minDays * day,
          maxCost: item.maxDays * day,
          // A row that keeps away from starts keeps away from the others.
          minFar: (row.minDays ?? 0) * day,
          except: k,
          required: true,
          pocket: -1,
          guarded: guardedIn(row, value, t.zone, data),
          label: `start kit ${item.row} for start ${t.player ?? k}`,
        });
      });
    }
  }

  // Rows drawn so far on the whole map, for the per-map caps.
  const drawn = new Map<string, number>();
  const capOf = (row: MapObjectRow): number =>
    oc.perMap[row.id]?.[st.size]?.[1] ?? Infinity;
  const drawRow = (
    r: Rng,
    kind: MapZoneKind,
    count: Map<string, number>,
    filter: (row: MapObjectRow) => boolean,
  ): MapObjectRow | undefined => {
    const rows = oc.table.filter(
      (row) =>
        (row.weights[kind] ?? 0) > 0 &&
        (row.perZone === undefined || (count.get(row.id) ?? 0) < row.perZone) &&
        (drawn.get(row.id) ?? 0) < capOf(row) &&
        filter(row),
    );
    if (rows.length === 0) return undefined;
    const row = r.weighted(
      rows,
      rows.map((x) => x.weights[kind] ?? 0),
    );
    drawn.set(row.id, (drawn.get(row.id) ?? 0) + 1);
    return row;
  };

  const kitRequests = requests.length;

  // Pocket prizes: one guard-worthy prize and a few more.
  const prng = stageRng(st, "pockets");
  // Treasure clearings (bead bzc.96): a big pocket holds a set mix of good
  // things, from its own stream.
  const cc = cfg.clearings;
  const crng = stageRng(st, "clearings");
  const rowById = (id: string): MapObjectRow | undefined =>
    oc.table.find((r) => r.id === id);
  const resourceRows = oc.table.filter(
    (r) =>
      r.kind === "pickup" &&
      r.type === "resource-pile" &&
      r.footprint.w * r.footprint.h === 1,
  );
  pockets.forEach((p, k) => {
    const kind = kindOf(p.zone);
    if (cc.enabled && p.cells.length >= cc.minCells) {
      report.clearings.push(p.cell);
      const tier = tierOf(p.zone);
      const things: MapObjectRow[] = [];
      const art = rowById("loose-artifact");
      for (let c = crng.int(...cc.artifacts); c > 0 && art; c--)
        things.push(art);
      const sites = cc.siteRows
        .map(rowById)
        .filter(
          (r): r is MapObjectRow =>
            r !== undefined && (r.weights[kind] ?? 0) > 0,
        );
      const count = new Map<string, number>();
      for (let c = crng.int(...cc.sites); c > 0 && sites.length > 0; c--) {
        const open = sites.filter(
          (r) => r.perZone === undefined || (count.get(r.id) ?? 0) < r.perZone,
        );
        if (open.length === 0) break;
        const row = crng.weighted(
          open,
          open.map((r) => r.weights[kind] ?? 0),
        );
        count.set(row.id, (count.get(row.id) ?? 0) + 1);
        things.push(row);
      }
      for (let c = crng.int(...cc.piles); c > 0; c--) {
        things.push(
          crng.weighted(
            resourceRows,
            resourceRows.map((r) => r.weights[kind] ?? 0),
          ),
        );
      }
      for (const row of things) {
        const data = roll(crng, row, tier);
        const value = valueOf(row, data);
        requests.push({
          row,
          data,
          value,
          zones: [p.zone],
          minCost: 0,
          maxCost: Infinity,
          minFar: farFor(row, value, data),
          required: false,
          pocket: k,
          guarded: false,
          label: `clearing ${k} ${row.id}`,
        });
      }
      return;
    }
    const n = prng.int(...oc.pocketPrizes);
    const count = new Map<string, number>();
    for (let c = 0; c < n; c++) {
      // Rows counted per map (services such as the Drill Yard) stay out
      // of the dead ends: a pocket holds treasure.
      const row = drawRow(
        prng,
        kind,
        count,
        (r) =>
          oc.perMap[r.id] === undefined &&
          // A bank holds its own guards: no pocket guard stands for one
          // (bead bzc.96, with the clearings).
          !(cc.enabled && r.kind === "bank") &&
          (c === 0 ? r.value >= FREE_VALUE[kind] : true),
      );
      if (!row) continue;
      count.set(row.id, (count.get(row.id) ?? 0) + 1);
      const data = roll(prng, row, tierOf(p.zone));
      const value = valueOf(row, data);
      requests.push({
        row,
        data,
        value,
        zones: [p.zone],
        minCost: 0,
        maxCost: Infinity,
        minFar: farFor(row, value, data),
        required: false,
        pocket: k,
        guarded: false,
        label: `pocket ${k} ${row.id}`,
      });
    }
  });

  // Random fill per zone; start zones share one list.
  const frng = stageRng(st, "fill");
  const startZones = starts.map((t) => t.zone);
  const smallestStart = Math.min(
    ...startZones.map((z) => zoneCells[z]?.length ?? 0),
  );
  const kitPerStart = oc.startKit.reduce((s, item) => s + item.count, 0);
  // Stand-ins come from their own stream, so the fill itself draws as
  // before.
  const brng = stageRng(st, "fill-fallback");
  const fillFor = (
    kind: MapZoneKind,
    open: number,
    already: number,
    tier: number,
  ): Array<Fill & { fallback?: Fill }> => {
    const out: Array<Fill & { fallback?: Fill }> = [];
    const n = Math.max(
      0,
      Math.round((open * oc.density[kind]) / 100) - already,
    );
    const count = new Map<string, number>();
    const spare = new Map<string, number>();
    for (let c = 0; c < n; c++) {
      const row = drawRow(frng, kind, count, () => true);
      if (!row) break;
      count.set(row.id, (count.get(row.id) ?? 0) + 1);
      const item: Fill & { fallback?: Fill } = {
        row,
        data: roll(frng, row, tier),
      };
      if (row.footprint.w * row.footprint.h > 1) {
        const single = oc.table.filter(
          (r) =>
            (r.weights[kind] ?? 0) > 0 &&
            r.footprint.w * r.footprint.h === 1 &&
            oc.perMap[r.id] === undefined &&
            (r.perZone === undefined ||
              (count.get(r.id) ?? 0) + (spare.get(r.id) ?? 0) < r.perZone),
        );
        if (single.length > 0) {
          const alt = brng.weighted(
            single,
            single.map((r) => r.weights[kind] ?? 0),
          );
          spare.set(alt.id, (spare.get(alt.id) ?? 0) + 1);
          item.fallback = { row: alt, data: roll(brng, alt, tier) };
        }
      }
      out.push(item);
    }
    return out;
  };
  const startFill = fillFor("start", smallestStart, kitPerStart, 0);
  for (const t of starts) {
    for (const f of startFill) {
      const value = valueOf(f.row, f.data);
      requests.push({
        row: f.row,
        data: f.data,
        value,
        zones: [t.zone],
        from: starts.indexOf(t),
        minCost: 0.5 * day,
        maxCost: Infinity,
        minFar: 0,
        required: false,
        pocket: -1,
        guarded: guardedIn(f.row, value, t.zone, f.data),
        label: `start fill ${f.row.id}`,
        ...(f.fallback !== undefined ? { fallback: f.fallback } : {}),
      });
    }
  }
  for (const z of st.zones) {
    if (z.role === "start") continue;
    let open = 0;
    for (const i of zoneCells[z.id] ?? []) if ((pocketOf[i] ?? 0) < 0) open++;
    // A treasure cluster's things count towards the zone's share (bead
    // bzc.96): the fill draws as before, and as many of its loose
    // pickups as the clusters hold are left out, so the zone holds as many
    // things as before, more of them in guarded groups and fewer strewn
    // one by one (its sites are drawn as they were).
    let hoarded = hoardSites
      .filter((h) => h.zone === z.id)
      .reduce((n, h) => n + h.loot.length, 0);
    const drawnFill = fillFor(z.role, open, 0, tierOf(z.id)).filter((f) => {
      // Only the loose things of a cluster's kind (bead bzc.102: resource
      // piles and artifacts; chests, campfires and the rest stay).
      if (
        hoarded <= 0 ||
        (f.row.type !== "resource-pile" && f.row.type !== "loose-artifact") ||
        f.row.footprint.w * f.row.footprint.h !== 1
      )
        return true;
      hoarded--;
      return false;
    });
    for (const f of drawnFill) {
      const value = valueOf(f.row, f.data);
      requests.push({
        row: f.row,
        data: f.data,
        value,
        zones: [z.id],
        minCost: 0,
        maxCost: Infinity,
        minFar: farFor(f.row, value, f.data),
        required: false,
        pocket: -1,
        guarded: guardedIn(f.row, value, z.id, f.data),
        label: `fill ${f.row.id} in zone ${z.id}`,
        ...(f.fallback !== undefined ? { fallback: f.fallback } : {}),
      });
    }
  }
  // Rows the fill drew fewer times than their per-map minimum go into a
  // random zone where they may appear (their own random stream: a map
  // with no minimum is unchanged).
  for (const [id, bySize] of Object.entries(oc.perMap)) {
    const least = bySize[st.size]?.[0] ?? 0;
    const row = oc.table.find((r) => r.id === id);
    if (row === undefined || (drawn.get(id) ?? 0) >= least) continue;
    const urng = stageRng(st, `per-map:${id}`);
    const zones = st.zones.filter(
      (z) => z.role !== "start" && (row.weights[z.role] ?? 0) > 0,
    );
    while (zones.length > 0 && (drawn.get(id) ?? 0) < least) {
      const z = urng.pick(zones);
      const data = roll(urng, row, tierOf(z.id));
      const value = valueOf(row, data);
      drawn.set(id, (drawn.get(id) ?? 0) + 1);
      requests.push({
        row,
        data,
        value,
        zones: [z.id],
        minCost: 0,
        maxCost: Infinity,
        minFar: farFor(row, value, data),
        required: false,
        pocket: -1,
        guarded: guardedIn(row, value, z.id, data),
        label: `per-map ${row.id} in zone ${z.id}`,
      });
    }
  }
  // Rows counted per map are few and big: right after the start kits, they
  // find a site before the fill crowds their zone (no such row, no change).
  const counted = (r: Request): boolean =>
    oc.perMap[r.row.id] !== undefined && r.pocket < 0;
  const rest = requests.splice(kitRequests);
  requests.push(
    ...rest.filter((r) => counted(r)),
    ...rest.filter((r) => !counted(r)),
  );

  // Objects placed by rule (CONTENT_MAP_OBJECTS 3.6, 3.9, 3.4): obelisks,
  // the buried Keystone and caches, waystone pairs, pylons, the vault.
  const rrng = stageRng(st, "rules");
  const big = st.size === "L" ? 2 : st.size === "M" ? 1 : 0;
  const wild = st.zones.filter((z) => z.role === "middle" || z.role === "town");
  const ruleZones =
    wild.length > 0 ? wild : st.zones.filter((z) => z.role !== "hold");
  const holdZone = st.zones.find((z) => z.role === "hold");
  const deep = [...ruleZones].sort((a, b) => b.tier - a.tier);
  const ruleRow = (type: ObjectTypeId): MapObjectRow | undefined =>
    oc.ruleRows.find((r) => r.type === type);
  const ruleRequest = (
    type: ObjectTypeId,
    zones: readonly number[],
    extra: Record<string, unknown> = {},
    tier = 1,
    first = false,
  ): void => {
    const row = ruleRow(type);
    if (row === undefined || zones.length === 0) return;
    const data = { ...roll(rrng, row, tier), ...extra };
    const value = valueOf(row, data);
    // A big rare site goes first, before the fill crowds its zone.
    requests[first ? "unshift" : "push"]({
      row,
      data,
      value,
      zones,
      minCost: 0,
      maxCost: Infinity,
      minFar: row.kind === "buried" ? 0 : farFor(row, value, data),
      required: false,
      pocket: -1,
      guarded: guardedIn(row, value, zones[0] ?? 0, data),
      label: `rule ${type}`,
      rule: true,
      ...(first ? { relax: true } : {}),
    });
  };
  if (ruleZones.length > 0) {
    const order = rrng.shuffle(ruleZones.map((z) => z.id));
    const nth = (k: number): number[] => [order[k % order.length] ?? 0];
    const obelisks = [4, 6, 8][big] ?? 4;
    for (let k = 0; k < obelisks; k++) ruleRequest("obelisk", nth(k));
    const keystoneZone = holdZone?.id ?? deep[0]?.id ?? 0;
    ruleRequest(
      "buried-keystone",
      [keystoneZone, ...(deep[0] ? [deep[0].id] : [])],
      {},
      3,
    );
    const caches = [3, 4, 6][big] ?? 3;
    for (let k = 0; k < caches; k++)
      ruleRequest("buried-cache", nth(k + 1), {}, tierOf(nth(k + 1)[0] ?? 0));
    const pylons = [3, 4, 5][big] ?? 3;
    for (let k = 0; k < pylons; k++) ruleRequest("pylon", nth(k + 3));
    const pairs = [1, 2, 3][big] ?? 1;
    for (let k = 0; k < pairs && order.length >= 2; k++) {
      const colour = WAYSTONE_COLOURS[k % WAYSTONE_COLOURS.length] ?? "amber";
      const a = order[(2 * k) % order.length] ?? 0;
      const b =
        order[
          (2 * k + Math.max(1, Math.floor(order.length / 2))) % order.length
        ] ?? 0;
      ruleRequest("two-way-waystone", [a], { pair: `${colour}-${k}`, colour });
      ruleRequest(
        "two-way-waystone",
        [a === b ? (order[(2 * k + 1) % order.length] ?? b) : b],
        { pair: `${colour}-${k}`, colour },
      );
    }
    if (big >= 1) {
      ruleRequest(
        "keepers-vault",
        holdZone !== undefined
          ? [holdZone.id, deep[0]?.id ?? holdZone.id]
          : [deep[0]?.id ?? 0],
        {},
        3,
        true,
      );
    }
  }

  // Winter sites (bead bzc.87): in each snow zone a Frost Giant's Barrow,
  // an Aurora Spire and a Walrus Rookery, and a Hunter's Lodge in it or
  // next door; rolled from their own stream and placed right after the
  // start kits, before the fill crowds the zone. A map without snow has
  // no winter zone, so it draws and places exactly as before.
  const winterReqs: Request[] = [];
  const winterZones = st.zones.filter((z) => z.main === "snow");
  if (winterZones.length > 0) {
    const wrng = stageRng(st, "winter-sites");
    for (const z of winterZones) {
      const around = [z.id, ...neighbours(z.id)];
      for (const type of WINTER_SITES) {
        const row = ruleRow(type);
        if (row === undefined) continue;
        const zones = type === "hunters-lodge" ? around : [z.id];
        const data = roll(wrng, row, tierOf(z.id));
        const value = valueOf(row, data);
        winterReqs.push({
          row,
          data,
          value,
          zones,
          minCost: 0,
          maxCost: Infinity,
          minFar: farFor(row, value, data),
          required: false,
          pocket: -1,
          guarded: guardedIn(row, value, z.id, data),
          label: `winter ${type} in zone ${z.id}`,
          relax: true,
          ground: T.snow,
        });
      }
    }
    requests.splice(kitRequests, 0, ...winterReqs);
  }

  // The desert's sites (bead bzc.88): their own random stream, and none on
  // a map without a desert, which so draws exactly as before.
  // The Pyramid goes first of all; the others right after the start kits,
  // before the fill crowds the desert.
  const sites = desertSites(st);
  if (sites.length > 0) {
    const drng = stageRng(st, "desert-sites");
    const orng = stageRng(st, "desert-place");
    let at = kitRequests;
    for (const site of sites) {
      const row =
        DESERT_ROWS.find((r) => r.type === site.type) ??
        oc.table.find((r) => r.type === site.type);
      if (row === undefined) continue;
      const data = roll(drng, row, site.tier);
      const value = valueOf(row, data);
      const req: Request = {
        row,
        data,
        value,
        zones: site.zones,
        minCost: 0,
        maxCost: Infinity,
        minFar: farFor(row, value, data),
        required: false,
        pocket: -1,
        guarded: guardedIn(row, value, site.zones[0] ?? 0, data),
        label: `desert ${site.type}`,
        relax: true,
        order: orng,
      };
      if (site.first) {
        requests.unshift(req);
        at++;
      } else requests.splice(at++, 0, req);
    }
  }

  // 3. Placement: blocking footprints, roads, then single cells.
  const counters = new Map<string, number>();
  const nextId = (prefix: string): string => {
    const n = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, n);
    return `${prefix}-${n}`;
  };
  const crowd = new Uint8Array(g.n);
  const markCrowd = (cells: readonly number[]): void => {
    const r = oc.spacing;
    for (const i of cells) {
      const x = g.x(i);
      const y = g.y(i);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (!g.inside(x + dx, y + dy)) continue;
          const j = g.idx(x + dx, y + dy);
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          // 2: inside the strict spacing, 1: also next door.
          crowd[j] = Math.max(crowd[j] ?? 0, d <= 1 ? 2 : 1);
        }
      }
    }
  };
  for (const o of st.objects) {
    markCrowd([g.idx(o.x, o.y)]);
  }
  const guardReqs: GuardRequest[] = [];
  const gateSites: number[] = [];

  /** Entrances a road may not cross (bead bzc.95). */
  const entrances = new Uint8Array(g.n);
  for (const o of st.objects)
    if (roadMayCross(o) === "never") entrances[g.idx(o.x, o.y)] = 1;
  /**
   * Bead bzc.95, for a footprint placed before the roads: shutting it and
   * its entrance (with every entrance a road may not cross shut already)
   * cuts no town off the first town's ground, leaves its entrance a way in
   * from that ground, and takes no way in from the entrances next to it.
   * So the roads join the towns round every such entrance. Measured
   * against the map before it (cached until the next placement), so a way
   * lost earlier never blocks everything after it.
   */
  let shutVer = 0;
  let shutSeen: { ver: number; seen: Uint8Array } | undefined;
  const shutWalk = (k: number): boolean =>
    isWalkable(st, k) && entrances[k] !== 1;
  const waysOpen = (e: number, foot: readonly number[]): boolean => {
    if (shutSeen?.ver !== shutVer) {
      shutSeen = { ver: shutVer, seen: reachable(st, homeCell(st), shutWalk) };
    }
    const before = shutSeen.seen;
    const seen = reachable(
      st,
      homeCell(st),
      (k) => shutWalk(k) && !foot.includes(k),
    );
    if (st.towns.some((t) => before[t.cell] === 1 && seen[t.cell] !== 1))
      return false;
    const door = (d: number, from: Uint8Array, open: (k: number) => boolean) =>
      g
        .around(d, N8)
        .some(
          (j) =>
            from[j] === 1 &&
            canStep(st, j, g.x(d) - g.x(j), g.y(d) - g.y(j), open),
        );
    const openBefore = (k: number): boolean => isWalkable(st, k);
    const openAfter = (k: number): boolean =>
      isWalkable(st, k) && (k === e || !foot.includes(k));
    if (!door(e, seen, openAfter)) return false;
    for (const f of foot) {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (!g.inside(g.x(f) + dx, g.y(f) + dy)) continue;
          const k = g.idx(g.x(f) + dx, g.y(f) + dy);
          if (entrances[k] !== 1) continue;
          if (door(k, before, openBefore) && !door(k, seen, openAfter))
            return false;
        }
      }
    }
    return true;
  };
  /** Cells of pickups taken from beside them, blocked while placing. */
  const besideCells: number[] = [];
  /** Every pickup next to `e` keeps an open cell beside it but `e`. */
  const leavesSide = (e: number): boolean =>
    g
      .around(e, N8)
      .every(
        (p) =>
          st.objBlocked[p] !== 1 ||
          !besideCells.includes(p) ||
          g.around(p, N8).some((q) => q !== e && isWalkable(st, q)),
      );
  const free = (i: number): boolean =>
    base[i] === 1 && st.occupied[i] === 0 && st.objBlocked[i] === 0;
  /** Whether a request may use a plaza's ground (bead bzc.96). */
  let plazaFor: (r: Request) => boolean = () => true;

  // The treasure clusters' loot and guards (bead bzc.96), before anything
  // else takes their cells: artifacts at the middle of the back, resource
  // piles drawn by the zone's weights. Each pickup is a wall while the
  // rest is placed, like any pickup taken from beside it; the guard's zone
  // of control stays clear of other objects.
  const lrng = stageRng(st, "hoard-loot");
  const artifactRow = oc.table.find((r) => r.id === "loose-artifact");
  // The starts' own clusters (bead bzc.102) hold the same piles, drawn
  // once from their own stream.
  const srng = stageRng(st, "start-hoard");
  const startLoot: Array<{ row: MapObjectRow; data: Record<string, unknown> }> =
    [];
  for (const site of hoardSites) {
    const kind = kindOf(site.zone);
    const tier = tierOf(site.zone);
    const arts =
      site.start === undefined ? (hoardArts[site.zone]?.[site.slot] ?? 0) : 0;
    if (site.start !== undefined) {
      while (startLoot.length < site.loot.length) {
        const row = srng.weighted(
          resourceRows,
          resourceRows.map((r) => r.weights.start ?? 0),
        );
        startLoot.push({ row, data: roll(srng, row, 0) });
      }
    }
    const ids: string[] = [];
    let total = 0;
    site.loot.forEach((cell, n) => {
      const same = site.start !== undefined ? startLoot[n] : undefined;
      const row =
        same !== undefined
          ? same.row
          : n < arts && artifactRow !== undefined
            ? artifactRow
            : lrng.weighted(
                resourceRows,
                resourceRows.map((r) => r.weights[kind] ?? 0),
              );
      const data =
        same !== undefined ? { ...same.data } : roll(lrng, row, tier);
      const value = valueOf(row, data);
      const id = nextId(row.id);
      commit(st, {
        id,
        kind: row.kind,
        x: g.x(cell),
        y: g.y(cell),
        footprint: { w: 1, h: 1 },
        blocked: [],
        data: { ...data, value },
      });
      st.objBlocked[cell] = 1;
      besideCells.push(cell);
      if (roadMayCross({ kind: row.kind }) === "never") entrances[cell] = 1;
      ids.push(id);
      total += value;
    });
    markCrowd(site.loot);
    for (const j of [site.guard, ...g.around(site.guard, N8)])
      st.occupied[j] = 1;
    guardReqs.push({
      cell: site.guard,
      value: total,
      ringAt: site.guard,
      guards: ids,
      ...(site.start !== undefined ? { group: "start-hoard" } : {}),
    });
  }

  /**
   * A free neighbour of `e` for a guard, nearest the starts. With `cover`
   * (a pickup taken from beside it), the guard's zone of control must hold
   * every open cell next to `e`, so nobody takes it without the fight.
   * `offRoad` keeps the guard off the roads (1) and its zone of control too
   * (2), so a side prize's guard never stands across the road (bead
   * bzc.50: denser maps put many prizes beside the roads).
   */
  const guardCell = (
    e: number,
    foot: readonly number[],
    cover = false,
    offRoad = 0,
  ): number => {
    let best = -1;
    for (const j of g.around(e, N8)) {
      if (foot.includes(j) || !free(j) || (pocketOf[j] ?? 0) >= 0) continue;
      if (nearTown(j, oc.guardTownClearance)) continue;
      if (offRoad >= 1 && st.road[j] === 1) continue;
      if (offRoad >= 2 && g.around(j, N8).some((k) => st.road[k] === 1))
        continue;
      const x = g.x(e);
      const y = g.y(e);
      // The footprint walls its corners too (bead bzc.95, as in visitable).
      const walk = (k: number): boolean =>
        !(oc.keepWaysOpen && foot.includes(k)) && isWalkable(st, k);
      if (!canStep(st, j, x - g.x(j), y - g.y(j), walk)) continue;
      if (
        cover &&
        g
          .around(e, N8)
          .some((k) => k !== j && isWalkable(st, k) && g.cheb(k, j) > 1)
      )
        continue;
      if (best < 0 || (near[j] ?? 0) < (near[best] ?? 0)) best = j;
    }
    return best;
  };

  const footprintOf = (row: MapObjectRow, e: number): number[] | undefined => {
    const ex = g.x(e) - row.entrance[0];
    const ey = g.y(e) - row.entrance[1];
    const out: number[] = [];
    for (let fy = 0; fy < row.footprint.h; fy++) {
      for (let fx = 0; fx < row.footprint.w; fx++) {
        if (!g.inside(ex + fx, ey + fy)) return undefined;
        out.push(g.idx(ex + fx, ey + fy));
      }
    }
    return out;
  };

  const tryPlace = (req: Request, roads: boolean, order = rng): boolean => {
    const cells =
      req.pocket >= 0
        ? (pockets[req.pocket]?.cells ?? [])
        : req.zones.flatMap((z) => zoneCells[z] ?? []);
    const costs = req.from !== undefined ? startCost[req.from] : undefined;
    const multi = req.row.footprint.w * req.row.footprint.h > 1;
    const beside = collectedBeside(req.row);
    // Bead bzc.95: an object a road may not cross. A footprint (placed
    // before the roads) leaves the towns a way round it (waysOpen); a single
    // cell (placed after them) keeps off them.
    const offRoad =
      oc.keepWaysOpen && roadMayCross({ kind: req.row.kind }) === "never";
    const corner = (e: number): number => {
      const x = g.x(e) - req.row.entrance[0];
      const y = g.y(e) - req.row.entrance[1];
      return g.inside(x, y) ? g.idx(x, y) : e;
    };
    for (const strict of [2, 1, 0]) {
      // Cheap checks and a score for every cell, then the full checks in
      // score order until one passes.
      const cand: Array<{ e: number; s: number }> = [];
      for (const e of cells) {
        if (req.pocket < 0 && (pocketOf[e] ?? -1) >= 0) continue;
        if (st.plaza[e] === 1 && !plazaFor(req)) continue;
        if (!free(e)) continue;
        if (
          req.ground !== undefined &&
          strict > 0 &&
          st.terrain[e] !== req.ground
        )
          continue;
        if (roads && (strict > 0 || beside || offRoad) && st.road[e] === 1)
          continue;
        if (strict > 0 && (crowd[e] ?? 0) >= strict) continue;
        if (costs) {
          const c = costs[e] ?? Infinity;
          if (!(c >= req.minCost && c <= req.maxCost)) continue;
        }
        if (req.minFar > 0) {
          const far = roadLow.every(
            (c, k) => k === req.except || (c[e] ?? Infinity) >= req.minFar,
          );
          if (!far) continue;
        }
        // Nooks first for footprints; pickups taken from beside them well
        // into side pockets and against walls; the rest a little off the
        // open floor.
        let nook = 0;
        for (const j of g.around(corner(e), N8)) if (!isWalkable(st, j)) nook++;
        const s =
          (multi
            ? Math.min(nook, 4)
            : beside
              ? Math.min(nook, 5) * 0.8
              : Math.min(nook, 3) * 0.5) + order.float(0, 3);
        cand.push({ e, s });
      }
      cand.sort((p, q) => q.s - p.s || p.e - q.e);
      let pick: { e: number; foot: number[]; gc: number } | undefined;
      for (const { e } of cand) {
        const foot = multi ? footprintOf(req.row, e) : [e];
        if (!foot) continue;
        let ok = true;
        for (const f of foot) {
          if (f === e) continue;
          if (
            !free(f) ||
            st.road[f] === 1 ||
            (strict > 0 && (crowd[f] ?? 0) >= strict) ||
            pocketOf[f] !== pocketOf[e] ||
            (st.plaza[f] === 1 && !plazaFor(req))
          ) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        if (!visitable(st, req.row, e, foot, free)) continue;
        // The guard (cheap) before the connectivity check (a flood).
        let gc = -1;
        if (req.guarded) {
          gc = guardCell(e, foot, beside, roads ? 2 : 0);
          if (gc < 0) continue;
        }
        if ((multi || beside) && !keepsConnected(st, e, foot, beside)) continue;
        if (offRoad && !roads && !waysOpen(e, foot)) continue;
        // Nor may it wall in a pickup next door.
        if (beside && !leavesSide(e)) continue;
        // A pocket's pickup is taken only from inside the pocket.
        if (
          beside &&
          req.pocket >= 0 &&
          g
            .around(e, N8)
            .some((k) => isWalkable(st, k) && pocketOf[k] !== req.pocket)
        )
          continue;
        pick = { e, foot, gc };
        break;
      }
      if (!pick) continue;
      const c = pick;
      const id = nextId(req.row.id);
      const obj: MapObject = {
        id,
        kind: req.row.kind,
        x: g.x(c.e),
        y: g.y(c.e),
        footprint: { ...req.row.footprint },
        blocked: c.foot
          .filter((f) => f !== c.e)
          .map((f) => [g.x(f), g.y(f)] as [number, number]),
        data: { ...req.data, value: req.value },
      };
      commit(st, obj);
      markCrowd(c.foot);
      if (roadMayCross(obj) === "never") entrances[c.e] = 1;
      shutVer++;
      // Later placements treat it as the wall it will be in play.
      if (beside) {
        st.objBlocked[c.e] = 1;
        besideCells.push(c.e);
      }
      if (req.pocket >= 0) {
        const p = pockets[req.pocket];
        if (p) {
          p.ids.push(id);
          p.value += req.value;
        }
      } else if (req.guarded) {
        st.occupied[c.gc] = 1;
        const force = req.data["guardCreature"];
        guardReqs.push({
          cell: c.gc,
          value: req.value,
          ringAt: c.e,
          guards: [id],
          ...(typeof force === "string" ? { force } : {}),
        });
      }
      return true;
    }
    return false;
  };

  const multi = (r: Request): boolean =>
    r.row.footprint.w * r.row.footprint.h > 1;
  /**
   * A required item that finds no site tries once more in a wider window:
   * the zones next door too, a third more time, and only half the distance
   * from the other starts (small maps have little room between them).
   */
  const stand: Request[] = [];
  const place = (r: Request, roads: boolean): void => {
    if (tryPlace(r, roads, r.order ?? rng)) return;
    // Its own stream, so the rest of the map draws as it would without.
    const again = { ...r, minFar: r.minFar * 0.5 };
    if (r.relax && tryPlace(again, roads, stageRng(st, "relax"))) return;
    // Bead bzc.96 (reserveRare): a rare big site of the wilds with no room
    // in its zone (a bank, a library, a drill yard) tries every other wild
    // zone where its row may stand before it gives way to a stand-in.
    if (
      oc.reserveRare &&
      !r.required &&
      r.pocket < 0 &&
      r.from === undefined &&
      r.row.footprint.w * r.row.footprint.h > 1 &&
      r.relax !== true &&
      r.rule !== true &&
      (counted(r) || r.row.kind === "bank" || r.row.perZone === 1)
    ) {
      const zones = st.zones
        .filter(
          (z) =>
            z.role !== "start" &&
            !r.zones.includes(z.id) &&
            (r.row.weights[z.role] ?? 0) > 0,
        )
        .map((z) => z.id);
      const wider = { ...r, zones };
      if (zones.length > 0 && tryPlace(wider, roads, stageRng(st, "rare")))
        return;
    }
    if (r.fallback !== undefined) {
      // The fill's single-cell stand-in, placed with the other single
      // cells after the roads.
      const { row, data } = r.fallback;
      const value = valueOf(row, data);
      const own = r.zones[0] ?? 0;
      stand.push({
        ...r,
        row,
        data,
        value,
        minFar: r.from !== undefined ? 0 : farFor(row, value, data),
        guarded: guardedIn(row, value, own, data),
        label: `${r.label} (stand-in ${row.id})`,
      });
      delete stand[stand.length - 1]?.fallback;
      return;
    }
    if (!r.required) {
      report.unplaced++;
      return;
    }
    const own = r.zones[0] ?? 0;
    const wider: Request = {
      ...r,
      zones: [...new Set([...r.zones, ...neighbours(own)])],
      minCost: r.minCost * 0.75,
      maxCost: r.maxCost * 1.35,
      minFar: r.minFar * 0.5,
    };
    if (tryPlace(wider, roads)) return;
    // Last resort: anywhere outside the Hold's zone, a little way out.
    const anywhere: Request = {
      ...wider,
      zones: st.zones.filter((z) => z.role !== "hold").map((z) => z.id),
      maxCost: Infinity,
      minFar: 0,
    };
    if (!tryPlace(anywhere, roads)) report.skipped.push(r.label);
  };
  // Bead bzc.96 (reserveRare): the kit, the rule sites and the rows a
  // map or zone holds once or twice (banks, libraries, drill yards) find
  // their room before the common fill crowds the zones; otherwise in the
  // order drawn.
  const early = (r: Request): boolean =>
    r.required || r.relax === true || r.rule === true || counted(r);
  const rank = (r: Request): number =>
    early(r) || r.pocket >= 0
      ? 0
      : r.row.kind === "bank" || r.row.perZone === 1
        ? 1
        : 2;
  const byRank = (list: Request[]): Request[] =>
    oc.reserveRare
      ? list
          .map((r, k) => ({ r, k }))
          .sort((a, b) => rank(a.r) - rank(b.r) || a.k - b.k)
          .map((x) => x.r)
      : list;
  // The plazas (gen/fields.ts reservePlazas) hold the rare big sites
  // while the footprints are placed: the kit and the common fill keep off
  // them till then.
  plazaFor = (r) => rank(r) <= 1 && !r.required;
  for (const r of byRank(requests.filter(multi))) {
    // The rare sites have had their turn: the plazas are free for all.
    if (rank(r) === 2) plazaFor = () => true;
    place(r, false);
  }
  plazaFor = () => true;
  // Bead bzc.95: with keepWaysOpen the roads keep off every entrance
  // placed so far (the footprints left a way round each), and the single
  // cells placed after them keep off the roads.
  buildRoads(
    st,
    guardReqs.map((q) => q.cell),
    oc.keepWaysOpen,
  );
  // Bead bzc.96 (reserveRare): the keymaster's tents of the border gates
  // to come are set down before the single-cell fill takes the room; a
  // tent no gate wants is taken up again below.
  const gateCount = [1, 1, 2][big] ?? 1;
  const keyRow = ruleRow("keymasters-tent");
  const tentRequest = (colour: string): Request | undefined =>
    keyRow === undefined
      ? undefined
      : {
          row: keyRow,
          data: { type: "keymasters-tent", colour },
          value: 0,
          zones: ruleZones.map((z) => z.id),
          minCost: 0,
          maxCost: Infinity,
          minFar: 0,
          required: false,
          pocket: -1,
          guarded: false,
          label: `keymaster's tent ${colour}`,
        };
  const reservedTents = new Map<string, MapObject>();
  if (oc.reserveRare) {
    for (let k = 0; k < gateCount; k++) {
      const colour = GATE_COLOURS[k % GATE_COLOURS.length] ?? "red";
      const tent = tentRequest(colour);
      if (tent === undefined || !tryPlace(tent, true)) continue;
      const placed = st.objects[st.objects.length - 1];
      if (placed !== undefined) reservedTents.set(colour, placed);
    }
  }
  const singles = [...requests.filter((q) => !multi(q)), ...stand];
  for (const r of oc.reserveRare
    ? [...singles.filter(early), ...singles.filter((q) => !early(q))]
    : singles) {
    place(r, true);
  }
  // A waystone whose twin found no site would lead nowhere: drop it.
  const pairCount = new Map<string, number>();
  for (const o of st.objects) {
    if (o.data["type"] !== "two-way-waystone") continue;
    const p = String(o.data["pair"]);
    pairCount.set(p, (pairCount.get(p) ?? 0) + 1);
  }
  st.objects = st.objects.filter(
    (o) =>
      o.data["type"] !== "two-way-waystone" ||
      pairCount.get(String(o.data["pair"])) === 2,
  );

  // A pickup is gone once taken: guards close passes and rings are
  // measured without it.
  for (const i of besideCells) st.objBlocked[i] = 0;

  // 4. Guards.
  const grng = stageRng(st, "guards");
  for (const p of pockets) {
    if (p.ids.length === 0) {
      st.occupied[p.cell] = 0;
      continue;
    }
    guardReqs.push({
      cell: p.cell,
      value: p.value,
      ringAt: p.cell,
      guards: p.ids,
    });
  }
  for (const p of st.passes) {
    p.cell = chokeCell(st, p);
    if ((st.occupied[p.cell] ?? 0) || nearTown(p.cell, oc.guardTownClearance)) {
      continue;
    }
    const za = st.zones[p.a];
    const zb = st.zones[p.b];
    if (!za || !zb) continue;
    const beyond = za.tier > zb.tier ? za : zb;
    const sameTier = za.tier === zb.tier;
    const wild = (r: string): boolean => r === "middle" || r === "town";
    if (sameTier && wild(za.role) && wild(zb.role)) {
      if (grng.chance(cfg.guards.openPassChance)) {
        // A loop left open may hold a border or quest gate (3.7): the
        // other way round stays open, so nothing is cut off.
        gateSites.push(p.cell);
        continue;
      }
    }
    const tier =
      beyond.role === "hold"
        ? PASS_VALUE.length - 1
        : Math.min(Math.max(1, beyond.tier), PASS_VALUE.length - 2);
    st.occupied[p.cell] = 1;
    guardReqs.push({
      cell: p.cell,
      value: PASS_VALUE[tier] ?? 0,
      ringAt: p.cell,
      guards: [],
      pass: true,
    });
  }
  // Gates on open loops: border gates (keys in tents) and quest gates.
  if (gateSites.length <= gateCount) {
    // Few open loops between zones (small maps): one-cell gaps in the room
    // walls of wild zones that close the way there but cut nothing off (a
    // longer way goes round) take the rest, so every map size has its
    // gates.
    const home = homeCell(st);
    const open = reachable(st, home);
    let total = 0;
    for (let i = 0; i < g.n; i++) total += open[i] ?? 0;
    for (const gap of st.gaps) {
      if (gateSites.length > gateCount) break;
      const role = st.zones[gap.zone]?.role;
      if (role !== "middle" && role !== "town") continue;
      const c = gap.cell;
      if (gap.width !== 1 || !isWalkable(st, c) || (st.occupied[c] ?? 0))
        continue;
      if ((pocketOf[c] ?? -1) >= 0 || nearTown(c, oc.guardTownClearance))
        continue;
      if (gateSites.some((s) => g.cheb(s, c) < 6)) continue;
      // A real choke: no way round it close by.
      if (keepsConnected(st, c, [c], true)) continue;
      const shut = reachable(st, home, (k) => k !== c && isWalkable(st, k));
      let n = 0;
      for (let i = 0; i < g.n; i++) n += shut[i] ?? 0;
      if (n === total - 1) gateSites.push(c);
    }
  }
  // A map with one site has a border gate or a quest gate, seeded.
  const loneQuest = gateSites.length === 1 && stageRng(st, "gates").chance(0.5);
  gateSites.forEach((cell, k) => {
    if (k > gateCount) return;
    if ((st.occupied[cell] ?? 0) || nearTown(cell, oc.guardTownClearance))
      return;
    const quest = k === gateCount || loneQuest;
    const colour = GATE_COLOURS[k % GATE_COLOURS.length] ?? "red";
    if (!quest && keyRow !== undefined) {
      // The tent first: no tent, no gate. A tent set down early is used.
      const reserved = reservedTents.get(colour);
      if (reserved !== undefined) reservedTents.delete(colour);
      else {
        const tent = tentRequest(colour);
        if (tent === undefined || !tryPlace(tent, true)) return;
      }
    }
    st.occupied[cell] = 1;
    commit(st, {
      id: nextId(quest ? "quest-gate" : "border-gate"),
      kind: "gate",
      x: g.x(cell),
      y: g.y(cell),
      footprint: { w: 1, h: 1 },
      blocked: [],
      data: quest
        ? { type: "quest-gate", value: 0 }
        : { type: "border-gate", colour, value: 0 },
    });
  });
  // Tents set down early that no border gate wanted are taken up again.
  for (const tent of reservedTents.values()) {
    st.objects = st.objects.filter((o) => o !== tent);
    const i = g.idx(tent.x, tent.y);
    st.occupied[i] = 0;
    entrances[i] = 0;
  }

  // Rings from the costs after roads (closer than before, never farther).
  const after = movementCost(
    st,
    starts.map((t) => t.cell),
  );
  const ringCost = (i: number): number => after[i] ?? Infinity;
  const grouped = new Map<string, { s: GuardStack; ring: number }>();
  for (const r of guardReqs) {
    const c = ringCost(r.ringAt);
    const first = r.group !== undefined ? grouped.get(r.group) : undefined;
    const ring = first?.ring ?? (Number.isFinite(c) ? ringOf(c) : 3);
    const s =
      first?.s ??
      sizeGuard(
        grng,
        r.value,
        ring,
        cfg.guards.jitter,
        cfg.guards.minFightValue,
        {
          terrain: TERRAIN_OF[st.terrain[r.cell] ?? 0] ?? "grass",
          ...(r.force !== undefined ? { force: r.force } : {}),
        },
      );
    if (r.group !== undefined && first === undefined)
      grouped.set(r.group, { s, ring });
    st.objects.push({
      id: nextId("monster"),
      kind: "monster",
      x: g.x(r.cell),
      y: g.y(r.cell),
      footprint: { w: 1, h: 1 },
      blocked: [],
      data: {
        creature: s.creature,
        count: s.count,
        fv: s.fv,
        ring,
        value: r.value,
        guards: r.guards,
        ...(r.pass ? { pass: true } : {}),
      },
    });
  }
  // Neutral town garrisons.
  for (const o of st.objects) {
    if (o.kind !== "town" || o.data["hold"] !== false) continue;
    const c = ringCost(g.idx(o.x, o.y));
    const ring = Number.isFinite(c) ? ringOf(c) : 3;
    const target = guardTarget(NEUTRAL_TOWN_VALUE, ring);
    o.data["garrison"] = garrisonFor(grng, target).map((s) => ({
      creature: s.creature,
      count: s.count,
    }));
    o.data["fv"] = Math.round(target);
  }
  // Quests name placed objects and guards (CONTENT_MAP_OBJECTS section 5).
  assignQuests(st, stageRng(st, "quests"));
  placeOneWayWaystones(st, {
    free: (i) =>
      free(i) &&
      (pocketOf[i] ?? -1) < 0 &&
      ringCost(i) >= oc.oneWayMinDays * day,
    roomy: (i) => (crowd[i] ?? 0) < 2,
    zoneCells,
    row: ruleRow("one-way-waystone"),
    nextId,
    markCrowd,
    ...(oc.keepWaysOpen ? { shut: entrances } : {}),
  });

  return report;
}

/**
 * One-way waystones (CONTENT_MAP_OBJECTS 3.9, a stretch type), placed last
 * from their own random stream so that nothing else on the map depends on
 * them (with none configured, the map is unchanged).
 *
 * Rules: the entrance and its exit lie in two different wild zones (middle
 * or neutral-town zones; never a start zone, the Hold's zone or a guarded
 * pocket); the exit's zone is no deeper (tier) than the entrance's, so a
 * waystone never skips a guard into richer land; both ends keep
 * `oneWayMinDays` from every start (no shortcut out of or into a home);
 * neither end touches a guard's zone of control, nor another object where
 * the zone has room (bead bzc.50: dense maps); the entrance is off the
 * roads and out of one-cell ways. A zone holds at most one entrance.
 */
function placeOneWayWaystones(
  st: GenState,
  ctx: {
    /** An open cell an end may use (pockets and starts checked). */
    free: (i: number) => boolean;
    /** Not next to another object (preferred where the zone has room). */
    roomy: (i: number) => boolean;
    zoneCells: readonly number[][];
    row: MapObjectRow | undefined;
    nextId: (prefix: string) => string;
    markCrowd: (cells: readonly number[]) => void;
    /** Entrances shut for the one-cell-way check (bead bzc.95). */
    shut?: Uint8Array;
  },
): void {
  const { g, cfg } = st;
  const count = cfg.objects.oneWayWaystones[st.size] ?? 0;
  if (count <= 0 || ctx.row === undefined) return;
  const rng = stageRng(st, "one-way");
  // Guards' zones of control (the 3x3 round each stack).
  const zoc = new Uint8Array(g.n);
  for (const o of st.objects) {
    if (o.kind !== "monster") continue;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (g.inside(o.x + dx, o.y + dy)) zoc[g.idx(o.x + dx, o.y + dy)] = 1;
      }
    }
  }
  const ok = (i: number): boolean => zoc[i] === 0 && ctx.free(i);
  /** Cells next to no other object if there are any, else all of them. */
  const roomiest = (cells: number[]): number[] => {
    const roomy = cells.filter(ctx.roomy);
    return roomy.length > 0 ? roomy : cells;
  };
  const wild = st.zones.filter((z) => z.role === "middle" || z.role === "town");
  const order = rng.shuffle(wild.map((z) => z.id));
  let placed = 0;
  for (const a of order) {
    if (placed >= count) break;
    const za = st.zones[a];
    if (za === undefined) continue;
    // Stepping on the entrance sends a hero away, so it never stands in
    // a one-cell way (another way goes round it close by).
    const entrances = roomiest(
      (ctx.zoneCells[a] ?? []).filter(
        (i) =>
          ok(i) &&
          st.road[i] === 0 &&
          keepsConnected(st, i, [i], true, ctx.shut),
      ),
    );
    if (entrances.length === 0) continue;
    const exitZones = rng.shuffle(
      wild.filter((z) => z.id !== a && z.tier <= za.tier).map((z) => z.id),
    );
    let exit = -1;
    for (const b of exitZones) {
      const cells = roomiest((ctx.zoneCells[b] ?? []).filter(ok));
      if (cells.length > 0) {
        exit = rng.pick(cells);
        break;
      }
    }
    if (exit < 0) continue;
    const e = rng.pick(entrances);
    st.objects.push({
      id: ctx.nextId(ctx.row.id),
      kind: ctx.row.kind,
      x: g.x(e),
      y: g.y(e),
      footprint: { w: 1, h: 1 },
      blocked: [],
      data: {
        ...ctx.row.data,
        type: ctx.row.type,
        exit: [g.x(exit), g.y(exit)],
        value: 0,
      },
    });
    st.occupied[e] = 1;
    if (ctx.shut) ctx.shut[e] = 1;
    // The exit is an ordinary cell, but nothing may stand on it.
    st.occupied[exit] = 1;
    ctx.markCrowd([e, exit]);
    placed++;
  }
}

/**
 * The corridor cell where one stack closes the pass: with its zone of
 * control (the 3x3 round it) shut, no way leads through a window of a few
 * cells round it from zone a's side (the window's rim in zone a) to zone
 * b's side. The carved seam first, then the nearest that works; the seam
 * when none does.
 */
function chokeCell(st: GenState, p: PassInfo): number {
  const { g } = st;
  const R = 5;
  const cand = p.cells
    .filter((c) => isWalkable(st, c) && st.occupied[c] === 0)
    .sort((a, b) => g.dist(a, p.cell) - g.dist(b, p.cell) || a - b);
  for (const c of cand) {
    const cx = g.x(c);
    const cy = g.y(c);
    const open = (x: number, y: number): boolean =>
      Math.abs(x - cx) <= R &&
      Math.abs(y - cy) <= R &&
      g.inside(x, y) &&
      isWalkable(st, g.idx(x, y)) &&
      !(Math.abs(x - cx) <= 1 && Math.abs(y - cy) <= 1);
    const seen = new Uint8Array(g.n);
    const stack: number[] = [];
    for (let y = cy - R; y <= cy + R; y++) {
      for (let x = cx - R; x <= cx + R; x++) {
        const rim = Math.max(Math.abs(x - cx), Math.abs(y - cy)) === R;
        if (rim && open(x, y) && st.zone[g.idx(x, y)] === p.a) {
          seen[g.idx(x, y)] = 1;
          stack.push(g.idx(x, y));
        }
      }
    }
    let crossed = false;
    while (stack.length > 0 && !crossed) {
      const i = stack.pop() as number;
      const x = g.x(i);
      const y = g.y(i);
      for (const [dx, dy] of N8) {
        const nx = x + dx;
        const ny = y + dy;
        if (!open(nx, ny)) continue;
        const j = g.idx(nx, ny);
        if (seen[j] === 1) continue;
        if (
          dx !== 0 &&
          dy !== 0 &&
          !isWalkable(st, g.idx(x + dx, y)) &&
          !isWalkable(st, g.idx(x, y + dy))
        )
          continue;
        const rim = Math.max(Math.abs(nx - cx), Math.abs(ny - cy)) === R;
        if (rim && st.zone[j] === p.b) crossed = true;
        seen[j] = 1;
        stack.push(j);
      }
    }
    if (!crossed) return c;
  }
  return p.cell;
}

/**
 * A hero can step onto the entrance from at least two free cells outside
 * the footprint ("front": from the row below the entrance).
 */
function visitable(
  st: GenState,
  row: MapObjectRow,
  e: number,
  foot: readonly number[],
  free: (i: number) => boolean,
): boolean {
  const { g } = st;
  // One of them at least by a step the footprint does not wall off (bead
  // bzc.95: a diagonal past the footprint and a wood cell is no way in;
  // with keepWaysOpen, as the named maps were placed without the check).
  const corners = st.cfg.objects.keepWaysOpen;
  const walk = (k: number): boolean => !foot.includes(k) && isWalkable(st, k);
  let n = 0;
  let stepIn = !corners;
  for (const j of g.around(e, N8)) {
    if (foot.includes(j)) continue;
    if (row.visit === "front" && g.y(j) <= g.y(e)) continue;
    if (!(free(j) || (isWalkable(st, j) && st.road[j] === 1))) continue;
    n++;
    if (canStep(st, j, g.x(e) - g.x(j), g.y(e) - g.y(j), walk)) stepIn = true;
  }
  return n >= 2 && stepIn;
}

/**
 * Whether blocking the footprint's non-entrance cells (all of them, the
 * entrance too, with `blockEntrance`: a pickup taken from beside it) keeps
 * every walkable cell round it connected (within a small window, which is
 * enough for the whole map: any path through the footprint can go round it
 * there).
 */
function keepsConnected(
  st: GenState,
  e: number,
  foot: readonly number[],
  blockEntrance = false,
  /** Cells that count as blocked too (bead bzc.95: other entrances). */
  shut?: Uint8Array,
): boolean {
  const { g } = st;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const f of foot) {
    x0 = Math.min(x0, g.x(f));
    y0 = Math.min(y0, g.y(f));
    x1 = Math.max(x1, g.x(f));
    y1 = Math.max(y1, g.y(f));
  }
  x0 = Math.max(0, x0 - 2);
  y0 = Math.max(0, y0 - 2);
  x1 = Math.min(g.w - 1, x1 + 2);
  y1 = Math.min(g.h - 1, y1 + 2);
  const blocked = new Set(foot.filter((f) => blockEntrance || f !== e));
  /** Open ground (entrances are open: a diagonal past one is a step). */
  const open = (k: number): boolean => !blocked.has(k) && isWalkable(st, k);
  const walk = (k: number): boolean => open(k) && shut?.[k] !== 1;
  const inside = (k: number): boolean =>
    g.x(k) >= x0 && g.x(k) <= x1 && g.y(k) >= y0 && g.y(k) <= y1;
  // Cells next to the footprint that must stay joined, and the shut
  // entrances next to it, which must each keep a way in.
  const ring: number[] = [];
  const doors: number[] = [];
  for (const f of foot) {
    for (const j of g.around(f, N8)) {
      if (walk(j) && !ring.includes(j)) ring.push(j);
      else if (open(j) && !doors.includes(j)) doors.push(j);
    }
  }
  const start = ring[0];
  if (start === undefined) return false;
  const seen = new Set<number>([start]);
  const stack = [start];
  while (stack.length > 0) {
    const i = stack.pop() as number;
    for (const [dx, dy] of N8) {
      const nx = g.x(i) + dx;
      const ny = g.y(i) + dy;
      if (!g.inside(nx, ny)) continue;
      const j = g.idx(nx, ny);
      if (seen.has(j) || !inside(j) || !walk(j)) continue;
      if (!canStep(st, i, dx, dy, shut ? open : walk)) continue;
      seen.add(j);
      stack.push(j);
    }
  }
  return (
    ring.every((j) => seen.has(j)) &&
    doors.every((d) =>
      g
        .around(d, N8)
        .some(
          (j) =>
            seen.has(j) &&
            canStep(st, j, g.x(d) - g.x(j), g.y(d) - g.y(j), open),
        ),
    )
  );
}

/**
 * Dead-end rooms: for each room gap, the open ground that only that gap
 * reaches (with a guard standing in it, its zone of control closed). A
 * pocket must be big enough, lie in one zone that is not a start zone, and
 * hold no town and no other pocket's gap.
 */
function findPockets(
  st: GenState,
  reach: Uint8Array,
  pocketOf: Int32Array,
  nearTown: (i: number, r: number) => boolean,
): Pocket[] {
  const { g, cfg } = st;
  const out: Pocket[] = [];
  const home = homeCell(st);
  const corridor = new Uint8Array(g.n);
  for (const p of st.passes) for (const c of p.cells) corridor[c] = 1;
  const perZone = new Map<number, number>();
  for (const gap of st.gaps) {
    const z = st.zones[gap.zone];
    if (!z || z.role === "start") continue;
    if ((perZone.get(z.id) ?? 0) >= cfg.objects.pocketsPerZone) continue;
    const c = gap.cell;
    if (!isWalkable(st, c) || (st.occupied[c] ?? 0) || (pocketOf[c] ?? 0) >= 0)
      continue;
    if (nearTown(c, cfg.objects.guardTownClearance + 1)) continue;
    const zoc = new Set<number>([c, ...g.around(c, N8)]);
    const r = reachable(st, home, (k) => !zoc.has(k) && isWalkable(st, k));
    const cells: number[] = [];
    let ok = true;
    for (let i = 0; i < g.n && ok; i++) {
      if (!(reach[i] ?? 0) || (r[i] ?? 0) || zoc.has(i) || !isWalkable(st, i))
        continue;
      if (
        (st.zone[i] ?? 0) !== gap.zone ||
        (corridor[i] ?? 0) ||
        (pocketOf[i] ?? 0) >= 0 ||
        (st.occupied[i] ?? 0)
      ) {
        ok = false;
      }
      cells.push(i);
    }
    if (!ok || cells.length < cfg.objects.pocketMin) continue;
    // Several gaps can lead into a pocket only through this one.
    for (const i of cells) pocketOf[i] = out.length;
    out.push({ zone: gap.zone, cell: c, cells, ids: [], value: 0 });
    perZone.set(z.id, (perZone.get(z.id) ?? 0) + 1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Roads

/** Extra road cost of a cell in a guard's zone of control. */
const GUARD_ROAD_PENALTY = 400;
/**
 * Extra road cost of a resource pile (bead bzc.95): a road runs over one
 * only where going round it is long, so a pile sometimes lies on a road.
 */
const PICKUP_ROAD_PENALTY = 600;
/**
 * Extra road cost of any other object's entrance when no road round it
 * exists at all (a last resort; the map tests expect it never to be used).
 */
const SITE_ROAD_FALLBACK = 20_000;
/** Longest bend that joins a road back round an entrance (relayRoads). */
const STUB_JOIN = 6;

/**
 * How the final roads treat an object's entrance (bead bzc.95: getting
 * from A to B by road never makes a hero enter anything). Towns are the
 * roads' ends and a hero start is only where a hero stands; guards and
 * gates hold a way and resource piles are picked up in passing, so a road
 * may sometimes cross them; every other object (mines, dwellings, shrines,
 * wells, banks, waystones, buried treasure, chests and loose artifacts)
 * stays off the road.
 */
export function roadMayCross(
  o: Pick<MapObject, "kind">,
): "free" | "guard" | "pickup" | "never" {
  switch (o.kind) {
    case "town":
    case "hero-start":
      return "free";
    case "monster":
    case "gate":
      return "guard";
    case "pickup":
      return "pickup";
    default:
      return "never";
  }
}

/**
 * Roads join every town: from the first player's town outwards, each town
 * (nearest first) runs a road to the network so far, sharing it where it
 * can, and round the zones of control of the `guards` placed so far where
 * it can (bead bzc.50). Then short spurs to the mines.
 *
 * With `clear` (bead bzc.95) every placed object counts: roads go round
 * every entrance {@link roadMayCross} keeps them off, and a mine's spur
 * stops at the cell before its entrance.
 */
function buildRoads(
  st: GenState,
  guards: readonly number[] = [],
  clear = false,
): void {
  const { g } = st;
  const { costs, ways } = roadRules(st, guards, clear);
  const mark = (path: number[] | undefined, from = 0): void => {
    if (path) for (const i of path.slice(from)) st.road[i] = 1;
  };
  const home = homeCell(st);
  if (home < 0) return;
  st.road[home] = 1;
  const towns = st.towns
    .map((t) => t.cell)
    .filter((c) => c !== home)
    .sort((a, b) => (st.cost[a] ?? 0) - (st.cost[b] ?? 0) || a - b);
  const onRoad = (i: number): boolean => st.road[i] === 1;
  for (const t of towns) {
    mark(
      roadPath(st, [t], onRoad, costs) ??
        (ways ? ways.fallback([t], onRoad) : undefined),
    );
  }
  const mines = st.objects
    .filter((o) => o.kind === "mine")
    .map((o) => g.idx(o.x, o.y))
    .sort((a, b) => (st.cost[a] ?? 0) - (st.cost[b] ?? 0) || a - b);
  for (const e of mines) {
    const path = roadPath(st, [e], onRoad, costs, st.cfg.roads.maxSpur);
    // The final spur leads up to the mine's door, not onto it.
    mark(path, clear ? 1 : 0);
  }
}

/**
 * Road costs, dearer in the zones of control of the `guards`, with the
 * rules of bead bzc.95 when `clear`.
 */
function roadRules(
  st: GenState,
  guards: readonly number[],
  clear: boolean,
): { costs: RoadCosts; ways: ReturnType<typeof clearWays> | undefined } {
  const { g } = st;
  const wobble = noiseField(g, 4, stageSalt(st, "road-wobble"), 2);
  const costs = roadCosts(st, wobble);
  const zoc = new Set<number>();
  for (const c of guards) for (const j of [c, ...g.around(c, N8)]) zoc.add(j);
  for (const j of zoc)
    costs.enter[j] = (costs.enter[j] ?? 0) + GUARD_ROAD_PENALTY;
  const ways = clear ? clearWays(st, costs) : undefined;
  return { costs, ways };
}

/**
 * Mends a finished map's roads (bead bzc.95): a named map keeps its roads
 * as authored, but no road may run over an entrance {@link roadMayCross}
 * keeps them off (some stood on the authored roads, and the edits add
 * more). Those cells lose their road, and each piece of road that splits
 * off is joined back by a short bend round the entrance. Writes the roads
 * back into `map.cells`.
 */
export function relayRoads(map: GameMap, cfg: GenConfig, size: MapSize): void {
  const startsOf = map.objects
    .filter((o) => o.kind === "town" && typeof o.data["start"] === "number")
    .sort((a, b) => Number(a.data["start"]) - Number(b.data["start"]));
  const players = Math.min(4, Math.max(2, startsOf.length)) as PlayerCount;
  const st = newState(
    map.seed | 0,
    size,
    players,
    players,
    cfg,
    map.width,
    map.height,
  );
  const { g } = st;
  map.cells.forEach((c, i) => {
    st.terrain[i] = T[c.terrain];
    st.obstacle[i] =
      c.obstacle === "mountain"
        ? O.mountain
        : c.obstacle === "forest"
          ? O.forest
          : O.none;
  });
  for (const o of map.objects) commit(st, o);
  const towns = map.objects.filter((o) => o.kind === "town");
  for (const t of [...startsOf, ...towns.filter((o) => !startsOf.includes(o))])
    st.towns.push({ cell: g.idx(t.x, t.y), zone: 0, role: "neutral" });
  /** Connected road pieces (8-way), as a label per cell and the cells. */
  const label = (): { part: Int32Array; pieces: number[][] } => {
    const part = new Int32Array(g.n).fill(-1);
    const pieces: number[][] = [];
    for (let s = 0; s < g.n; s++) {
      if (st.road[s] !== 1 || part[s] !== -1) continue;
      const cells = [s];
      part[s] = pieces.length;
      for (let k = 0; k < cells.length; k++) {
        for (const j of g.around(cells[k] ?? 0, N8)) {
          if (st.road[j] !== 1 || part[j] !== -1) continue;
          part[j] = pieces.length;
          cells.push(j);
        }
      }
      pieces.push(cells);
    }
    return { part, pieces };
  };
  map.cells.forEach((c, i) => {
    st.road[i] = c.road ? 1 : 0;
  });
  // The networks as authored (an edit may have closed a road on purpose).
  const net = label().part;
  const cut = new Uint8Array(g.n);
  for (const o of map.objects) {
    if (roadMayCross(o) !== "never") continue;
    for (const [x, y] of [[o.x, o.y] as const, ...o.blocked]) {
      const i = g.idx(x, y);
      if (st.road[i] === 1) cut[i] = 1;
      st.road[i] = 0;
    }
  }
  // The bend goes the short way, through a zone of control as the road
  // it mends did.
  const { costs, ways } = roadRules(st, [], true);
  // Each run of cut cells joined pieces of road: join them again by a
  // short bend round it (only them, so no new short cut appears).
  const rims: number[][] = [];
  const seen = new Uint8Array(g.n);
  for (let s = 0; s < g.n; s++) {
    if (cut[s] !== 1 || seen[s] === 1) continue;
    const run = [s];
    seen[s] = 1;
    for (let k = 0; k < run.length; k++) {
      for (const j of g.around(run[k] ?? 0, N8)) {
        if (cut[j] !== 1 || seen[j] === 1) continue;
        seen[j] = 1;
        run.push(j);
      }
    }
    const rim = new Set<number>();
    for (const i of run)
      for (const j of g.around(i, N8)) if (cut[j] !== 1) rim.add(j);
    rims.push([...rim].sort((a, b) => a - b));
  }
  const done = new Set<number>();
  for (let round = 0; round < 1024; round++) {
    const { part } = label();
    const k = rims.findIndex((rim, r) => {
      if (done.has(r)) return false;
      return (
        new Set(rim.filter((i) => st.road[i] === 1).map((i) => part[i])).size >
        1
      );
    });
    if (k < 0) break;
    const rim = (rims[k] ?? []).filter((i) => st.road[i] === 1);
    const first = part[rim[0] ?? 0];
    const from = rim.filter((i) => part[i] === first);
    const path = roadPath(
      st,
      from,
      (i) => part[i] !== first && rim.includes(i),
      costs,
      STUB_JOIN,
    );
    if (path) for (const i of path) st.road[i] = 1;
    else done.add(k);
  }
  // A town whose road no bend rejoined joins its network's first town by
  // any way round (the shipped maps' edits leave none: named.test.ts).
  const towns0 = st.towns.map((t) => t.cell);
  for (const t of towns0) {
    const { part } = label();
    const head = towns0.find((u) => net[u] === net[t]);
    if (head === undefined || part[head] === part[t]) continue;
    const own = part[t];
    const from = [...part.keys()].filter((i) => part[i] === own);
    const goal = (i: number): boolean => part[i] === part[head];
    const path = roadPath(st, from, goal, costs) ?? ways?.fallback(from, goal);
    if (path) for (const i of path) st.road[i] = 1;
  }
  // A scrap of road a cut left alone (a cell or two leading nowhere) goes.
  for (const piece of label().pieces)
    if (piece.length <= 2 && !piece.some((i) => towns0.includes(i)))
      for (const i of piece) st.road[i] = 0;
  map.cells.forEach((c, i) => {
    c.road = st.road[i] === 1;
  });
}

/**
 * The final roads' rules (bead bzc.95), applied to `costs` in place: every
 * entrance {@link roadMayCross} keeps off the road is refused; resource
 * piles and gates cost extra. Returns the last resort for a town no road
 * reaches under them, a road over the fewest entrances (the generator's
 * placement leaves a way round every one, so the map tests expect it
 * never to be used).
 */
function clearWays(
  st: GenState,
  costs: RoadCosts,
): {
  fallback: (
    from: readonly number[],
    onRoad: (i: number) => boolean,
  ) => number[] | undefined;
} {
  const { g } = st;
  const soft: RoadCosts = { walk: costs.walk, enter: costs.enter.slice() };
  for (const o of st.objects) {
    const e = g.idx(o.x, o.y);
    const rule = roadMayCross(o);
    const extra =
      rule === "never"
        ? SITE_ROAD_FALLBACK
        : rule === "pickup"
          ? PICKUP_ROAD_PENALTY
          : o.kind === "gate"
            ? GUARD_ROAD_PENALTY
            : 0;
    soft.enter[e] = (soft.enter[e] ?? 0) + extra;
    costs.enter[e] = rule === "never" ? Infinity : (soft.enter[e] ?? 0);
  }
  return { fallback: (from, onRoad) => roadPath(st, from, onRoad, soft) };
}
