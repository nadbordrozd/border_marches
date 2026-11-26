/**
 * Ponds in clearings (bead bzc.96, docs/design/MAP_COMPOSITION.md): "if
 * there is a big clearing between the mountains and forests, there can be
 * a pond or some other decoration".
 *
 * After the clean-up, before the objects: in each zone outside the starts,
 * the widest open ground (its clearing: farthest from every obstacle,
 * water, corridor, pass and town yard) gets a small pond in its middle on
 * some maps, with a ring of open ground left round it, so every way across
 * the clearing goes round the pond. Clearings too narrow for a pond and its
 * ring are left as they are.
 *
 * Its own random stream; with `fields.enabled` off nothing changes.
 */
import { hashInts } from "../../rng.ts";
import { N4, chamferDistance } from "./grid.ts";
import { reachable } from "./paths.ts";
import {
  T,
  corridorMask,
  homeCell,
  isOpen,
  isWalkable,
  stageRng,
  stageSalt,
} from "./state.ts";
import type { GenState } from "./state.ts";

/** What the stage did (for tests and the metrics script). */
export interface FieldReport {
  /** Ponds put in clearings. */
  ponds: number;
  /** Water cells they took. */
  cells: number;
}

export function fillFields(st: GenState): FieldReport {
  const report: FieldReport = { ponds: 0, cells: 0 };
  const { g, cfg } = st;
  const fc = cfg.fields;
  if (!fc.enabled) return report;
  const home = homeCell(st);
  if (home < 0) return report;
  const rng = stageRng(st, "fields");
  const salt = stageSalt(st, "field-shape");
  // Pass and gap corridors, and the ground round a pass (its guard's).
  const corridor = corridorMask(st);
  const busyWay = new Uint8Array(g.n);
  for (const p of st.passes) {
    for (const i of p.cells) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (g.inside(g.x(i) + dx, g.y(i) + dy))
            busyWay[g.idx(g.x(i) + dx, g.y(i) + dy)] = 1;
        }
      }
    }
  }
  for (let i = 0; i < g.n; i++) if (corridor[i] === 1) busyWay[i] = 1;
  const towns = st.towns.map((t) => t.cell);
  const busy = (i: number): boolean =>
    !isOpen(st, i) ||
    busyWay[i] === 1 ||
    st.occupied[i] === 1 ||
    st.spine[i] === 1 ||
    towns.some((t) => g.cheb(t, i) <= fc.townGap);
  const { dist } = chamferDistance(g, busy);
  /** Distance to busy ground, the map's rim counting as busy. */
  const room = (i: number): number =>
    Math.min(dist[i] ?? 0, g.x(i) + 1, g.y(i) + 1, g.w - g.x(i), g.h - g.y(i));
  /** Land regions round a pond keep their least size (terrain.minRegion). */
  const regionsHold = (pond: ReadonlySet<number>): boolean => {
    for (const p of pond) {
      for (const s of g.around(p, N4)) {
        if (pond.has(s)) continue;
        const t = st.terrain[s] ?? 0;
        if (t === T.water) continue;
        const seen = new Set<number>([s]);
        const stack = [s];
        while (stack.length > 0 && seen.size < cfg.terrain.minRegion) {
          const i = stack.pop() as number;
          for (const j of g.around(i, N4)) {
            if (!seen.has(j) && !pond.has(j) && st.terrain[j] === t) {
              seen.add(j);
              stack.push(j);
            }
          }
        }
        if (seen.size < cfg.terrain.minRegion) return false;
      }
    }
    return true;
  };
  for (const z of st.zones) {
    if (z.role === "start") continue;
    // Drawn for every zone, so one zone's clearing never shifts another's.
    const roll = rng.chance(fc.chance);
    const size = rng.int(fc.pondCells[0], fc.pondCells[1]);
    let best = -1;
    let bestD = 0;
    for (let i = 0; i < g.n; i++) {
      if (st.zone[i] !== z.id || busy(i)) continue;
      // Ties broken by a hash, so equal clearings do not favour the top left.
      const d = room(i) + (hashInts(i, salt) % 1000) / 20000;
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (!roll || best < 0 || bestD < fc.pond) continue;
    // The pond stays inside the clearing (it may lean on a wood or a range;
    // the reach check below keeps every way round it).
    const reach = bestD - 0.5;
    const pond = grow(
      st,
      best,
      size,
      (j) => st.zone[j] === z.id && !busy(j) && g.dist(j, best) < reach,
      salt,
    );
    if (pond.size < cfg.water.minBody || !regionsHold(pond)) continue;
    const before = reachable(st, home);
    const shut = (i: number): boolean => isWalkable(st, i) && !pond.has(i);
    const after = reachable(st, home, shut);
    let ok = true;
    for (let i = 0; i < g.n && ok; i++) {
      if (before[i] === 1 && shut(i) && after[i] !== 1) ok = false;
    }
    if (!ok) continue;
    for (const i of pond) st.terrain[i] = T.water;
    report.ponds++;
    report.cells += pond.size;
  }
  return report;
}

