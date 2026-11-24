/**
 * Ground terrain: each zone's main terrain with patches of its secondary one.
 * Patch borders come from smooth noise, are rounded off by a majority filter,
 * and every 4-connected region below the minimum size is merged into its
 * most common neighbour, so there are no specks and no straight lines.
 */
import { at, N4, N8, noiseField, quantile } from "./grid.ts";
import { T, stageRng, stageSalt } from "./state.ts";
import type { GenState } from "./state.ts";

export function paintTerrain(st: GenState): void {
  const { g, cfg } = st;
  const rng = stageRng(st, "terrain");
  const patch = noiseField(
    g,
    cfg.terrain.patchScale,
    stageSalt(st, "patches"),
    3,
  );
  const byZone: number[][] = st.zones.map(() => []);
  for (let i = 0; i < g.n; i++) {
    if ((st.terrain[i] ?? 0) === T.water) continue;
    byZone[st.zone[i] ?? 0]?.push(i);
  }
  for (const z of st.zones) {
    const cells = byZone[z.id] ?? [];
    const share = rng.float(...cfg.terrain.secondaryShare);
    const cut = quantile(patch, cells, 1 - share);
    for (const i of cells) {
      st.terrain[i] = (patch[i] ?? 0) > cut ? T[z.secondary] : T[z.main];
    }
  }
  smoothTerrain(st, cfg.terrain.smoothRounds);
  mergeSmallRegions(st);
}

/** Majority filter over land cells (water is fixed). */
export function smoothTerrain(st: GenState, rounds: number): void {
  const { g } = st;
  const tally = new Int32Array(6);
  for (let r = 0; r < rounds; r++) {
    const next = st.terrain.slice();
    for (let i = 0; i < g.n; i++) {
      const own = st.terrain[i] ?? 0;
      if (own === T.water) continue;
      tally.fill(0);
      for (const j of g.around(i, N8)) {
        const t = st.terrain[j] ?? 0;
        tally[t] = (tally[t] ?? 0) + 1;
      }
      let best = own;
      for (let t = 0; t < T.water; t++) {
        if ((tally[t] ?? 0) > (tally[best] ?? 0)) best = t;
      }
      if (best !== own && (tally[best] ?? 0) >= 5 && (tally[own] ?? 0) <= 3) {
        next[i] = best;
      }
    }
    st.terrain.set(next);
  }
}

/** Merge land regions smaller than the minimum into a neighbouring terrain. */
export function mergeSmallRegions(st: GenState): void {
  const { g, cfg } = st;
  const tally = new Int32Array(6);
  for (let round = 0; round < 8; round++) {
    let changed = false;
    // Regions are same-terrain 4-connected pieces of land.
    const label = new Int32Array(g.n).fill(-1);
    const sizes: number[] = [];
    const members: number[][] = [];
    for (let s = 0; s < g.n; s++) {
      if ((label[s] ?? 0) !== -1 || (st.terrain[s] ?? 0) === T.water) continue;
      const t = st.terrain[s] ?? 0;
      const id = sizes.length;
      const stack = [s];
      const list: number[] = [];
      label[s] = id;
      while (stack.length > 0) {
        const i = stack.pop() as number;
        list.push(i);
        for (const j of g.around(i, N4)) {
          if ((label[j] ?? 0) === -1 && (st.terrain[j] ?? 0) === t) {
            label[j] = id;
            stack.push(j);
          }
        }
      }
      sizes.push(list.length);
      members.push(list);
    }
    members.forEach((list, id) => {
      if (list.length >= cfg.terrain.minRegion) return;
      const own = at(st.terrain, list[0] ?? 0);
      tally.fill(0);
      for (const i of list) {
        for (const j of g.around(i, N4)) {
          if ((label[j] ?? 0) === id) continue;
          const t = st.terrain[j] ?? 0;
          if (t !== T.water && t !== own) tally[t] = (tally[t] ?? 0) + 1;
        }
      }
      let best = -1;
      for (let t = 0; t < T.water; t++) {
        if (
          (tally[t] ?? 0) > 0 &&
          (best < 0 || (tally[t] ?? 0) > (tally[best] ?? 0))
        ) {
          best = t;
        }
      }
      if (best < 0) return;
      for (const i of list) st.terrain[i] = best;
      changed = true;
    });
    if (!changed) break;
  }
}
