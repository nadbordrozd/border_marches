/**
 * Art lookup for adventure-map object types (bead border_marches-bzc.16):
 * `artFor(type, variant)` gives the sprite to draw, where its foot stands and
 * whether it is a placeholder. The adventure-objects bead (bzc.13) places
 * objects; this module only answers what they look like.
 *
 * New studio sprites come from ./map-objects.ts. Types that already had art
 * reuse it: the four mines (sawmill, mined mountain, gold claim, essence
 * spring), the four resource pickups, the imported chest and wishing well.
 * A type without art (or an unknown id) gets the imported shrine flagged as
 * a placeholder; a buried type has no art at all (null).
 */
import { assetByKey, CELL_PX } from "./manifest.ts";
import type { ImageAsset, Point } from "./manifest.ts";
import {
  MAP_OBJECT_ASSETS,
  mapObjectType,
  REUSED_OBJECT_ART,
  type MapObjectSeat,
} from "./map-objects.ts";

export interface MapObjectArt {
  /** The type id asked for. */
  readonly type: string;
  /** The variant drawn ("" for a type's only look). */
  readonly variant: string;
  readonly asset: ImageAsset;
  /** The asset pixel that stands on the footprint's ground point. */
  readonly foot: Point;
  readonly seat: MapObjectSeat;
  /** True when the type has no art of its own yet. */
  readonly placeholder: boolean;
}

/**
 * Pixels between the footprint's bottom edge and the ground point: sites
 * stand just inside the footprint, pickups about mid-cell.
 */
export const SEAT_PX: Readonly<Record<MapObjectSeat, number>> = {
  site: 4,
  pickup: 22,
};

/** The placeholder: the imported roadside shrine. */
const PLACEHOLDER = { key: "shrine", foot: { x: 42, y: 60 } } as const;

interface Look {
  readonly variant: string;
  readonly asset: ImageAsset;
  readonly foot: Point;
}

const LOOKS: ReadonlyMap<string, readonly Look[]> = (() => {
  const looks = new Map<string, Look[]>();
  const add = (type: string, look: Look): void => {
    const list = looks.get(type) ?? [];
    list.push(look);
    looks.set(type, list);
  };
  for (const asset of MAP_OBJECT_ASSETS)
    add(asset.type, { variant: asset.variant, asset, foot: asset.foot });
  for (const { type, variant, key, foot } of REUSED_OBJECT_ART)
    add(type, { variant, asset: assetByKey(key), foot });
  return looks;
})();

/** The variants a type has art for, in catalogue order ("" = only look). */
export function artVariants(type: string): readonly string[] {
  return (LOOKS.get(type) ?? []).map((look) => look.variant);
}

/**
 * The art of an object type: the named variant if it has one, else the
 * type's first look; a placeholder for a type without art or an unknown id;
 * null for a buried type, which is never drawn.
 */
export function artFor(type: string, variant?: string): MapObjectArt | null {
  const info = mapObjectType(type);
  if (info?.hidden === true) return null;
  const seat = info?.seat ?? "site";
  const looks = LOOKS.get(type) ?? [];
  const look =
    looks.find((candidate) => candidate.variant === variant) ?? looks[0];
  if (look === undefined)
    return {
      type,
      variant: "",
      asset: assetByKey(PLACEHOLDER.key),
      foot: PLACEHOLDER.foot,
      seat,
      placeholder: true,
    };
  return {
    type,
    variant: look.variant,
    asset: look.asset,
    foot: look.foot,
    seat,
    placeholder: false,
  };
}

/**
 * World pixel of the top-left corner of `art` drawn on a footprint whose
 * north-west cell is (x0, y0): the foot on the footprint's bottom centre,
 * `SEAT_PX` above its bottom edge.
 */
export function placeArt(
  art: MapObjectArt,
  x0: number,
  y0: number,
  cols: number,
  rows: number,
): Point {
  const groundX = x0 * CELL_PX + (cols * CELL_PX) / 2;
  const groundY = (y0 + rows) * CELL_PX - SEAT_PX[art.seat];
  return {
    x: Math.round(groundX - art.foot.x),
    y: groundY - art.foot.y,
  };
}
