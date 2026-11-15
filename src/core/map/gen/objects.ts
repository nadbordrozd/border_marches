/**
 * Object placement: the two towns (early, so the landscape leaves room for
 * them), mines, roads, pickups and the neutral guards.
 *
 * Every placement keeps all open ground reachable from the player's town:
 * an object that would cut off any cell is rejected and tried elsewhere.
 */
import type { Rng } from "../../rng.ts";
import type { MapObject, ResourceId } from "../types.ts";
import { at, chamferDistance, N8, noiseField } from "./grid.ts";
import {
  HOLD_DEFENSE_BONUS,
  HOLD_GARRISON,
  HOLD_NAME,
  ringOf,
  sizeGuard,
} from "./guards.ts";
import type { GuardGrade } from "./guards.ts";
import { movementCost, reachable, roadPath } from "./paths.ts";
import { isWalkable, stageRng, stageSalt } from "./state.ts";
import type { GenState, ZoneRole } from "./state.ts";

// ---------------------------------------------------------------------------
// Towns

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

/** Choose both town sites deep inside their zones and reserve them. */
export function placeTowns(st: GenState): void {
  const rng = stageRng(st, "towns");
  const startZone = st.zones.find((z) => z.role === "start");
  const enemyZone = st.zones.find((z) => z.role === "enemy");
  if (!startZone || !enemyZone) throw new Error("mapgen: missing zones");
  st.townAt.start = siteFor(st, rng, startZone.id);
  st.townAt.enemy = siteFor(st, rng, enemyZone.id);
  addTown(st, st.townAt.start, "start");
  addTown(st, st.townAt.enemy, "enemy");
}

function siteFor(st: GenState, rng: Rng, zone: number): number {
  const { g, cfg } = st;
  const { dist } = chamferDistance(g, (i) => at(st.zone, i) !== zone);
  const { w, h } = cfg.objects.town;
  const scored: Array<{ i: number; s: number }> = [];
  for (let i = 0; i < g.n; i++) {
    if (at(st.zone, i) !== zone) continue;
    const x = g.x(i);
    const y = g.y(i);
    const edge = Math.min(x - w / 2, y - h, g.w - 1 - x - w / 2, g.h - 3 - y);
    if (edge < 2) continue;
    scored.push({ i, s: Math.min(at(dist, i), edge * 1.3) });
  }
  if (scored.length === 0) throw new Error("mapgen: no town site");
  const best = Math.max(...scored.map((p) => p.s));
  const pool = scored.filter((p) => p.s >= best - 1.2);
  return rng.pick(pool).i;
}