/**
 * Room for the big sites (bead bzc.96): "reserve room for rare multi-cell
 * sites before the general fill". In each wild zone (middle, neutral town,
 * the Hold), before the borders, rooms and clusters grow, one open disc per
 * `plazaArea` cells is kept open: the zone's deepest ground, away from its
 * town and from the other discs. The banks, libraries and the desert's and
 * winter's sites, placed first, find their room there. Off (radius 0) for
 * the named maps.
 */
export function reservePlazas(st: GenState): void {
  const { g, cfg } = st;
  const fc = cfg.fields;
  if (!fc.enabled || fc.plazaRadius <= 0) return;
  const r = fc.plazaRadius;
  for (const z of st.zones) {
    if (z.role === "start") continue;
    const { dist } = chamferDistance(
      g,
      (i) => st.zone[i] !== z.id || st.terrain[i] === T.water,
    );
    let cells = 0;
    for (let i = 0; i < g.n; i++) if (st.zone[i] === z.id) cells++;
    const want = Math.max(1, Math.round(cells / fc.plazaArea));
    const centres: number[] = [];
    for (let k = 0; k < want; k++) {
      let best = -1;
      let bestS = -Infinity;
      for (let i = 0; i < g.n; i++) {
        if (st.zone[i] !== z.id || st.terrain[i] === T.water) continue;
        const d = dist[i] ?? 0;
        if (d < r + 1) continue;
        // Away from the town (its own yard) and the other discs.
        const town = Math.min(
          Infinity,
          ...st.towns.map((t) => g.dist(t.cell, i)),
        );
        if (town < r + cfg.objects.townClearance + 4) continue;
        const other = Math.min(Infinity, ...centres.map((c) => g.dist(c, i)));
        if (other < 2 * r + 4) continue;
        const s = Math.min(d, 6) + Math.min(other, 12) / 4;
        if (s > bestS || (s === bestS && i < best)) {
          bestS = s;
          best = i;
        }
      }
      if (best < 0) break;
      centres.push(best);
      for (let i = 0; i < g.n; i++) {
        if (g.dist(i, best) <= r && st.terrain[i] !== T.water) {
          st.plaza[i] = 1;
          st.keepOpen[i] = 1;
        }
      }
    }
  }
}

/** A round, slightly lumpy blob of up to `size` cells grown from `seed`. */
function grow(
  st: GenState,
  seed: number,
  size: number,
  ok: (j: number) => boolean,
  salt: number,
): Set<number> {
  const { g } = st;
  const score = (j: number): number =>
    g.dist(j, seed) + ((hashInts(j, salt) % 1000) / 1000) * 0.9;
  const out = new Set<number>([seed]);
  while (out.size < size) {
    let best = -1;
    let bestS = Infinity;
    for (const i of out) {
      for (const j of g.around(i, N4)) {
        if (out.has(j) || !ok(j)) continue;
        const s = score(j);
        if (s < bestS || (s === bestS && j < best)) {
          bestS = s;
          best = j;
        }
      }
    }
    if (best < 0) break;
    out.add(best);
  }
  return out;
}
