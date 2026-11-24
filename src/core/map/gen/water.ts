/**
 * Water: an optional coast along part of one map edge and a few lakes.
 * Shapes come from noisy distance thresholds, then a majority filter rounds
 * them off and tiny bodies and islands are removed. Deep water is decided at
 * the end ({@link markDeep}): only water with no land among its 8 neighbours.
 */
import { at, components, fbm, N4, N8 } from "./grid.ts";
import { T, stageRng, stageSalt, townCells } from "./state.ts";
import type { GenState } from "./state.ts";

export function placeWater(st: GenState): void {
  const { g, cfg } = st;
  const wc = cfg.water;
  const rng = stageRng(st, "water");
  const water = new Uint8Array(g.n);
  const w = g.w;

  if (rng.chance(wc.coastChance)) {
    const edge = rng.int(0, 3);
    const len = rng.float(...wc.coastLength) * w;
    const centre = rng.float(len / 2 - w * 0.1, w - len / 2 + w * 0.1);
    const depth = rng.float(...wc.coastDepth);
    const salt = stageSalt(st, "coast");
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        // u runs along the edge, v is the distance from it.
        const [u, v] =
          edge === 0
            ? [x, y]
            : edge === 1
              ? [y, w - 1 - x]
              : edge === 2
                ? [w - 1 - x, g.h - 1 - y]
                : [g.h - 1 - y, x];
        const t = (u + 0.5 - centre) / (len / 2);
        const taper = Math.max(0, 1 - t * t);
        const n = fbm(x, y, 6, salt, 3) - 0.5;
        if (v + 0.5 < depth * Math.sqrt(taper) + n * 5) water[g.idx(x, y)] = 1;
      }
    }
  }

  const lakes = rng.int(...wc.lakes[st.size]);
  const towns = townCells(st);
  for (let k = 0; k < lakes; k++) {
    const r = rng.float(...wc.lakeRadius);
    // A lake sits inside one zone, away from its border and the towns.
    const options: number[] = [];
    for (let i = 0; i < g.n; i++) {
      const x = g.x(i);
      const y = g.y(i);
      if (x < r + 2 || y < r + 2 || x > w - r - 3 || y > g.h - r - 3) continue;
      if (towns.some((t) => g.dist(t, i) < r + wc.townClearance + 3)) continue;
      if (water[i] ?? 0) continue;
      const z = st.zone[i] ?? 0;
      let inside = true;
      for (let dy = -Math.ceil(r); dy <= Math.ceil(r) && inside; dy++) {
        for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (!g.inside(nx, ny) || at(st.zone, g.idx(nx, ny)) !== z) {
            inside = false;
            break;
          }
        }
      }
      if (inside) options.push(i);
    }
    if (options.length === 0) continue;
    const c = rng.pick(options);
    const ax = rng.float(0.75, 1.35);
    const ay = 1 / ax;
    const salt = stageSalt(st, `lake-${k}`);
    const cx = g.x(c);
    const cy = g.y(c);
    const reach = Math.ceil(r * 1.6) + 2;
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (!g.inside(x, y)) continue;
        const d = Math.hypot(dx / ax, dy / ay) / r;
        const n = fbm(x, y, Math.max(2, r), salt, 2) - 0.5;
        if (d + n * 1.1 < 1) water[g.idx(x, y)] = 1;
      }
    }
  }

  // Keep the towns dry.
  for (const t of towns) {
    for (let i = 0; i < g.n; i++) {
      if (g.cheb(i, t) <= wc.townClearance + 1) water[i] = 0;
    }
  }

  // Round off: majority of the 3x3 block (cells off the map do not vote).
  for (let round = 0; round < 2; round++) {
    const next = water.slice();
    for (let i = 0; i < g.n; i++) {
      let wet = water[i] ?? 0;
      let all = 1;
      for (const j of g.around(i, N8)) {
        wet += water[j] ?? 0;
        all++;
      }
      if (wet * 2 > all) next[i] = 1;
      else if (wet * 2 < all) next[i] = 0;
    }
    water.set(next);
  }
  for (const t of towns) {
    for (let i = 0; i < g.n; i++) {
      if (g.cheb(i, t) <= wc.townClearance) water[i] = 0;
    }
  }

  for (let i = 0; i < g.n; i++) if (water[i] ?? 0) st.terrain[i] = T.water;
  tidyWater(st);
}

/**
 * Remove water bodies smaller than the minimum and fill islands (land pieces
 * other than the main landmass) smaller than a few bodies' worth.
 */
export function tidyWater(st: GenState): void {
  const { g, cfg } = st;
  const wet = (i: number): boolean => (st.terrain[i] ?? 0) === T.water;
  const bodies = components(g, wet, 4);
  bodies.cells.forEach((cells) => {
    if (cells.length >= cfg.water.minBody) return;
    for (const i of cells) st.terrain[i] = landTerrainNear(st, i);
  });
  const land = components(g, (i) => !wet(i), 4);
  let main = 0;
  land.sizes.forEach((s, k) => {
    if (s > (land.sizes[main] ?? 0)) main = k;
  });
  land.cells.forEach((cells, k) => {
    if (k === main || cells.length >= cfg.water.minBody * 4) return;
    for (const i of cells) {
      st.terrain[i] = T.water;
      st.obstacle[i] = 0;
    }
  });
}

/** The zone's main terrain code for a cell that turns from water to land. */
export function landTerrainNear(st: GenState, i: number): number {
  for (const j of st.g.around(i, N4)) {
    const t = st.terrain[j] ?? 0;
    if (t !== T.water) return t;
  }
  const z = st.zones[st.zone[i] ?? 0];
  return z ? T[z.main] : T.grass;
}

/** Deep water: no land among the 8 neighbours (off-map counts as water). */
export function markDeep(st: GenState): void {
  const { g, cfg } = st;
  st.deep.fill(0);
  for (let i = 0; i < g.n; i++) {
    if ((st.terrain[i] ?? 0) !== T.water) continue;
    if (g.around(i, N8).every((j) => (st.terrain[j] ?? 0) === T.water)) {
      st.deep[i] = 1;
    }
  }
  const deep = components(g, (i) => (st.deep[i] ?? 0) === 1, 8);
  deep.cells.forEach((cells) => {
    if (cells.length < cfg.water.minDeep) for (const i of cells) st.deep[i] = 0;
  });
}
