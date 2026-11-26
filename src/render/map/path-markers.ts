/**
 * Where the planned-path markers go (bead border_marches-50f): three
 * markers per cell, so the route reads as a dense line of arrows.
 *
 * Every step of the path gets a marker at its cell centre (an arrow toward
 * the next step, or the destination cross on the last one) and
 * MARKERS_PER_STEP - 1 arrows evenly spaced along the segment that enters
 * it, pointing along that segment. A marker takes the colour of the step
 * it leads to: reachable today or later. A step standing on a building
 * that is not the target (bead bzc.107: the only way on) gets a ring at
 * its centre instead. Pure (no canvas), so the layout is unit-tested.
 */

/** Markers per step of the path, the cell-centre one included. */
export const MARKERS_PER_STEP = 3;

export interface PathMarkerStep {
  readonly x: number;
  readonly y: number;
  /** Reachable with today's movement (green) or later (red). */
  readonly reachable: boolean;
  /** Stands on a building that is not the target (bead bzc.107). */
  readonly visit?: boolean;
}

export interface PathMarker {
  /** Marker centre in cell units (a cell centre is x + 0.5). */
  readonly cx: number;
  readonly cy: number;
  readonly kind: "arrow" | "cross" | "visit";
  /** Arrow direction in eighths of a turn, 0 = east, 2 = south. */
  readonly dir: number;
  readonly reachable: boolean;
  /** The path step this marker belongs to (fog check). */
  readonly cell: { readonly x: number; readonly y: number };
}

/** The 8-way direction from one cell toward another (0 = east, 2 = south). */
export function stepDirection(
  fx: number,
  fy: number,
  tx: number,
  ty: number,
): number {
  const angle = Math.atan2(ty - fy, tx - fx);
  return ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
}

/**
 * The markers of a path, in walking order. `from` is the cell the walk
 * starts on (the hero's); without it the first step has no lead-in arrows.
 */
export function pathMarkers(
  steps: readonly PathMarkerStep[],
  from: { readonly x: number; readonly y: number } | null = null,
): PathMarker[] {
  const out: PathMarker[] = [];
  let prev = from;
  steps.forEach((step, i) => {
    const cell = { x: step.x, y: step.y };
    if (prev !== null && (prev.x !== step.x || prev.y !== step.y)) {
      const dir = stepDirection(prev.x, prev.y, step.x, step.y);
      for (let k = 1; k < MARKERS_PER_STEP; k++) {
        const t = k / MARKERS_PER_STEP;
        out.push({
          cx: prev.x + (step.x - prev.x) * t + 0.5,
          cy: prev.y + (step.y - prev.y) * t + 0.5,
          kind: "arrow",
          dir,
          reachable: step.reachable,
          cell,
        });
      }
    }
    const next = steps[i + 1];
    out.push({
      cx: step.x + 0.5,
      cy: step.y + 0.5,
      kind:
        step.visit === true ? "visit" : next === undefined ? "cross" : "arrow",
      dir:
        next === undefined ? 0 : stepDirection(step.x, step.y, next.x, next.y),
      reachable: step.reachable,
      cell,
    });
    prev = cell;
  });
  return out;
}
