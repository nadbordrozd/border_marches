/**
 * The seas of a naval map (docs/design/NAVAL.md 8.2-8.6, bead bzc.155),
 * after the land objects:
 *
 * 1. **Sea zones**: each sea (a water body of `seaMin` cells or more) is
 *    split into organic regions grown from far-apart seeds, with a tier
 *    like a land zone's (one more than the land it touches, one more per
 *    strait; the Hold's waters are the deepest).
 * 2. **Straits**: two neighbouring sea zones are parted by a reef of rock
 *    (mountains in 2x2 blocks, NAVAL's "rock islets") with one channel 1-3
 *    cells wide, and a sea guard in it sized by the zone it opens; the
 *    strait into the Hold's waters holds the strongest guard (Krakens
 *    where the ring allows). Each start's first strait holds the same
 *    guard as every other start's.
 * 3. **Landings**: every land zone with a coast keeps three or more landing
 *    cells (open shore, not an entrance, outside every land guard's zone
 *    of control); shore forest or rock is cleared where it seals no way
 *    round a guard.
 * 4. **Access** (8.4): Shipwrights (with their docks), moored boats, the
 *    Islands starts' built Shipyards and boats at their docks.
 * 5. **Rules and fill** (8.6): a Lighthouse per sea zone with a coast, the
 *    Kraken's Deep on L and XL, whirlpool and ferry pairs, then the fill
 *    (about 1.5 visitable objects per 100 sea cells) from the sea rows'
 *    weights with their seeded contents (gen/sea-contents.ts), and a guard
 *    for every object worth 1500 or more: a sea guard on a sea entrance's
 *    approach, a land guard beside a coastal one.
 *
 * Every draw comes from the sea's own streams ("sea-*"); Water None never
 * runs any of this.
 */
import { CREATURES } from "../../../data/creatures.ts";
import { PASS_VALUE } from "../../../data/mapObjects.ts";
import type { MapObjectRow } from "../../../data/mapObjects.ts";
import { SEA_ROWS } from "../../../data/mapObjects.ts";
import { BOAT_KIND } from "../../../data/naval.ts";
import { SEA_GUARD_IDS, SEA_HOMES } from "../../../data/sea.ts";
import { STRAY_CREATURES } from "../../../data/strays.ts";
import type { SeaObjectTypeId } from "../../../data/sea-objects.ts";
import { townDock } from "../../game/naval.ts";
import type { Rng } from "../../rng.ts";
import type { GameMap, MapObject } from "../types.ts";
import { decorationCells } from "../types.ts";
import { decorationKind } from "../../../data/decorations.ts";
import type { WaterMode } from "./config.ts";
import { inMountainBlock } from "./clusters.ts";
import { chamferDistance, components, N4, N8 } from "./grid.ts";
import { guardTarget, ringOf, sizeGuard } from "./guards.ts";
import type { GuardStack } from "./guards.ts";
import { commit } from "./objects.ts";
import { movementCost, reachable } from "./paths.ts";
import { seaBodies } from "./sea-water.ts";
import { seaContents } from "./sea-contents.ts";
import {
  O,
  T,
  TERRAIN_OF,
  corridorMask,
  homeCell,
  isWalkable,
  stageRng,
} from "./state.ts";
import type { GenState } from "./state.ts";

/** One sea zone (NAVAL 8.2). */
export interface SeaZoneInfo {
  id: number;
  /** Index of its sea (water body). */
  body: number;
  /** Number of sea cells. */
  cells: number;
  /** One more than the land it touches; the Hold's waters 3 or more. */
  tier: number;
  /** Land zones with a shore on it. */
  coast: number[];
  /** It washes the Hold's island. */
  hold: boolean;
}

/** A strait between two sea zones (NAVAL 8.2, 8.5). */
export interface StraitInfo {
  a: number;
  b: number;
  /** The guard's cell (in the channel). */
  cell: number;
  /** The channel's sea cells. */
  channel: number[];
  width: number;
  /** The guard's object id. */
  guard: string;
}

export interface SeaReport {
  mode: WaterMode;
  /** Seas on the map (water bodies of seaMin cells or more). */
  bodies: number;
  /** Their cells after the reefs. */
  seaCells: number;
  /** Share of the map under water (seas, lakes and ponds). */
  share: number;
  seaZones: SeaZoneInfo[];
  /** Sea zone of every cell (-1 off the seas). */
  seaZoneOf: Int32Array;
  straits: StraitInfo[];
  /** Landing cells per land zone with a coast (NAVAL 8.3). */
  landings: Record<number, number>;
  /** Each start town's dock cell (-1: landlocked), in player order. */
  docks: number[];
  /** Sea and coastal objects placed, by type. */
  placed: Record<string, number>;
  /** Sea guards placed (straits and objects). */
  seaGuards: number;
  /** Requests that found no site. */
  unplaced: number;
}

const ROW = new Map<string, MapObjectRow>(SEA_ROWS.map((r) => [r.type, r]));

function rowOf(type: SeaObjectTypeId): MapObjectRow {
  const row = ROW.get(type);
  if (row === undefined) throw new Error(`mapgen: no sea row ${type}`);
  return row;
}

/** The rule objects (placed by rule, never by the fill's weights). */
const COASTAL: ReadonlySet<string> = new Set([
  "fishing-village",
  "pirate-cove",
  "shipwright",
  "ferry-landing",
]);

/** The swimming strays that also guard seas (NAVAL 4.4). */
const STRAY_IDS: ReadonlySet<string> = new Set(Object.keys(STRAY_CREATURES));

/** Access objects are never guarded (a call of bead bzc.155). */
const UNGUARDED: ReadonlySet<string> = new Set([
  "shipwright",
  "moored-boat",
  "ferry-landing",
  "whirlpool",
]);

/**
 * A sea guard worth about `target` fight value: a sea creature of the
 * ring (SEA_HOMES) whose count falls between 5 and 50, else any that fits,
 * else the weakest or strongest (as `stackFor` on land).
 */
export function seaStackFor(
  rng: Rng,
  target: number,
  ring: number,
  force?: string,
): GuardStack {
  const roster = [...SEA_GUARD_IDS]
    .map((id) => ({ id, fv: CREATURES[id].fightValue }))
    .sort((a, b) => a.fv - b.fv);
  const fits = (c: { fv: number }): boolean => {
    const n = Math.round(target / c.fv);
    return n >= 5 && n <= 50;
  };
  const home = (id: (typeof SEA_GUARD_IDS)[number]): boolean => {
    const h = SEA_HOMES[id];
    return ring >= h.rings[0] && ring <= h.rings[1];
  };
  const forced = roster.find((c) => c.id === force);
  // The sea's own guardians first; the swimming strays now and then.
  const homed = roster.filter((c) => home(c.id) && fits(c));
  const own = homed.filter((c) => !STRAY_IDS.has(c.id));
  const local = own.length > 0 && rng.chance(0.8) ? own : homed;
  const any = roster.filter(fits);
  const pool =
    forced !== undefined
      ? [forced]
      : local.length > 0
        ? local
        : any.length > 0
          ? any
          : target < 5 * (roster[0]?.fv ?? 45)
            ? roster.slice(0, 1)
            : roster.slice(-1);
  const c = rng.pick(pool);
  const count = Math.max(1, Math.round(target / c.fv));
  return { creature: c.id, count, fv: count * c.fv };
}

/** Breadth-first steps (4-way) inside `inside` from the sources. */
function bfs(
  st: GenState,
  sources: readonly number[],
  inside: (i: number) => boolean,
): Int32Array {
  const { g } = st;
  const d = new Int32Array(g.n).fill(-1);
  const queue: number[] = [];
  for (const s of sources) {
    d[s] = 0;
    queue.push(s);
  }
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k] ?? 0;
    for (const j of g.around(i, N4)) {
      if ((d[j] ?? 0) !== -1 || !inside(j)) continue;
      d[j] = (d[i] ?? 0) + 1;
      queue.push(j);
    }
  }
  return d;
}

/** Landing cells set aside per coast before the land objects. */
const SET_ASIDE = 5;