function addTown(st: GenState, entrance: number, role: ZoneRole): void {
  const { g, cfg } = st;
  const x = g.x(entrance);
  const y = g.y(entrance);
  const blocked = townBlocked(st, x, y);
  const { w, h } = cfg.objects.town;
  const player = role === "start";
  const obj: MapObject = {
    id: player ? "town-1" : "town-2",
    kind: "town",
    x,
    y,
    footprint: { w, h },
    blocked,
    data: player
      ? { faction: "lost-world", owner: 0 }
      : {
          faction: "goblin",
          owner: null,
          name: HOLD_NAME,
          garrison: HOLD_GARRISON.map((s) => ({ ...s })),
          defenseBonus: HOLD_DEFENSE_BONUS,
        },
  };
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
  // The entrance's south side stays open: the hero starts there.
  for (let dy = 1; dy <= r + 2 && g.inside(x, y + dy); dy++) {
    st.keepOpen[g.idx(x, y + dy)] = 1;
  }
  if (player && g.inside(x, y + 1)) {
    commit(st, {
      id: "hero-start-0",
      kind: "hero-start",
      x,
      y: y + 1,
      footprint: { w: 1, h: 1 },
      blocked: [],
      data: { player: 0 },
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

function uncommit(st: GenState, obj: MapObject): void {
  const { g } = st;
  st.objects.splice(st.objects.indexOf(obj), 1);
  st.occupied[g.idx(obj.x, obj.y)] = 0;
  for (const [bx, by] of obj.blocked) {
    const i = g.idx(bx, by);
    st.occupied[i] = 0;
    st.objBlocked[i] = 0;
  }
}

function countReach(st: GenState): number {
  const r = reachable(st, st.townAt.start);
  let n = 0;
  for (let i = 0; i < st.g.n; i++) n += at(r, i);
  return n;
}

// ---------------------------------------------------------------------------
// Mines, pickups and guards

interface GuardRequest {
  cell: number;
  guards: string;
  grade: GuardGrade;
  /** Cell whose distance sets the ring. */
  at: number;
  minRing: number;
}

interface MineRequest {
  resource: ResourceId;
  zones: number[];
  minCost: number;
  maxCost: number;
  /**
   * Minimum cost even if roads ran everywhere (a lower bound that roads
   * built later cannot undercut).
   */
  minRoadCost?: number;
  guard: GuardGrade | null;
  minRing?: number;
}

export interface PlacementReport {
  /** Requests that found no site (should stay empty). */
  skipped: string[];
}

export function placeObjects(st: GenState): PlacementReport {
  const { g, cfg } = st;
  const rng = stageRng(st, "objects");
  const day = cfg.movement.day;
  const report: PlacementReport = { skipped: [] };
  st.cost = movementCost(st, st.townAt.start);
  const reachSet = reachable(st, st.townAt.start);
  const roadCost = movementCost(st, st.townAt.start, cfg.movement.road);
  const guardReqs: GuardRequest[] = [];
  const counters = new Map<string, number>();
  const nextId = (prefix: string): string => {
    const n = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, n);
    return `${prefix}-${n}`;
  };

  const start = st.zones.find((z) => z.role === "start")?.id ?? 0;
  const enemy = st.zones.find((z) => z.role === "enemy")?.id ?? 0;
  const middles = st.zones.filter((z) => z.role === "middle").map((z) => z.id);
  const nearStart = middles.filter((m) =>
    st.connections.some(
      (c) => (c.a === start && c.b === m) || (c.b === start && c.a === m),
    ),
  );

  const free = (i: number): boolean =>
    isWalkable(st, i) &&
    at(reachSet, i) === 1 &&
    at(st.occupied, i) === 0 &&
    at(st.keepOpen, i) === 0;

  const spaced = (i: number, r: number): boolean => {
    const x = g.x(i);
    const y = g.y(i);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (g.inside(x + dx, y + dy) && at(st.occupied, g.idx(x + dx, y + dy)))
          return false;
      }
    }
    return true;
  };

  /** A free neighbour of `e` for a guard, nearest the player's town. */
  const guardCell = (e: number): number => {
    let best = -1;
    for (const j of g.around(e, N8)) {
      if (!free(j)) continue;
      if (best < 0 || at(st.cost, j) < at(st.cost, best)) best = j;
    }
    return best;
  };

  const limits: Array<{ cell: number; max: number }> = [];
  const placeMine = (req: MineRequest): boolean => {
    for (const spacing of [cfg.objects.spacing + 1, cfg.objects.spacing, 1]) {
      const cand: Array<{ e: number; b: number; s: number }> = [];
      for (let e = 0; e < g.n; e++) {
        if (!req.zones.includes(at(st.zone, e))) continue;
        const c = at(st.cost, e);
        if (!(c >= req.minCost && c <= req.maxCost)) continue;
        if (
          req.minRoadCost !== undefined &&
          !(at(roadCost, e) > req.minRoadCost)
        )
          continue;
        const x = g.x(e);
        const y = g.y(e);
        if (x < 1) continue;
        const b = g.idx(x - 1, y);
        if (!free(e) || !free(b)) continue;
        if (!spaced(e, spacing) || !spaced(b, spacing)) continue;
        let nest = 0;
        for (const j of g.around(b, N8))
          if (j !== e && !isWalkable(st, j)) nest++;
        let open = 0;
        for (const j of g.around(e, N8)) if (j !== b && free(j)) open++;
        if (open < 3) continue;
        cand.push({ e, b, s: Math.min(nest, 4) + rng.float(0, 2.5) });
      }
      cand.sort((p, q) => q.s - p.s || p.e - q.e);
      const before = countReach(st);
      for (const c of cand.slice(0, 12)) {
        const obj: MapObject = {
          id: nextId(`mine-${req.resource}`),
          kind: "mine",
          x: g.x(c.e),
          y: g.y(c.e),
          footprint: { w: 2, h: 1 },
          blocked: [[g.x(c.b), g.y(c.b)]],
          data: { resource: req.resource },
        };
        commit(st, obj);
        let ok = countReach(st) >= before - 1;
        // Footprints lengthen detours: earlier "within N days" promises
        // (and this one) must still hold.
        if (ok && (limits.length > 0 || Number.isFinite(req.maxCost))) {
          const now = movementCost(st, st.townAt.start);
          ok =
            at(now, c.e) <= req.maxCost &&
            limits.every((l) => at(now, l.cell) <= l.max);
        }
        let gc = -1;
        if (ok && req.guard) {
          gc = guardCell(c.e);
          ok = gc >= 0;
        }
        if (!ok) {
          uncommit(st, obj);
          counters.set(
            `mine-${req.resource}`,
            (counters.get(`mine-${req.resource}`) ?? 1) - 1,
          );
          continue;
        }
        if (Number.isFinite(req.maxCost)) {
          limits.push({ cell: c.e, max: req.maxCost });
        }
        if (req.guard) {
          st.occupied[gc] = 1;
          guardReqs.push({
            cell: gc,
            guards: obj.id,
            grade: req.guard,
            at: c.e,
            minRing: req.minRing ?? 0,
          });
        }
        return true;
      }
    }
    return false;
  };

  const tryMine = (...reqs: MineRequest[]): void => {
    for (const r of reqs) if (placeMine(r)) return;
    const r = reqs[0];
    if (r)
      report.skipped.push(`mine ${r.resource} in zones ${r.zones.join(",")}`);
  };

  // Start zone: two sawmills, a lightly guarded ore pit, a guarded gold mine.
  // A margin: footprints placed later can lengthen the trip a little.
  tryMine(
    {
      resource: "wood",
      zones: [start],
      minCost: 300,
      maxCost: 0.85 * day,
      guard: null,
    },
    { resource: "wood", zones: [start], minCost: 0, maxCost: day, guard: null },
  );
  tryMine({
    resource: "wood",
    zones: [start],
    minCost: 300,
    maxCost: 2 * day,
    guard: null,
  });
  // A margin: footprints placed later can lengthen the trip a little.
  tryMine(
    {
      resource: "ore",
      zones: [start],
      minCost: 300,
      maxCost: 0.85 * day,
      guard: "light",
    },
    {
      resource: "ore",
      zones: [start],
      minCost: 0,
      maxCost: day,
      guard: "light",
    },
  );
  tryMine(
    {
      resource: "gold",
      zones: [start],
      minCost: day,
      maxCost: Infinity,
      guard: "valuable",
      minRing: 1,
    },
    {
      resource: "gold",
      zones: [start, ...nearStart],
      minCost: day * 0.7,
      maxCost: Infinity,
      guard: "valuable",
      minRing: 1,
    },
  );

  // Essence: exactly one spring within two days, the rest farther out.
  const springs = rng.int(...cfg.objects.essenceSprings);
  tryMine(
    // A margin: footprints placed later can lengthen the trip a little.
    {
      resource: "essence",
      zones: nearStart,
      minCost: day,
      maxCost: 1.8 * day,
      guard: "valuable",
    },
    {
      resource: "essence",
      zones: [start],
      minCost: day * 0.6,
      maxCost: 1.8 * day,
      guard: "valuable",
    },
    {
      resource: "essence",
      zones: st.zones.map((z) => z.id),
      minCost: 0,
      maxCost: 2 * day,
      guard: "valuable",
    },
  );
  const farZones = rng.shuffle([...middles, enemy]);
  for (let k = 1; k < springs; k++) {
    const z = farZones[(k - 1) % farZones.length] ?? enemy;
    tryMine(
      // Roads built later must not bring it within two days.
      {
        resource: "essence",
        zones: [z],
        minCost: 0,
        maxCost: Infinity,
        minRoadCost: 2 * day,
        guard: "valuable",
      },
      {
        resource: "essence",
        zones: [...middles, enemy],
        minCost: 0,
        maxCost: Infinity,
        minRoadCost: 2 * day,
        guard: "valuable",
      },
      {
        resource: "essence",
        zones: [...middles, enemy],
        minCost: 2.4 * day,
        maxCost: Infinity,
        guard: "valuable",
      },
    );
  }

  // Middle zones: a sawmill and a mix; the enemy zone: gold and ore.
  for (const m of middles) {
    const n = rng.int(...cfg.objects.middleMines);
    const kinds: ResourceId[] = ["wood"];
    while (kinds.length < n) {
      kinds.push(
        rng.weighted<ResourceId>(["ore", "gold", "wood"], [2, 1.2, 1]),
      );
    }
    for (const r of kinds) {
      const req: MineRequest = {
        resource: r,
        zones: [m],
        minCost: 0,
        maxCost: Infinity,
        guard: r === "gold" ? "valuable" : "normal",
      };
      tryMine(req, { ...req, zones: middles });
    }
  }
  tryMine({
    resource: "gold",
    zones: [enemy],
    minCost: 0,
    maxCost: Infinity,
    guard: "valuable",
  });
  tryMine({
    resource: "ore",
    zones: [enemy],
    minCost: 0,
    maxCost: Infinity,
    guard: "normal",
  });

  buildRoads(st);
  placePickups(st, rng, free, spaced, guardCell, guardReqs, nextId, report);

  // Guards: passes, then the requests, sized by distance after roads.
  st.cost = movementCost(st, st.townAt.start);
  const grng = stageRng(st, "guards");
  for (const p of st.passes) {
    if (at(st.occupied, p.cell)) continue;
    st.occupied[p.cell] = 1;
    guardReqs.push({
      cell: p.cell,
      guards: "pass",
      grade: "normal",
      at: p.cell,
      minRing: 0,
    });
  }
  for (const r of guardReqs) {
    const c = at(st.cost, r.at);
    const ring = Math.max(r.minRing, Number.isFinite(c) ? ringOf(c) : 3);
    const s = sizeGuard(grng, ring, r.grade);
    const obj: MapObject = {
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
        guards: r.guards,
      },
    };
    st.objects.push(obj);
  }
  return report;
}

