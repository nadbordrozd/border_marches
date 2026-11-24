/**
 * Ragged outlines (bead xaj.21): no range edge and no ground edge runs
 * ruler-straight for more than a few cells.
 *
 * The orchestrator's review of bead xaj.20 found ranges along zone borders
 * whose outer side ran straight down a cell column for eight cells and more,
 * with the ground edge beside them just as straight: the square grid showing
 * through the landscape. This pass walks every straight run of a boundary
 * (between Mountain and open ground, or between two grounds on open land)
 * and breaks each run longer than `maxRun` cells with a two-cell feature
 * every three or four cells:
 *
 * - a range edge gets a BUMP (the two open cells in front of the run become
 *   Mountain: with the two rock cells behind them they form a 2x2 block, so
 *   the smallest-mountain rule holds) or a NOTCH (two rock cells of the run
 *   become open ground, only where they are not spine cells, so the border
 *   seal holds, and where every rock cell round them still lies in a 2x2
 *   block of Mountain);
 * - a ground edge gets a tongue: the two cells in front of the run take the
 *   ground behind them.
 *
 * A bump never touches another obstacle, a pass corridor, a kept-open cell,
 * a town yard or an object, so it cannot close a corridor; the caller still
 * resolves pockets after it.
 */
import { at, N8 } from "./grid.ts";
import { O, T, corridorMask, isOpen, stageRng, townCells } from "./state.ts";
import type { GenState } from "./state.ts";
import { inMountainBlock } from "./clusters.ts";

/** One straight run of a boundary: rock (or ground A) cells and the cells in front. */
interface Run {
  inner: number[];
  outer: number[];
  /** Step from an inner cell to its outer cell. */
  dx: number;
  dy: number;
}

/**
 * The straight runs of a boundary longer than `min` cells. `side(i, j)`
 * returns a label for the boundary between neighbouring cells i (inner) and
 * j (outer), or null where there is none; a run continues while the label
 * stays the same.
 */
function straightRuns(
  st: GenState,
  min: number,
  side: (i: number, j: number) => string | null,
): Run[] {
  const { g } = st;
  const out: Run[] = [];
  // Boundaries facing east/west lie along columns, north/south along rows.
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const vertical = dx !== 0;
    const lines = vertical ? g.w : g.h;
    const along = vertical ? g.h : g.w;
    for (let l = 0; l < lines; l++) {
      let cur: Run | undefined;
      let label: string | null = null;
      for (let k = 0; k <= along; k++) {
        let lab: string | null = null;
        let i = -1;
        let j = -1;
        if (k < along) {
          const x = vertical ? l : k;
          const y = vertical ? k : l;
          if (g.inside(x + dx, y + dy)) {
            i = g.idx(x, y);
            j = g.idx(x + dx, y + dy);
            lab = side(i, j);
          }
        }
        if (lab !== null && lab === label && cur) {
          cur.inner.push(i);
          cur.outer.push(j);
        } else {
          if (cur && cur.inner.length > min) out.push(cur);
          cur = lab === null ? undefined : { inner: [i], outer: [j], dx, dy };
        }
        label = lab;
      }
    }
  }
  return out;
}

/** Start offsets of the two-cell features that break a run of `n` cells. */
function breaks(n: number, maxRun: number, roll: () => number): number[] {
  const out: number[] = [];
  let s = 1 + Math.floor(roll() * Math.min(maxRun, n - 2));
  while (s + 1 < n) {
    out.push(s);
    s += 2 + 1 + Math.floor(roll() * (maxRun - 1));
  }
  return out;
}

export function wobbleEdges(st: GenState): number {
  const { g, cfg } = st;
  const maxRun = cfg.wobble.maxRun;
  const rng = stageRng(st, "wobble");
  const towns = townCells(st);
  const corridor = corridorMask(st);
  const mountain = (i: number): boolean => (st.obstacle[i] ?? 0) === O.mountain;
  const quiet = (j: number): boolean =>
    (corridor[j] ?? 0) === 0 &&
    (st.keepOpen[j] ?? 0) === 0 &&
    (st.occupied[j] ?? 0) === 0 &&
    (st.objBlocked[j] ?? 0) === 0 &&
    towns.every((t) => g.cheb(t, j) > cfg.clusters.townClearance + 1);
  let changed = 0;

  for (let round = 0; round < cfg.wobble.rounds; round++) {
    // 1. Range edges.
    const runs = straightRuns(st, maxRun, (i, j) =>
      mountain(i) && isOpen(st, j)
        ? "m"
        : mountain(i) && (st.obstacle[j] ?? 0) === O.forest
          ? "f"
          : null,
    );
    for (const run of runs) {
      for (const s of breaks(run.inner.length, maxRun, () => rng.next())) {
        const inner = [run.inner[s], run.inner[s + 1]] as [number, number];
        const outer = [run.outer[s], run.outer[s + 1]] as [number, number];
        // Against a forest belt both features trade rock for trees: both
        // block, so neither seals nor opens anything.
        const wood = outer.every((j) => (st.obstacle[j] ?? 0) === O.forest);
        const tryBump = (): boolean => {
          if (wood) {
            if (!outer.every((j) => (st.occupied[j] ?? 0) === 0)) return false;
            for (const j of outer) st.obstacle[j] = O.mountain;
            return true;
          }
          if (!outer.every((j) => isOpen(st, j) && quiet(j))) return false;
          // Only rock of this range and open ground round the bump.
          for (const j of outer)
            for (const k of g.around(j, N8)) {
              if (inner.includes(k) || outer.includes(k)) continue;
              // Rock on the run's own line is the range itself.
              const onLine =
                run.dx !== 0
                  ? g.x(k) === g.x(inner[0])
                  : g.y(k) === g.y(inner[0]);
              if (mountain(k) && onLine) continue;
              if (!isOpen(st, k)) return false;
            }
          for (const j of outer) st.obstacle[j] = O.mountain;
          return true;
        };
        const tryNotch = (): boolean => {
          if (!wood) {
            if (!inner.every((i) => (st.spine[i] ?? 0) === 0)) return false;
            if (!outer.every((j) => isOpen(st, j))) return false;
          }
          for (const i of inner) st.obstacle[i] = wood ? O.forest : O.none;
          // Every rock cell round the notch must still lie in a 2x2 block.
          const ok = inner.every((i) =>
            g
              .around(i, N8)
              .every((k) => !mountain(k) || inMountainBlock(st, k)),
          );
          if (!ok) for (const i of inner) st.obstacle[i] = O.mountain;
          return ok;
        };
        const notchFirst = rng.chance(cfg.wobble.notchShare);
        if (notchFirst ? tryNotch() || tryBump() : tryBump() || tryNotch())
          changed++;
      }
    }

    // 2. Ground edges on open land (under rock they do not show).
    const land = (i: number): boolean =>
      (st.terrain[i] ?? 0) !== T.water && !mountain(i);
    const groundRuns = straightRuns(st, maxRun, (i, j) =>
      land(i) && land(j) && (st.terrain[i] ?? 0) !== (st.terrain[j] ?? 0)
        ? `${st.terrain[i] ?? 0}>${st.terrain[j] ?? 0}`
        : null,
    );
    for (const run of groundRuns) {
      const own = at(st.terrain, run.inner[0] as number);
      for (const s of breaks(run.inner.length, maxRun, () => rng.next())) {
        const outer = [run.outer[s], run.outer[s + 1]] as number[];
        if (!outer.every((j) => land(j) && (st.terrain[j] ?? 0) !== own))
          continue;
        for (const j of outer) st.terrain[j] = own;
        changed++;
      }
    }
  }
  return changed;
}