/**
 * A zone with fewer shore cells than this has no coast link (NAVAL 8.3: a
 * coast of a few cells of cliff is no coast to land on).
 */
export const COAST_LINK = 8;

/**
 * Before the land objects (NAVAL 8.3, bead bzc.155): every land zone with a
 * coast gets up to {@link SET_ASIDE} spread landing cells, open shore the
 * objects and their guards leave alone (`st.landing`, marked occupied
 * until the sea stage). Where the shore is all forest or rock, a short way
 * (up to six cells) is cut to it from the zone's open ground.
 */
export function prepareShores(st: GenState): void {
  const { g, cfg } = st;
  const bodies = seaBodies(st);
  const sea = new Uint8Array(g.n);
  for (const b of bodies) for (const i of b) sea[i] = 1;
  const landing = new Uint8Array(g.n);
  st.landing = landing;
  if (bodies.length === 0) return;
  // Inland Sea and Islands: every start town keeps its way down to its
  // dock (the clean-up stages may have grown wood or rock across it).
  if (st.water === "inland" || st.water === "islands") {
    for (const t of st.towns) {
      if (t.role !== "player" && t.role !== "open-start") continue;
      const search = (
        offsets: typeof N8,
        depth: number,
      ): number[] | undefined => {
        const prev = new Map<number, number>([[t.cell, -1]]);
        let frontier = [t.cell];
        for (let d = 0; d < depth; d++) {
          const next: number[] = [];
          for (const k of frontier) {
            for (const j of g.around(k, offsets)) {
              if (prev.has(j) || (st.objBlocked[j] ?? 0) === 1) continue;
              prev.set(j, k);
              if (sea[j] === 1) {
                const way: number[] = [];
                for (let m = k; m >= 0 && m !== t.cell; m = prev.get(m) ?? -1)
                  way.push(m);
                return way.reverse();
              }
              if (st.terrain[j] !== T.water) next.push(j);
            }
          }
          frontier = next;
        }
        return undefined;
      };
      // Within four steps: clear the way. Farther: a 4-connected inlet of
      // the sea comes up to meet three steps of open ground from the door.
      const near = search(N8, 4);
      const way = near ?? search(N4, 10) ?? [];
      way.forEach((k, step) => {
        st.obstacle[k] = O.none;
        if (near === undefined && step >= 2) {
          st.terrain[k] = T.water;
          sea[k] = 1;
          if (st.seaPass !== undefined) st.seaPass[k] = 1;
        } else st.keepOpen[k] = 1;
      });
      for (const k of way) {
        for (const j of g.around(k, N8)) {
          if (st.obstacle[j] === O.mountain && !inMountainBlock(st, j))
            st.obstacle[j] = O.forest;
        }
      }
    }
  }
  const reach = reachable(st, homeCell(st));
  const corridor = corridorMask(st);
  const rng = stageRng(st, "sea-shores");
  const shore = (i: number): boolean =>
    st.terrain[i] !== T.water && g.around(i, N8).some((j) => sea[j] === 1);
  const nearTown = (i: number): boolean =>
    st.towns.some((t) => g.cheb(t.cell, i) <= cfg.objects.townClearance + 1);
  const open = (i: number): boolean =>
    shore(i) &&
    isWalkable(st, i) &&
    (reach[i] ?? 0) === 1 &&
    (st.occupied[i] ?? 0) === 0 &&
    (corridor[i] ?? 0) === 0 &&
    !nearTown(i);
  const byZone = new Map<number, number[]>();
  for (let i = 0; i < g.n; i++) {
    if (!shore(i)) continue;
    const z = st.zone[i] ?? 0;
    byZone.set(z, [...(byZone.get(z) ?? []), i]);
  }
  for (const z of [...byZone.keys()].sort((a, b) => a - b)) {
    const coast = byZone.get(z) ?? [];
    if (coast.length < COAST_LINK) continue;
    const picked: number[] = [];
    const spread = (i: number): boolean =>
      picked.every((p) => g.cheb(p, i) >= 4);
    for (const i of rng.shuffle(coast.filter(open))) {
      if (picked.length >= SET_ASIDE) break;
      if (spread(i)) picked.push(i);
    }
    // Cut ways to the shore while there are too few.
    for (
      let tries = 0;
      picked.length < cfg.sea.landingCells && tries < 8;
      tries++
    ) {
      const cuttable = (i: number): boolean =>
        (st.zone[i] ?? 0) === z &&
        st.terrain[i] !== T.water &&
        st.obstacle[i] !== O.none &&
        (st.spine[i] ?? 0) === 0 &&
        (corridor[i] ?? 0) === 0 &&
        (st.occupied[i] ?? 0) === 0;
      const prev = new Map<number, number>();
      let frontier: number[] = [];
      for (let i = 0; i < g.n; i++) {
        if (
          (st.zone[i] ?? 0) === z &&
          (reach[i] ?? 0) === 1 &&
          isWalkable(st, i)
        )
          frontier.push(i);
      }
      for (const i of frontier) prev.set(i, -1);
      const ends: number[] = [];
      for (let d = 0; d < 9 && ends.length === 0; d++) {
        const next: number[] = [];
        for (const i of frontier) {
          for (const j of g.around(i, N4)) {
            if (prev.has(j) || !cuttable(j)) continue;
            prev.set(j, i);
            next.push(j);
            if (shore(j) && !nearTown(j) && spread(j)) ends.push(j);
          }
        }
        frontier = next;
      }
      if (ends.length === 0) break;
      const end = rng.pick(ends.sort((a, b) => a - b));
      for (let k = end; k >= 0 && prev.get(k) !== -1; k = prev.get(k) ?? -1) {
        st.obstacle[k] = O.none;
        st.keepOpen[k] = 1;
        reach[k] = 1;
      }
      // Rock left without its 2x2 block turns to wood (bead xaj.20).
      for (let i = 0; i < g.n; i++) {
        if (st.obstacle[i] === O.mountain && g.cheb(i, end) <= 8) {
          if (!inMountainBlock(st, i)) st.obstacle[i] = O.forest;
        }
      }
      picked.push(end);
    }
    for (const i of picked) {
      landing[i] = 1;
      st.keepOpen[i] = 1;
      st.occupied[i] = 1;
      // Its neighbours too, so no guard stands beside it (2: a neighbour).
      for (const j of g.around(i, N8)) {
        if (landing[j] === 0 && (st.occupied[j] ?? 0) === 0) {
          landing[j] = 2;
          st.occupied[j] = 1;
        }
      }
    }
  }
}