// ---------------------------------------------------------------------------
// Roads

function buildRoads(st: GenState): void {
  const { g } = st;
  const wobble = noiseField(g, 4, stageSalt(st, "road-wobble"), 2);
  const mark = (path: number[] | undefined): void => {
    if (path) for (const i of path) st.road[i] = 1;
  };
  mark(roadPath(st, [st.townAt.start], (i) => i === st.townAt.enemy, wobble));
  const mines = st.objects
    .filter((o) => o.kind === "mine")
    .map((o) => g.idx(o.x, o.y))
    .sort((a, b) => at(st.cost, a) - at(st.cost, b) || a - b);
  for (const e of mines) {
    const path = roadPath(
      st,
      [e],
      (i) => at(st.road, i) === 1,
      wobble,
      st.cfg.roads.maxSpur,
    );
    mark(path);
  }
}

// ---------------------------------------------------------------------------
// Pickups

function placePickups(
  st: GenState,
  rng: Rng,
  free: (i: number) => boolean,
  spaced: (i: number, r: number) => boolean,
  guardCell: (e: number) => number,
  guardReqs: GuardRequest[],
  nextId: (prefix: string) => string,
  report: PlacementReport,
): void {
  const { g, cfg } = st;
  const oc = cfg.objects;
  const day = cfg.movement.day;
  const nearRoad = (i: number): boolean =>
    at(st.road, i) === 1 || g.around(i, N8).some((j) => at(st.road, j) === 1);

  const place = (
    kind: ResourceId | "chest",
    ok: (i: number) => boolean,
    required: boolean,
  ): boolean => {
    const cand: Array<{ i: number; s: number }> = [];
    // Strict first (off the road, spaced out), then relaxed.
    for (const strict of [true, false]) {
      for (let i = 0; i < g.n; i++) {
        if (!free(i) || !ok(i)) continue;
        if (
          strict
            ? nearRoad(i) || !spaced(i, 2)
            : at(st.road, i) === 1 || !spaced(i, 1)
        ) {
          continue;
        }
        let nook = 0;
        for (const j of g.around(i, N8)) if (!isWalkable(st, j)) nook++;
        if (nook > 5) continue;
        if (kind === "chest" && guardCell(i) < 0) continue;
        cand.push({ i, s: Math.min(nook, 3) + rng.float(0, 3) });
      }
      if (cand.length > 0 || !required) break;
    }
    if (cand.length === 0) {
      if (required) report.skipped.push(`pickup ${kind} near the town`);
      return false;
    }
    cand.sort((p, q) => q.s - p.s || p.i - q.i);
    const pick = cand[Math.min(cand.length - 1, rng.int(0, 3))] as {
      i: number;
    };
    const i = pick.i;
    const amount =
      kind === "chest"
        ? oc.chest.gold
        : kind === "gold"
          ? rng.int(oc.amounts.gold[0] / 100, oc.amounts.gold[1] / 100) * 100
          : rng.int(...oc.amounts[kind]);
    const obj: MapObject = {
      id: nextId(kind === "chest" ? "chest" : `pickup-${kind}`),
      kind: "pickup",
      x: g.x(i),
      y: g.y(i),
      footprint: { w: 1, h: 1 },
      blocked: [],
      data:
        kind === "chest"
          ? { resource: "gold", amount, chest: true, xp: oc.chest.xp }
          : { resource: kind, amount },
    };
    st.objects.push(obj);
    st.occupied[i] = 1;
    if (kind === "chest") {
      const gc = guardCell(i);
      if (gc >= 0) {
        st.occupied[gc] = 1;
        guardReqs.push({
          cell: gc,
          guards: obj.id,
          grade: "valuable",
          at: i,
          minRing: 0,
        });
      }
    }
    return true;
  };

  const kinds: Array<ResourceId | "chest"> = [
    "wood",
    "ore",
    "essence",
    "gold",
    "chest",
  ];
  // Start region: within one day of the town.
  for (const k of kinds) {
    const n = rng.int(...oc.startPickups[k]);
    for (let c = 0; c < n; c++)
      place(k, (i) => at(st.cost, i) <= 0.9 * day, true);
  }
  // Everywhere else, by open area per zone.
  for (const z of st.zones) {
    let open = 0;
    for (let i = 0; i < g.n; i++) {
      if (at(st.zone, i) === z.id && isWalkable(st, i)) open++;
    }
    const n = Math.round((open * oc.pickupDensity) / 100);
    const weights = kinds.map((k) => oc.pickupWeights[k]);
    for (let c = 0; c < n; c++) {
      const k = rng.weighted(kinds, weights);
      place(k, (i) => at(st.zone, i) === z.id && at(st.cost, i) > day, false);
    }
  }
}
