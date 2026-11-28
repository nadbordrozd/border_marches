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
 * its centre instead. On a naval map (bead bzc.149) a boarding step gets
 * an anchor and a landing that ends the day a ring labelled "lands: day
 * ends"; a Lily Road step on water (bead bzc.159) gets a lily pad under
 * its markers. Pure (no canvas), so the layout is unit-tested.
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
  /** Boards a ship (bead bzc.149): an anchor. */
  readonly board?: boolean;
  /** Lands from a ship and that ends the day: a ring and its label. */
  readonly landEndsDay?: boolean;
  /** On foot over water on Lily Road's pads (bead bzc.159): a lily pad. */
  readonly lily?: boolean;
}

/** The label of a day-ending landing (NAVAL 2.3). */
export const LANDING_LABEL = "lands: day ends";

export interface PathMarker {
  /** Marker centre in cell units (a cell centre is x + 0.5). */
  readonly cx: number;
  readonly cy: number;
  readonly kind: "arrow" | "cross" | "visit" | "anchor" | "landing" | "lily";
  /**
   * Arrow direction in eighths of a turn, 0 = east, 2 = south; a lily
   * pad's variant ({@link lilyVariant}).
   */
  readonly dir: number;
  readonly reachable: boolean;
  /** The path step this marker belongs to (fog check). */
  readonly cell: { readonly x: number; readonly y: number };
  /** Words drawn beside the marker (a day-ending landing). */
  readonly label?: string;
}

/**
 * A lily pad's variant on a cell, 0-7: its turn in eighths (the `dir` of
 * its marker); odd variants carry a flower. Fixed per cell, so a pad does
 * not spin while the path is re-planned.
 */
export function lilyVariant(x: number, y: number): number {
  return (((x * 3 + y * 5) % 8) + 8) % 8;
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
    // The pad first, so the arrows that cross it are drawn over it.
    if (step.lily === true)
      out.push({
        cx: step.x + 0.5,
        cy: step.y + 0.5,
        kind: "lily",
        dir: lilyVariant(step.x, step.y),
        reachable: step.reachable,
        cell,
      });
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
        step.visit === true
          ? "visit"
          : step.board === true
            ? "anchor"
            : step.landEndsDay === true
              ? "landing"
              : next === undefined
                ? "cross"
                : "arrow",
      dir:
        next === undefined ? 0 : stepDirection(step.x, step.y, next.x, next.y),
      reachable: step.reachable,
      cell,
      ...(step.landEndsDay === true ? { label: LANDING_LABEL } : {}),
    });
    prev = cell;
  });
  return out;
}