export function placeSea(st: GenState): SeaReport {
  const { g, cfg } = st;
  const sc = cfg.sea;
  const mode = st.water;
  const report: SeaReport = {
    mode,
    bodies: 0,
    seaCells: 0,
    share: 0,
    seaZones: [],
    seaZoneOf: new Int32Array(g.n).fill(-1),
    straits: [],
    landings: {},
    docks: [],
    placed: {},
    seaGuards: 0,
    unplaced: 0,
  };
  if (mode === "none") return report;
  // The landings set aside before the land objects are free again.
  if (st.landing !== undefined) {
    for (let i = 0; i < g.n; i++) if (st.landing[i] !== 0) st.occupied[i] = 0;
  }
  const mc = sc[mode];
  const bodies = seaBodies(st);
  report.bodies = bodies.length;
  if (bodies.length === 0) return report;
  const zoneOf = report.seaZoneOf;
  const isSea = (i: number): boolean =>
    (zoneOf[i] ?? -1) >= 0 && st.terrain[i] === T.water;

  // 1. Sea zones: far-apart seeds in each sea, grown breadth-first.
  const zrng = stageRng(st, "sea-zones");
  const totalSea = bodies.reduce((n, b) => n + b.length, 0);
  const [zlo, zhi] = mc.seaZones[st.size];
  const want = zrng.int(zlo, zhi);
  const zones: SeaZoneInfo[] = [];
  const holdZone = st.zones.find((z) => z.role === "hold")?.id ?? -1;
  const newZone = (b: number): number => {
    zones.push({
      id: zones.length,
      body: b,
      cells: 0,
      tier: Infinity,
      coast: [],
      hold: false,
    });
    return zones.length - 1;
  };
  /** Grow labelled cells breadth-first over `inside` (first come, first served). */
  const grow = (from: readonly number[], inside: (i: number) => boolean) => {
    const queue = [...from];
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q] ?? 0;
      for (const j of g.around(i, N4)) {
        if (!inside(j) || (zoneOf[j] ?? -1) >= 0) continue;
        zoneOf[j] = zoneOf[i] ?? -1;
        queue.push(j);
      }
    }
  };
  bodies.forEach((body, b) => {
    const inBody = new Uint8Array(g.n);
    for (const i of body) inBody[i] = 1;
    // Islands: the Hold's moat (its zone's water) is a sea zone of its own,
    // behind the strongest straits (NAVAL 8.5).
    const moat =
      mode === "islands"
        ? body.filter((i) => (st.zone[i] ?? 0) === holdZone)
        : [];
    const labelled: number[] = [];
    if (moat.length >= 20) {
      const id = newZone(b);
      for (const i of moat) {
        zoneOf[i] = id;
        labelled.push(i);
      }
    }
    const open = body.filter((i) => (zoneOf[i] ?? -1) < 0);
    const inside = (i: number): boolean =>
      inBody[i] === 1 && (zoneOf[i] ?? -1) < 0;
    const share =
      mode === "coast" ? want : Math.round((want * body.length) / totalSea);
    const k = Math.max(
      1,
      Math.min(
        share - (labelled.length > 0 ? 1 : 0),
        Math.floor(open.length / 150),
      ),
    );
    let far = bfs(st, open.length > 0 ? [zrng.pick(open)] : [], inside);
    const seeds: number[] = [];
    for (let s = 0; s < k && open.length > 0; s++) {
      let best = open[0] ?? 0;
      for (const i of open) {
        if ((far[i] ?? 0) > (far[best] ?? 0)) best = i;
      }
      if (seeds.includes(best)) break;
      seeds.push(best);
      const d = bfs(st, [best], inside);
      if (s === 0) far = d;
      else for (const i of open) far[i] = Math.min(far[i] ?? 0, d[i] ?? 0);
    }
    // Grow every seed at once (a cell goes to the first to reach it); water
    // the seeds cannot reach joins whatever zone is beside it.
    for (const s of seeds) zoneOf[s] = newZone(b);
    grow(seeds, inside);
    grow(
      body.filter((i) => (zoneOf[i] ?? -1) >= 0),
      (i) => inBody[i] === 1,
    );
  });
  // The waters off each start town belong to one sea zone, so no reef
  // takes a start's dock; a zone split by that keeps its largest piece.
  const startTowns = st.towns.filter(
    (t) => t.role === "player" || t.role === "open-start",
  );
  for (const t of startTowns) {
    let dock = -1;
    for (let i = 0; i < g.n; i++) {
      if ((zoneOf[i] ?? -1) < 0) continue;
      if (dock < 0 || g.dist(i, t.cell) < g.dist(dock, t.cell)) dock = i;
    }
    if (dock < 0 || g.dist(dock, t.cell) > 6) continue;
    const own = zoneOf[dock] ?? -1;
    for (let i = 0; i < g.n; i++) {
      if ((zoneOf[i] ?? -1) >= 0 && g.dist(i, t.cell) <= 8) zoneOf[i] = own;
    }
  }
  for (const z of zones) {
    const parts = components(g, (i) => (zoneOf[i] ?? -1) === z.id, 4);
    let keep = 0;
    parts.sizes.forEach((n, k) => {
      if (n > (parts.sizes[keep] ?? 0)) keep = k;
    });
    parts.cells.forEach((cells, k) => {
      if (k !== keep) for (const i of cells) zoneOf[i] = -1;
    });
  }
  const inSea = new Uint8Array(g.n);
  for (const b of bodies) for (const i of b) inSea[i] = 1;
  const labelled: number[] = [];
  for (let i = 0; i < g.n; i++) if ((zoneOf[i] ?? -1) >= 0) labelled.push(i);
  grow(labelled, (i) => inSea[i] === 1);
  report.seaZones = zones;

  // Which land zones each sea zone washes; neighbouring sea zones.
  const coastSets = zones.map(() => new Set<number>());
  const nextTo = zones.map(() => new Set<number>());
  for (let i = 0; i < g.n; i++) {
    const z = zoneOf[i] ?? -1;
    if (z < 0) continue;
    for (const j of g.around(i, N4)) {
      const o = zoneOf[j] ?? -1;
      if (o >= 0 && o !== z) nextTo[z]?.add(o);
    }
    for (const j of g.around(i, N8)) {
      if (st.terrain[j] !== T.water) coastSets[z]?.add(st.zone[j] ?? 0);
    }
  }
  // 2. Tiers: one more than the land they wash, one more per strait.
  zones.forEach((z) => {
    z.coast = [...(coastSets[z.id] ?? [])].sort((a, b) => a - b);
    z.hold = z.coast.includes(holdZone);
    for (const lz of z.coast) {
      const land = st.zones[lz];
      if (land) z.tier = Math.min(z.tier, land.tier + 1);
    }
  });
  for (let round = 0; round < zones.length; round++) {
    let changed = false;
    for (const z of zones) {
      for (const o of nextTo[z.id] ?? []) {
        const t = (zones[o]?.tier ?? Infinity) + 1;
        if (t < z.tier) {
          z.tier = t;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  for (const z of zones) {
    if (!Number.isFinite(z.tier)) z.tier = 2;
    if (z.hold && mode === "islands") z.tier = Math.max(3, z.tier);
  }

  // 3. Straits: a reef along each seam with one channel.
  const landDist = chamferDistance(g, (i) => st.terrain[i] !== T.water).dist;
  const srng = stageRng(st, "sea-straits");
  const channel = new Uint8Array(g.n);
  const reef = new Uint8Array(g.n);
  const pending: Array<Omit<StraitInfo, "guard">> = [];
  for (const z of zones) {
    for (const o of [...(nextTo[z.id] ?? [])].sort((p, q) => p - q)) {
      if (o <= z.id) continue;
      const pairs: Array<[number, number]> = [];
      for (let i = 0; i < g.n; i++) {
        if ((zoneOf[i] ?? -1) !== z.id) continue;
        for (const j of g.around(i, N4)) {
          if ((zoneOf[j] ?? -1) === o) pairs.push([i, j]);
        }
      }
      if (pairs.length === 0) continue;
      for (const [i, j] of pairs) {
        reef[i] = 1;
        reef[j] = 1;
      }
      // The channel: open water near the middle of the seam.
      const open = (p: [number, number]): number =>
        Math.min(landDist[p[0]] ?? 0, landDist[p[1]] ?? 0);
      const most = Math.max(...pairs.map(open));
      const pool = pairs.filter((p) => open(p) >= Math.min(2, most));
      const mx = pool.reduce((n, p) => n + g.x(p[0]), 0) / pool.length;
      const my = pool.reduce((n, p) => n + g.y(p[0]), 0) / pool.length;
      let pick = pool[0] as [number, number];
      for (const p of pool) {
        const d = Math.hypot(g.x(p[0]) - mx, g.y(p[0]) - my);
        const e = Math.hypot(g.x(pick[0]) - mx, g.y(pick[0]) - my);
        if (d < e) pick = p;
      }
      const width = srng.int(...sc.straitWidth);
      const [a, b] = pick;
      const across = g.x(a) === g.x(b);
      const offsets = width === 1 ? [0] : width === 2 ? [0, 1] : [-1, 0, 1];
      const cells: number[] = [];
      for (const k of offsets) {
        for (const c of [a, b]) {
          const x = g.x(c) + (across ? k : 0);
          const y = g.y(c) + (across ? 0 : k);
          if (!g.inside(x, y)) continue;
          const m = g.idx(x, y);
          if (st.terrain[m] !== T.water) continue;
          channel[m] = 1;
          cells.push(m);
        }
      }
      // The guard stands on the shallower side's cell.
      const deeper =
        (zones[o]?.tier ?? 0) >= z.tier ? (zones[o] as SeaZoneInfo) : z;
      const shallow = deeper.id === o ? a : b;
      pending.push({
        a: z.id,
        b: o,
        cell: shallow,
        channel: cells.sort((p, q) => p - q),
        width,
      });
    }
  }
  // Raise the reefs (never on a channel), in 2x2 blocks of rock.
  const rock = (i: number): boolean =>
    reef[i] === 1 ||
    (st.terrain[i] !== T.water && st.obstacle[i] === O.mountain);
  const nearChannel = new Uint8Array(g.n);
  for (let i = 0; i < g.n; i++) {
    if (channel[i] !== 1) continue;
    nearChannel[i] = 1;
    for (const j of g.around(i, N8)) if (reef[j] !== 1) nearChannel[j] = 1;
  }
  for (let i = 0; i < g.n; i++) if (channel[i] === 1) reef[i] = 0;
  for (let round = 0; round < 4; round++) {
    let grown = 0;
    for (let i = 0; i < g.n; i++) {
      if (reef[i] !== 1) continue;
      let best: number[] | undefined;
      for (const [ox, oy] of [
        [0, 0],
        [-1, 0],
        [0, -1],
        [-1, -1],
      ] as const) {
        const x0 = g.x(i) + ox;
        const y0 = g.y(i) + oy;
        if (!g.inside(x0, y0) || !g.inside(x0 + 1, y0 + 1)) continue;
        const block = [
          g.idx(x0, y0),
          g.idx(x0 + 1, y0),
          g.idx(x0, y0 + 1),
          g.idx(x0 + 1, y0 + 1),
        ];
        const add = block.filter((k) => !rock(k));
        if (
          add.some(
            (k) =>
              st.terrain[k] !== T.water ||
              channel[k] === 1 ||
              nearChannel[k] === 1,
          )
        )
          continue;
        if (best === undefined || add.length < best.length) best = add;
      }
      if (best === undefined || best.length === 0) continue;
      for (const k of best) reef[k] = 1;
      grown += best.length;
    }
    if (grown === 0) break;
  }
  for (let i = 0; i < g.n; i++) {
    if (reef[i] !== 1) continue;
    // Grey sea rocks, whatever the land beside them.
    st.terrain[i] = T.wasteland;
    st.obstacle[i] = O.mountain;
    st.deep[i] = 0;
    zoneOf[i] = -1;
  }
  // A reef cell that found no 2x2 block is a wooded islet instead.
  for (let i = 0; i < g.n; i++) {
    if (reef[i] === 1 && !inMountainBlock(st, i)) st.obstacle[i] = O.forest;
  }
  // Open water a reef cut off from the rest gets a strait of its own: a
  // way of up to four cells through the reef, guarded like the others.
  for (let round = 0; round < 24; round++) {
    // The largest piece of each sea is its main water.
    const parts = components(g, (i) => isSea(i), 4);
    const mainOf = new Map<number, number>();
    parts.cells.forEach((c, k) => {
      const b = zones[zoneOf[c[0] ?? 0] ?? 0]?.body ?? 0;
      const best = mainOf.get(b);
      if (best === undefined || c.length > (parts.sizes[best] ?? 0))
        mainOf.set(b, k);
    });
    const lost = parts.cells.findIndex(
      (c, k) =>
        mainOf.get(zones[zoneOf[c[0] ?? 0] ?? 0]?.body ?? 0) !== k &&
        c.length >= 20,
    );
    if (lost < 0) break;
    const from = parts.cells[lost] ?? [];
    const prev = new Map<number, number>();
    for (const i of from) prev.set(i, -1);
    let frontier = [...from];
    let end = -1;
    for (let d = 0; d < 5 && end < 0; d++) {
      const next: number[] = [];
      for (const i of frontier) {
        for (const j of g.around(i, N4)) {
          if (prev.has(j)) continue;
          if (isSea(j) && (parts.label[j] ?? -1) !== lost) {
            prev.set(j, i);
            end = j;
            break;
          }
          if (reef[j] !== 1 || channel[j] === 1) continue;
          prev.set(j, i);
          next.push(j);
        }
        if (end >= 0) break;
      }
      frontier = next;
    }
    if (end < 0) {
      // No way through: it is a lagoon, no sea.
      for (const i of from) zoneOf[i] = -1;
      continue;
    }
    const path: number[] = [];
    for (let k = prev.get(end) ?? -1; k >= 0 && (prev.get(k) ?? -1) >= 0;) {
      path.push(k);
      k = prev.get(k) ?? -1;
    }
    const inner = path[path.length - 1] ?? end;
    const start = prev.get(inner) ?? from[0] ?? 0;
    const za = zoneOf[start] ?? 0;
    const zb = zoneOf[end] ?? 0;
    for (const k of path) {
      st.terrain[k] = T.water;
      st.obstacle[k] = O.none;
      reef[k] = 0;
      channel[k] = 1;
      zoneOf[k] = za;
    }
    for (const k of path) {
      for (const j of g.around(k, N8)) {
        if (st.obstacle[j] === O.mountain && !inMountainBlock(st, j))
          st.obstacle[j] = O.forest;
      }
    }
    pending.push({
      a: Math.min(za, zb),
      b: Math.max(za, zb),
      cell: path[0] ?? end,
      channel: [...path].sort((p, q) => p - q),
      width: 1,
    });
  }
  // Water cut off by a reef from its sea is no sea of it.
  const live = components(g, (i) => isSea(i), 4);
  live.cells.forEach((cells) => {
    if (cells.some((i) => channel[i] === 1) || cells.length >= 40) return;
    for (const i of cells) zoneOf[i] = -1;
  });
  for (let i = 0; i < g.n; i++) {
    const z = zoneOf[i] ?? -1;
    if (z >= 0) {
      const info = zones[z];
      if (info) info.cells++;
    }
  }

  // The sea the costs sail from now on.
  const seaMask = new Uint8Array(g.n);
  for (let i = 0; i < g.n; i++) if (isSea(i)) seaMask[i] = 1;
  const saved = st.seaPass;
  st.seaPass = seaMask;
  const starts = st.towns.filter(
    (t) => t.role === "player" || t.role === "open-start",
  );
  const startCost = starts.map((t) => movementCost(st, t.cell));
  const near = movementCost(
    st,
    starts.map((t) => t.cell),
  );
  // What a hero reaches: on foot on Coast maps (every zone is), sailing
  // on the others.
  st.seaPass = mode === "coast" ? saved : seaMask;
  const reach = reachable(st, homeCell(st));
  st.seaPass = saved;
  const ringAt = (i: number): number => {
    const c = near[i] ?? Infinity;
    return Number.isFinite(c) ? ringOf(c) : 3;
  };

  // Ids that continue the land's numbering.
  const counters = new Map<string, number>();
  for (const o of st.objects) {
    const m = /^(.*)-(\d+)$/.exec(o.id);
    if (m === null) continue;
    const p = m[1] ?? "";
    counters.set(p, Math.max(counters.get(p) ?? 0, Number(m[2])));
  }
  const nextId = (prefix: string): string => {
    const n = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, n);
    return `${prefix}-${n}`;
  };

  const grng = stageRng(st, "sea-guards");
  const placeGuard = (
    cell: number,
    s: GuardStack,
    value: number,
    guards: string[],
    extra: Record<string, unknown> = {},
  ): string => {
    const id = nextId("monster");
    st.objects.push({
      id,
      kind: "monster",
      x: g.x(cell),
      y: g.y(cell),
      footprint: { w: 1, h: 1 },
      blocked: [],
      data: {
        creature: s.creature,
        count: s.count,
        fv: s.fv,
        ring: ringAt(cell),
        value,
        guards,
        ...extra,
      },
    });
    st.occupied[cell] = 1;
    if (isSea(cell)) report.seaGuards++;
    return id;
  };

  // Strait guards; each start's first strait holds the same stack: the
  // nearest one, and every strait out of a start's home waters.
  const firstOf = new Set<number>();
  const home = new Set<number>();
  for (const t of starts) {
    let best = -1;
    for (let i = 0; i < g.n; i++) {
      if ((zoneOf[i] ?? -1) < 0) continue;
      if (best < 0 || g.dist(i, t.cell) < g.dist(best, t.cell)) best = i;
    }
    if (best >= 0 && g.dist(best, t.cell) <= 6) home.add(zoneOf[best] ?? -1);
  }
  const holdStrait = (p: { a: number; b: number }): boolean => {
    const za = zones[p.a];
    const zb = zones[p.b];
    const opens = (za?.tier ?? 0) >= (zb?.tier ?? 0) ? za : zb;
    return opens?.hold === true && mode === "islands";
  };
  pending.forEach((p, k) => {
    if (home.has(p.a) || home.has(p.b)) firstOf.add(k);
  });
  startCost.forEach((cost) => {
    let best = -1;
    for (let k = 0; k < pending.length; k++) {
      if (holdStrait(pending[k] ?? { a: 0, b: 0 })) continue;
      const c = cost[pending[k]?.cell ?? 0] ?? Infinity;
      if (best < 0 || c < (cost[pending[best]?.cell ?? 0] ?? Infinity))
        best = k;
    }
    if (best >= 0) firstOf.add(best);
  });
  let first: GuardStack | undefined;
  pending.forEach((p, k) => {
    const za = zones[p.a];
    const zb = zones[p.b];
    const opens = (za?.tier ?? 0) >= (zb?.tier ?? 0) ? za : zb;
    const hold = holdStrait(p);
    const tier = hold
      ? PASS_VALUE.length - 1
      : Math.min(Math.max(1, opens?.tier ?? 1), PASS_VALUE.length - 2);
    const value = PASS_VALUE[tier] ?? 0;
    const ring = ringAt(p.cell);
    const sized = (): GuardStack =>
      seaStackFor(
        grng,
        guardTarget(value, ring) *
          (1 + grng.float(-cfg.guards.jitter, cfg.guards.jitter)),
        ring,
        hold && ring >= 3 ? "kraken" : undefined,
      );
    let s: GuardStack;
    if (firstOf.has(k) && !hold) {
      first ??= sized();
      s = first;
    } else s = sized();
    const guard = placeGuard(p.cell, s, value, [], {
      strait: true,
      ...(hold ? { holdStrait: true } : {}),
    });
    report.straits.push({ ...p, guard });
  });

  // Docks of every town: kept clear of sea objects.
  const reserved = new Uint8Array(g.n);
  const dockOf = (cell: number): number => {
    let frontier = [cell];
    const seen = new Set<number>([cell]);
    for (let d = 0; d < 4; d++) {
      const next: number[] = [];
      const found: number[] = [];
      for (const i of frontier) {
        for (const j of g.around(i, N8)) {
          if (seen.has(j)) continue;
          seen.add(j);
          if (seaMask[j] === 1) {
            if ((st.objBlocked[j] ?? 0) === 0) found.push(j);
          } else if (isWalkable(st, j)) next.push(j);
        }
      }
      if (found.length > 0) return Math.min(...found);
      frontier = next;
    }
    return -1;
  };
  for (const t of st.towns) {
    const d = dockOf(t.cell);
    if (d < 0) continue;
    reserved[d] = 1;
    for (const j of g.around(d, N8)) if (seaMask[j] === 1) reserved[j] = 1;
  }
  report.docks = starts.map((t) => dockOf(t.cell));
  for (let i = 0; i < g.n; i++) {
    if (channel[i] === 1) {
      reserved[i] = 1;
      for (const j of g.around(i, N8)) reserved[j] = 1;
    }
  }

  // 4. Landing cells (NAVAL 8.3).
  const zoc = new Uint8Array(g.n);
  const markZoc = (o: MapObject): void => {
    const c = g.idx(o.x, o.y);
    if (st.terrain[c] === T.water) return;
    zoc[c] = 1;
    for (const j of g.around(c, N8)) zoc[j] = 1;
  };
  for (const o of st.objects) if (o.kind === "monster") markZoc(o);
  const shore = (i: number): boolean =>
    st.terrain[i] !== T.water && g.around(i, N8).some((j) => isSea(j));
  const landing = (i: number): boolean =>
    shore(i) &&
    isWalkable(st, i) &&
    (st.occupied[i] ?? 0) === 0 &&
    (zoc[i] ?? 0) === 0 &&
    (reach[i] ?? 0) === 1;
  const corridor = corridorMask(st);
  const lrng = stageRng(st, "sea-landings");
  const free = components(g, (i) => isWalkable(st, i) && zoc[i] !== 1, 8);
  const keepLanding = new Uint8Array(g.n);
  const coastZones = new Set<number>();
  for (let i = 0; i < g.n; i++) {
    if (shore(i) && reef[i] !== 1) coastZones.add(st.zone[i] ?? 0);
  }
  for (const z of [...coastZones].sort((a, b) => a - b)) {
    const mine: number[] = [];
    let potential = 0;
    for (let i = 0; i < g.n; i++) {
      if ((st.zone[i] ?? 0) !== z || !shore(i) || reef[i] === 1) continue;
      potential++;
      if (landing(i)) mine.push(i);
    }
    if (potential < COAST_LINK) continue;
    // Too few: cut short ways (up to four cells) through the shore's forest
    // or rock from the zone's main open ground, never joining another
    // piece of it (no way round a guard).
    for (let tries = 0; mine.length < sc.landingCells && tries < 6; tries++) {
      const sizes = new Map<number, number>();
      for (let i = 0; i < g.n; i++) {
        const l = free.label[i] ?? -1;
        if (l >= 0 && (st.zone[i] ?? 0) === z && (reach[i] ?? 0) === 1)
          sizes.set(l, (sizes.get(l) ?? 0) + 1);
      }
      let main = -1;
      for (const [l, n] of sizes) {
        if (main < 0 || n > (sizes.get(main) ?? 0)) main = l;
      }
      if (main < 0) break;
      const cuttable = (i: number): boolean =>
        (st.zone[i] ?? 0) === z &&
        st.terrain[i] !== T.water &&
        st.obstacle[i] !== O.none &&
        reef[i] !== 1 &&
        (st.spine[i] ?? 0) === 0 &&
        (corridor[i] ?? 0) === 0 &&
        (st.occupied[i] ?? 0) === 0 &&
        g.around(i, N8).every((j) => {
          const l = free.label[j] ?? -1;
          return l < 0 || l === main || zoc[j] === 1;
        });
      const prev = new Map<number, number>();
      let frontier: number[] = [];
      for (let i = 0; i < g.n; i++) {
        if ((free.label[i] ?? -1) === main && (st.zone[i] ?? 0) === z)
          frontier.push(i);
      }
      for (const i of frontier) prev.set(i, -1);
      const ends: number[] = [];
      for (let d = 0; d < 4 && ends.length === 0; d++) {
        const next: number[] = [];
        for (const i of frontier) {
          for (const j of g.around(i, N4)) {
            if (prev.has(j) || !cuttable(j)) continue;
            prev.set(j, i);
            next.push(j);
            if (shore(j) && mine.every((m) => g.cheb(m, j) >= 3)) ends.push(j);
          }
        }
        frontier = next;
      }
      if (ends.length === 0) break;
      const end = lrng.pick(ends.sort((a, b) => a - b));
      for (let k = end; k >= 0 && (free.label[k] ?? -1) !== main;) {
        st.obstacle[k] = O.none;
        st.keepOpen[k] = 1;
        free.label[k] = main;
        reach[k] = 1;
        k = prev.get(k) ?? -1;
      }
      // Rock left without its 2x2 block turns to wood (bead xaj.20).
      for (let i = 0; i < g.n; i++) {
        if (st.obstacle[i] === O.mountain && g.cheb(i, end) <= 6) {
          if (!inMountainBlock(st, i)) st.obstacle[i] = O.forest;
        }
      }
      mine.push(end);
    }
    // Keep three spread landings free of the coastal objects: the ones set
    // aside before the land objects first.
    const kept: number[] = [];
    const aside = mine.filter((i) => st.landing?.[i] === 1);
    for (const i of [
      ...aside,
      ...lrng.shuffle(mine.filter((i) => !aside.includes(i))),
    ]) {
      if (kept.length >= sc.landingCells) break;
      if (kept.some((k) => g.cheb(k, i) < 3)) continue;
      kept.push(i);
    }
    for (const i of kept.length >= sc.landingCells ? kept : mine) {
      keepLanding[i] = 1;
      for (const j of g.around(i, N8)) keepLanding[j] = 1;
    }
  }

  // Placement helpers.
  const crowd = new Uint8Array(g.n);
  const nearTown = (i: number): boolean =>
    st.towns.some((t) => g.cheb(t.cell, i) <= cfg.objects.townClearance + 1);
  const seaFree = (i: number): boolean =>
    isSea(i) &&
    (st.occupied[i] ?? 0) === 0 &&
    reserved[i] !== 1 &&
    crowd[i] !== 1;
  /**
   * A guaranteed object's second try (the Shipwright, NAVAL 8.4): it may
   * stand on a road or beside a kept landing, never on one.
   */
  let loose = false;
  const landFree = (i: number): boolean =>
    st.terrain[i] !== T.water &&
    isWalkable(st, i) &&
    (st.occupied[i] ?? 0) === 0 &&
    (corridor[i] ?? 0) === 0 &&
    (loose ? st.landing?.[i] !== 1 : keepLanding[i] !== 1) &&
    (loose || st.road[i] !== 1) &&
    !nearTown(i);
  /** Blocking `foot` keeps the sea (or land) round it in one piece. */
  const waysRound = (
    foot: readonly number[],
    open: (i: number) => boolean,
  ): boolean => {
    const set = new Set(foot);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const f of foot) {
      x0 = Math.min(x0, g.x(f) - 2);
      y0 = Math.min(y0, g.y(f) - 2);
      x1 = Math.max(x1, g.x(f) + 2);
      y1 = Math.max(y1, g.y(f) + 2);
    }
    const inside = (k: number): boolean =>
      g.x(k) >= x0 && g.x(k) <= x1 && g.y(k) >= y0 && g.y(k) <= y1;
    const ok = (k: number): boolean => !set.has(k) && open(k);
    const ring: number[] = [];
    for (const f of foot)
      for (const j of g.around(f, N8))
        if (ok(j) && !ring.includes(j)) ring.push(j);
    const start = ring[0];
    if (start === undefined) return false;
    const seen = new Set<number>([start]);
    const stack = [start];
    while (stack.length > 0) {
      const i = stack.pop() as number;
      for (const [dx, dy] of N8) {
        const x = g.x(i) + dx;
        const y = g.y(i) + dy;
        if (!g.inside(x, y)) continue;
        const j = g.idx(x, y);
        if (seen.has(j) || !inside(j) || !ok(j)) continue;
        if (dx !== 0 && dy !== 0) {
          if (
            !ok(g.idx(g.x(i) + dx, g.y(i))) &&
            !ok(g.idx(g.x(i), g.y(i) + dy))
          )
            continue;
        }
        seen.add(j);
        stack.push(j);
      }
    }
    return ring.every((j) => seen.has(j));
  };
  const footOf = (
    row: MapObjectRow,
    e: number,
  ): { cells: number[]; blocked: Array<[number, number]> } | undefined => {
    const x0 = g.x(e) - row.entrance[0];
    const y0 = g.y(e) - row.entrance[1];
    const cells: number[] = [];
    const blocked: Array<[number, number]> = [];
    for (let dy = 0; dy < row.footprint.h; dy++) {
      for (let dx = 0; dx < row.footprint.w; dx++) {
        const x = x0 + dx;
        const y = y0 + dy;
        if (!g.inside(x, y)) return undefined;
        const c = g.idx(x, y);
        cells.push(c);
        if (c !== e) blocked.push([x, y]);
      }
    }
    return { cells, blocked };
  };
  const counted = (type: string): void => {
    report.placed[type] = (report.placed[type] ?? 0) + 1;
  };
  const finish = (
    row: MapObjectRow,
    e: number,
    blocked: Array<[number, number]>,
    data: Record<string, unknown>,
    cells: readonly number[],
  ): MapObject => {
    const obj: MapObject = {
      id: nextId(row.id),
      kind: row.kind,
      x: g.x(e),
      y: g.y(e),
      footprint: { ...row.footprint },
      blocked,
      data,
    };
    commit(st, obj);
    for (const c of cells) {
      crowd[c] = 1;
      for (const j of g.around(c, N8)) crowd[j] = 1;
    }
    counted(row.type);
    return obj;
  };
  /** A sea object (its entrance a sea cell) in sea zone `z`. */
  const placeAtSea = (
    rng: Rng,
    row: MapObjectRow,
    z: number,
    data: Record<string, unknown>,
    fit: (e: number) => boolean = () => true,
  ): MapObject | undefined => {
    const cells: number[] = [];
    for (let i = 0; i < g.n; i++) if ((zoneOf[i] ?? -1) === z) cells.push(i);
    for (const e of rng.shuffle(cells).slice(0, 400)) {
      if (!seaFree(e) || !fit(e)) continue;
      const foot = footOf(row, e);
      if (foot === undefined || !foot.cells.every(seaFree)) continue;
      // A way round it at sea, and a free cell to visit it from.
      if (!waysRound(foot.cells, (k) => isSea(k) && st.occupied[k] !== 1))
        continue;
      const from = g
        .around(e, N8)
        .some(
          (j) => isSea(j) && !foot.cells.includes(j) && st.occupied[j] !== 1,
        );
      if (!from) continue;
      return finish(row, e, foot.blocked, data, foot.cells);
    }
    return undefined;
  };
  /** A coastal object: its entrance on a reachable shore of sea zone `z`. */
  const placeAtCoast = (
    rng: Rng,
    row: MapObjectRow,
    z: number,
    data: Record<string, unknown>,
    fit: (e: number) => boolean = () => true,
  ): MapObject | undefined => {
    const cells: number[] = [];
    for (let i = 0; i < g.n; i++) {
      if (st.terrain[i] === T.water || (reach[i] ?? 0) !== 1) continue;
      if (g.around(i, N8).some((j) => (zoneOf[j] ?? -1) === z)) cells.push(i);
    }
    const seaLoose = (c: number): boolean =>
      isSea(c) && (st.occupied[c] ?? 0) === 0 && channel[c] !== 1;
    /** Shore wood or rock a loose try may build over (no border, no way). */
    const rocky = (c: number): boolean =>
      loose &&
      st.terrain[c] !== T.water &&
      st.obstacle[c] !== O.none &&
      (st.spine[c] ?? 0) === 0 &&
      (corridor[c] ?? 0) === 0 &&
      (st.occupied[c] ?? 0) === 0 &&
      reef[c] !== 1 &&
      !nearTown(c);
    for (const e of rng.shuffle(cells)) {
      if (!landFree(e) || (!loose && crowd[e] === 1) || !fit(e)) continue;
      const foot = footOf(row, e);
      if (foot === undefined) continue;
      const ok = foot.cells.every(
        (c) =>
          c === e ||
          (loose
            ? landFree(c) || seaLoose(c) || rocky(c)
            : crowd[c] !== 1 && (landFree(c) || seaFree(c))),
      );
      if (!ok) continue;
      // A way round it on land, and open ground to visit it from.
      if (!waysRound(foot.cells, (k) => isWalkable(st, k))) continue;
      // Its back may stand on shore wood or rock, cleared under it.
      for (const c of foot.cells) {
        if (c === e || !rocky(c)) continue;
        st.obstacle[c] = O.none;
        for (const j of g.around(c, N8)) {
          if (st.obstacle[j] === O.mountain && !inMountainBlock(st, j))
            st.obstacle[j] = O.forest;
        }
      }
      return finish(row, e, foot.blocked, data, foot.cells);
    }
    return undefined;
  };
  /** The guard of a sea object (a sea stack on its approach). */
  const guardSea = (obj: MapObject, value: number, force?: string): void => {
    const e = g.idx(obj.x, obj.y);
    const spots = g
      .around(e, N8)
      .filter(
        (j) =>
          isSea(j) &&
          (st.occupied[j] ?? 0) === 0 &&
          reserved[j] !== 1 &&
          !obj.blocked.some(([x, y]) => g.idx(x, y) === j),
      );
    if (spots.length === 0) return;
    const cell = grng.pick(spots);
    const ring = ringAt(cell);
    const s = seaStackFor(
      grng,
      Math.max(
        cfg.guards.minFightValue,
        guardTarget(value, ring) *
          (1 + grng.float(-cfg.guards.jitter, cfg.guards.jitter)),
      ),
      ring,
      force,
    );
    placeGuard(cell, s, value, [obj.id]);
  };
  /** The guard of a coastal object (on land beside its entrance). */
  const guardCoast = (obj: MapObject, value: number, force?: string): void => {
    const e = g.idx(obj.x, obj.y);
    const spots = g
      .around(e, N8)
      .filter(
        (j) =>
          st.terrain[j] !== T.water &&
          isWalkable(st, j) &&
          (st.occupied[j] ?? 0) === 0 &&
          keepLanding[j] !== 1,
      );
    if (spots.length === 0) return;
    const cell = grng.pick(spots);
    const ring = ringAt(cell);
    const s =
      force !== undefined
        ? seaStackFor(grng, guardTarget(value, ring), ring, force)
        : sizeGuard(
            grng,
            value,
            ring,
            cfg.guards.jitter,
            cfg.guards.minFightValue,
            { terrain: TERRAIN_OF[st.terrain[cell] ?? 0] ?? "grass" },
          );
    placeGuard(cell, s, value, [obj.id]);
    markZoc(st.objects[st.objects.length - 1] as MapObject);
  };
  const valueOf = (
    row: MapObjectRow,
    data: Record<string, unknown>,
  ): number => {
    const v = data["value"];
    return typeof v === "number" ? v : row.value;
  };
  /** Place one sea or coastal object of `type` in sea zone `z`, guarded. */
  const place = (
    rng: Rng,
    type: SeaObjectTypeId,
    z: number,
    extra: Record<string, unknown> = {},
    fit?: (e: number) => boolean,
  ): MapObject | undefined => {
    const row = rowOf(type);
    const tier = Math.min(3, zones[z]?.tier ?? 1);
    const data: Record<string, unknown> = {
      ...row.data,
      type,
      ...seaContents(type, rng, tier),
      ...extra,
    };
    const obj = COASTAL.has(type)
      ? placeAtCoast(rng, row, z, data, fit)
      : placeAtSea(rng, row, z, data, fit);
    if (obj === undefined) {
      report.unplaced++;
      return undefined;
    }
    const value = valueOf(row, data);
    if (
      !UNGUARDED.has(type) &&
      value >= sc.guardFrom &&
      data["guard"] === undefined
    ) {
      const force =
        typeof data["guardCreature"] === "string"
          ? data["guardCreature"]
          : undefined;
      if (COASTAL.has(type)) guardCoast(obj, value, force);
      else guardSea(obj, value, force);
    }
    return obj;
  };
  const roleOf = (lz: number): string => st.zones[lz]?.role ?? "middle";
  const coastOf = (lz: number): number[] =>
    zones.filter((z) => z.coast.includes(lz)).map((z) => z.id);

  // 5. Access (NAVAL 8.4). Shipwrights, with the dock in front.
  const arng = stageRng(st, "sea-access");
  const shipwright = (z: number, fit: (e: number) => boolean): void => {
    const where = (e: number): boolean =>
      fit(e) &&
      g
        .around(e, N8)
        .some((j) =>
          loose
            ? isSea(j) && (st.occupied[j] ?? 0) === 0 && reserved[j] !== 1
            : seaFree(j),
        );
    let obj = place(arng, "shipwright", z, {}, where);
    if (obj === undefined) {
      loose = true;
      obj = place(arng, "shipwright", z, {}, where);
      loose = false;
      if (obj !== undefined) report.unplaced--;
    }
    if (obj === undefined) return;
    const e = g.idx(obj.x, obj.y);
    // In front of its door, else beside the building.
    const free = (j: number): boolean =>
      isSea(j) && (st.occupied[j] ?? 0) === 0;
    const byDoor = (p: number, q: number): number =>
      g.dist(p, e + g.w) - g.dist(q, e + g.w) || p - q;
    const beside = [e, ...obj.blocked.map(([x, y]) => g.idx(x, y))]
      .flatMap((c) => [...g.around(c, N8)])
      .filter(free);
    const dock =
      g.around(e, N8).filter(free).sort(byDoor)[0] ?? beside.sort(byDoor)[0];
    if (dock === undefined) return;
    obj.data["dock"] = [g.x(dock), g.y(dock)];
    reserved[dock] = 1;
    for (const j of g.around(dock, N8)) if (isSea(j)) reserved[j] = 1;
  };
  const inZoneRole =
    (roles: readonly string[]) =>
    (e: number): boolean =>
      roles.includes(roleOf(st.zone[e] ?? 0));
  const middleZones = st.zones.filter(
    (z) => z.role === "middle" && coastOf(z.id).length > 0,
  );
  if (mode === "coast") {
    bodies.forEach((_, b) => {
      const z = zones.find((s) => s.body === b);
      if (z === undefined) return;
      const before = report.placed["shipwright"] ?? 0;
      for (const roles of [["middle"], ["town", "hold"], ["start"]]) {
        shipwright(z.id, inZoneRole(roles));
        if ((report.placed["shipwright"] ?? 0) > before) break;
        report.unplaced--;
      }
    });
  } else if (mode === "inland") {
    starts.forEach((t, k) => {
      const cost = startCost[k];
      for (const z of coastOf(t.zone)) {
        const before = report.placed["shipwright"] ?? 0;
        shipwright(
          z,
          (e) =>
            (st.zone[e] ?? 0) === t.zone &&
            (cost?.[e] ?? Infinity) <= cfg.movement.day,
        );
        if ((report.placed["shipwright"] ?? 0) > before) break;
        report.unplaced--;
      }
    });
    const ring = arng.shuffle([...middleZones]);
    for (const mz of ring.slice(0, Math.ceil(ring.length / 2))) {
      const z = coastOf(mz.id)[0];
      if (z !== undefined) shipwright(z, (e) => (st.zone[e] ?? 0) === mz.id);
    }
  } else {
    const isles = arng.shuffle([...middleZones]);
    for (const mz of isles.slice(
      0,
      Math.max(1, Math.floor(isles.length / 4)),
    )) {
      const z = coastOf(mz.id)[0];
      if (z !== undefined) shipwright(z, (e) => (st.zone[e] ?? 0) === mz.id);
    }
  }
  // Islands: every start town has its Shipyard built (the boat at its
  // dock comes with the finished map, settleSeaMap).
  if (mode === "islands") {
    for (const t of starts) {
      const town = st.objects.find(
        (o) => o.kind === "town" && o.x === g.x(t.cell) && o.y === g.y(t.cell),
      );
      if (town) town.data["shipyard"] = true;
    }
  }
  // Moored boats: beside a landing.
  const boat = (z: number, fit: (e: number) => boolean): boolean =>
    place(
      arng,
      "moored-boat",
      z,
      {},
      (e) =>
        fit(e) &&
        g.around(e, N8).some((j) => landing(j) || keepLanding[j] === 1),
    ) !== undefined;
  if (mode === "coast") {
    bodies.forEach((_, b) => {
      const z = zones.find((s) => s.body === b);
      if (z === undefined) return;
      const n = arng.int(...sc.coast.boats);
      for (let k = 0; k < n; k++) {
        if (!boat(z.id, inZoneRole(["middle", "town", "hold"]))) {
          report.unplaced--;
          boat(z.id, () => true);
        }
      }
    });
  } else if (mode === "inland") {
    starts.forEach((t, k) => {
      const cost = startCost[k];
      for (const z of coastOf(t.zone)) {
        const ok = boat(z, (e) =>
          g
            .around(e, N8)
            .some(
              (j) =>
                (st.zone[j] ?? 0) === t.zone &&
                (cost?.[j] ?? Infinity) <= cfg.movement.day,
            ),
        );
        if (ok) break;
        report.unplaced--;
      }
    });
  }

  // 6. Rules (NAVAL 8.6). A Lighthouse per sea zone with a coast.
  const rrng = stageRng(st, "sea-rules");
  for (const z of zones) {
    if (z.coast.length === 0) continue;
    place(rrng, "lighthouse", z.id, {}, (e) => {
      const d = landDist[e] ?? 0;
      return d >= 1.5 && d <= 3.5;
    });
  }
  // The Kraken's Deep: L and XL Inland Sea and Islands, the deepest zone.
  if ((st.size === "L" || st.size === "XL") && mode !== "coast") {
    const deepest = [...zones].sort(
      (a, b) => b.tier - a.tier || b.cells - a.cells || a.id - b.id,
    )[0];
    if (deepest !== undefined) place(rrng, "krakens-deep", deepest.id);
  }
  // Whirlpools in pairs: different sea zones, a day or more from a start.
  const farOff = (e: number): boolean =>
    (near[e] ?? Infinity) >= cfg.movement.day;
  const pairs = rrng.int(...mc.whirlpools[st.size]);
  for (let k = 0; k < pairs; k++) {
    const options: Array<[SeaZoneInfo, SeaZoneInfo]> = [];
    for (const a of zones) {
      for (const b of zones) {
        if (b.id <= a.id || a.body !== b.body) continue;
        if (Math.abs(a.tier - b.tier) > 1) continue;
        options.push([a, b]);
      }
    }
    if (options.length === 0) break;
    const [a, b] = rrng.pick(options);
    const pair = `whirlpool-${k + 1}`;
    const one = place(rrng, "whirlpool", a.id, { pair }, farOff);
    if (one === undefined) continue;
    const two = place(rrng, "whirlpool", b.id, { pair }, farOff);
    if (two === undefined) {
      // A whirlpool without its twin goes again.
      st.objects = st.objects.filter((o) => o !== one);
      st.occupied[g.idx(one.x, one.y)] = 0;
      report.placed["whirlpool"] = (report.placed["whirlpool"] ?? 1) - 1;
    }
  }
  // Ferry Landings: pairs across a channel of 2-5 cells between two land
  // zones with no land link (never the Hold's).
  const ferries = rrng.int(...mc.ferries[st.size]);
  if (ferries > 0) {
    const linked = (a: number, b: number): boolean =>
      st.connections.some(
        (c) => (c.a === a && c.b === b) || (c.a === b && c.b === a),
      );
    const crossings: Array<[number, number]> = [];
    for (let i = 0; i < g.n; i++) {
      if (!landFree(i) || (reach[i] ?? 0) !== 1 || !shore(i)) continue;
      const za = st.zone[i] ?? 0;
      if (za === holdZone) continue;
      for (const [dx, dy] of N8) {
        let x = g.x(i);
        let y = g.y(i);
        let wet = 0;
        for (let s = 1; s <= 6; s++) {
          x += dx;
          y += dy;
          if (!g.inside(x, y)) break;
          const j = g.idx(x, y);
          if (isSea(j)) {
            wet++;
            continue;
          }
          const zb = st.zone[j] ?? 0;
          if (
            wet >= 2 &&
            wet <= 5 &&
            j > i &&
            zb !== za &&
            zb !== holdZone &&
            !linked(za, zb) &&
            landFree(j) &&
            (reach[j] ?? 0) === 1
          )
            crossings.push([i, j]);
          break;
        }
      }
    }
    const row = rowOf("ferry-landing");
    for (let k = 0; k < ferries && crossings.length > 0; k++) {
      const [a, b] = rrng.pick(crossings);
      if (crowd[a] === 1 || crowd[b] === 1) continue;
      const pair = `ferry-${k + 1}`;
      for (const e of [a, b]) {
        finish(row, e, [], { ...row.data, type: "ferry-landing", pair }, [e]);
      }
    }
  }

  // 7. The fill: about `density` visitable objects per 100 sea cells.
  const frng = stageRng(st, "sea-objects");
  const types = Object.keys(sc.weights) as SeaObjectTypeId[];
  const coves = new Set<number>();
  for (const z of zones) {
    const target = Math.round((z.cells * sc.density) / 100);
    let have = 0;
    for (const o of st.objects) {
      if ((zoneOf[g.idx(o.x, o.y)] ?? -1) === z.id && o.kind !== "monster")
        have++;
    }
    const middleCoast = z.coast.some((lz) => roleOf(lz) === "middle");
    for (let k = have; k < target; k++) {
      const open = types.filter(
        (t) =>
          (sc.weights[t] ?? 0) > 0 &&
          (t !== "pirate-cove" || (middleCoast && !coves.has(z.body))) &&
          (!COASTAL.has(t) || z.coast.length > 0),
      );
      if (open.length === 0) break;
      const type = frng.weighted(
        open,
        open.map((t) => sc.weights[t] ?? 0),
      );
      const fit =
        type === "pirate-cove"
          ? inZoneRole(["middle"])
          : type === "fishing-village"
            ? (e: number) => roleOf(st.zone[e] ?? 0) !== "hold"
            : undefined;
      const obj = place(frng, type, z.id, {}, fit);
      if (obj !== undefined && type === "pirate-cove") coves.add(z.body);
    }
  }

  // 8. The report.
  let wet = 0;
  for (let i = 0; i < g.n; i++) {
    if (st.terrain[i] === T.water) wet++;
    if (isSea(i)) report.seaCells++;
  }
  report.share = wet / g.n;
  // A zone has a coast link when its coast had landings to set aside
  // (NAVAL 8.3: a coast that is all cliff has none).
  const linked = new Map<number, number>();
  for (let i = 0; i < g.n; i++) {
    if (st.landing?.[i] === 1) {
      const z = st.zone[i] ?? 0;
      linked.set(z, (linked.get(z) ?? 0) + 1);
    }
  }
  for (const z of [...coastZones].sort((a, b) => a - b)) {
    let n = 0;
    for (let i = 0; i < g.n; i++) {
      if ((st.zone[i] ?? 0) !== z || !shore(i) || reef[i] === 1) continue;
      if (landing(i)) n++;
    }
    if ((linked.get(z) ?? 0) >= sc.landingCells) report.landings[z] = n;
  }
  return report;
}

/**
 * The finished naval map (bead bzc.155): on Islands maps a moored boat at
 * each start town's dock (NAVAL 8.4), from the game's own dock rule.
 */
export function settleSeaMap(map: GameMap, sea: SeaReport): void {
  if (sea.mode !== "islands" && sea.mode !== "inland") return;
  // No prop stands on a start town's way down to its dock.
  const w = map.width;
  const starts = map.objects.filter(
    (o) => o.kind === "town" && typeof o.data["start"] === "number",
  );
  const near = (x: number, y: number): boolean =>
    starts.some((t) => Math.max(Math.abs(t.x - x), Math.abs(t.y - y)) <= 4);
  if (map.decorations !== undefined) {
    map.decorations = map.decorations.filter((d) => {
      if (decorationKind(d.id)?.passable !== false) return true;
      const cells = decorationCells(d);
      if (!cells.some(([x, y]) => near(x, y))) return true;
      for (const [x, y] of cells) {
        const c = map.cells[y * w + x];
        if (c !== undefined) delete c.prop;
      }
      return false;
    });
  }
  if (sea.mode !== "islands") return;
  let n = map.objects.filter((o) => o.kind === BOAT_KIND).length;
  for (const o of map.objects.filter(
    (t) => t.kind === "town" && t.data["shipyard"] === true,
  )) {
    const dock = townDock(map, o.id);
    if (dock === null) continue;
    const taken = map.objects.some(
      (m) =>
        (m.x === dock.x && m.y === dock.y) ||
        m.blocked.some(([x, y]) => x === dock.x && y === dock.y),
    );
    if (taken) continue;
    n++;
    map.objects.push({
      id: `moored-boat-${n}`,
      kind: BOAT_KIND,
      x: dock.x,
      y: dock.y,
      footprint: { w: 1, h: 1 },
      blocked: [],
      data: { type: "moored-boat", value: 1000, dock: o.id },
    });
    sea.placed["moored-boat"] = (sea.placed["moored-boat"] ?? 0) + 1;
  }
}
