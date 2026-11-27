/**
 * The Mystery Bag (bead bzc.105): a one-cell pickup that holds a
 * surprise artifact. Unlike a Loose Artifact, which lies on the map in full
 * view (drawn as its own icon), the bag's artifact stays hidden on the
 * map, on its hover card and in the walk messages until a hero opens it.
 *
 * The artifact is chosen deterministically from the map seed and the
 * object's id, so the same map always hides the same artifact:
 *
 * - The generator (bead bzc.110) or a map author places one with
 *   {@link mysteryItem}, which stores the artifact in `data.artifact` at
 *   creation; or places a bare `{ type: "mystery-bag" }` object, whose
 *   artifact {@link mysteryArtifactOf} derives on the visit from the same
 *   seed and id (the two agree).
 * - The rules (src/core/game/sites.ts) grant {@link mysteryArtifactOf}.
 *
 * Pool: wearable Trinkets or Wonders, never cursed, never a Marvel piece or
 * a Marvel (the surprise is always a fair one).
 */
import {
  ARTIFACT_LIST,
  GRADE_VALUES,
  HELD_ARTIFACTS,
  isCursed,
} from "../../data/artifacts.ts";
import { deriveSeed } from "../rng.ts";
import { leftOutOfLoot } from "./gen/contents.ts";
import type { GameMap, MapObject } from "./types.ts";

/** The catalogue type id (src/data/objectTypes.ts). */
export const MYSTERY_TYPE = "mystery-bag";

/** What a bag may hold: a Trinket (the default) or a Wonder. */
export type MysteryGrade = "trinket" | "wonder";

export const MYSTERY_GRADES: readonly MysteryGrade[] = ["trinket", "wonder"];

/** Whether a placed object is a Mystery Bag. */
export function isMystery(obj: MapObject): boolean {
  return obj.data["type"] === MYSTERY_TYPE;
}

/** The artifact ids a bag of `grade` may hold, in catalogue order. */
export function mysteryPool(grade: MysteryGrade): readonly string[] {
  return ARTIFACT_LIST.filter(
    (a) =>
      a.kind === "worn" &&
      a.grade === grade &&
      a.pieceOf === undefined &&
      !isCursed(a.id) &&
      !HELD_ARTIFACTS.has(a.id) &&
      !leftOutOfLoot(a.id),
  ).map((a) => a.id);
}

function gradeOf(value: unknown): MysteryGrade {
  return value === "wonder" ? "wonder" : "trinket";
}

/**
 * The artifact a bag with this id hides on a map of this seed: a pure
 * function of (seed, id, grade), independent of the order objects are
 * placed in.
 */
export function mysteryArtifact(
  seed: number,
  objectId: string,
  grade: MysteryGrade = "trinket",
): string {
  const pool = mysteryPool(grade);
  const fallback = pool.length > 0 ? pool : mysteryPool("trinket");
  const pick = deriveSeed(seed, "mystery-bag", objectId, grade);
  const id = fallback[pick % fallback.length];
  if (id === undefined) throw new Error("mystery bag: no artifacts");
  return id;
}

/**
 * The artifact a placed bag holds: its stored `data.artifact`, else the
 * one {@link mysteryArtifact} derives from the map seed, its id and its
 * `data.grade`.
 */
export function mysteryArtifactOf(
  map: Pick<GameMap, "seed">,
  obj: MapObject,
): string {
  const stored = obj.data["artifact"];
  if (typeof stored === "string" && stored !== "") return stored;
  return mysteryArtifact(map.seed, obj.id, gradeOf(obj.data["grade"]));
}

/** The gold-equivalent value of a bag of `grade` (the AI and fairness read it). */
export function mysteryValue(grade: MysteryGrade = "trinket"): number {
  return GRADE_VALUES[grade];
}

export interface MysteryItemOptions {
  /** Trinket (default) or Wonder. */
  readonly grade?: MysteryGrade;
  /** Extra data (e.g. a guard's bookkeeping); `type` and `artifact` win. */
  readonly data?: Record<string, unknown>;
}

/**
 * A Mystery Bag object at (x, y) (one cell, no blocked cells), its
 * artifact chosen from `map.seed` and `id` now and stored in
 * `data.artifact`. Push it into `map.objects`; the cell must be free,
 * passable open land like any pickup's.
 */
export function mysteryItem(
  map: Pick<GameMap, "seed">,
  id: string,
  x: number,
  y: number,
  options: MysteryItemOptions = {},
): MapObject {
  const grade = options.grade ?? "trinket";
  return {
    id,
    kind: "artifact",
    x,
    y,
    footprint: { w: 1, h: 1 },
    blocked: [],
    data: {
      value: mysteryValue(grade),
      ...options.data,
      type: MYSTERY_TYPE,
      grade,
      artifact: mysteryArtifact(map.seed, id, grade),
    },
  };
}
