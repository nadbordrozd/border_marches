/**
 * Purely decorative map pieces (bead border_marches-bzc.48): where a placed
 * decoration of the catalogue (src/assets/decorations.ts) is drawn and its
 * scene entry. Nothing here decides where decorations go: the map's own
 * (GameMap.decorations, placed by src/core/map/decorate.ts, bead bzc.72)
 * come with MapView.setMap through {@link mapDecorations}; a test page may
 * hand the view others through MapView.setDecorations.
 *
 * - A passable decoration (a butterfly, a molehill) stands with its foot on
 *   a ground point inside its cell, by default the cell centre; heroes and
 *   objects are drawn over it.
 * - An impassable prop (a boulder, a fallen log) stands like a map site:
 *   its foot on the bottom centre of its footprint, SEAT_PX.site above the
 *   bottom edge. It never rises above its own row, so the TALL_BODY pass
 *   (with the trees and peaks, sorted by its foot) is enough.
 */
import { CELL_PX } from "../../assets/manifest";
import type { Point } from "../../assets/manifest";
import { decorationById, decorationLook } from "../../assets/decorations";
import type { DecorationAsset, DecorationDef } from "../../assets/decorations";
import { SEAT_PX } from "../../assets/object-art";
import type { GameMap } from "../../core/map/types";
import { hashUnit } from "./hash";

const CELL = CELL_PX;

export interface PlacedDecoration {
  /** A catalogue id (DECORATIONS). */
  readonly id: string;
  /** Which look (wraps round the decoration's looks); default 0. */
  readonly variant?: number;
  /** The decoration's cell, or a prop's footprint's top-left cell. */
  readonly x: number;
  readonly y: number;
  /**
   * Passable only: the ground point its foot stands on, world px from the
   * cell's top-left (default the cell centre). Ignored for props.
   */
  readonly at?: Point;
}

export interface DecorationDraw {
  readonly def: DecorationDef;
  readonly asset: DecorationAsset;
  /** Top-left of the image, world px. */
  readonly x: number;
  readonly y: number;
  /** The world point its foot stands on. */
  readonly footX: number;
  readonly footY: number;
}

/** Where a placed decoration is drawn; throws on an unknown id. */
export function placeDecoration(p: PlacedDecoration): DecorationDraw {
  const def = decorationById(p.id);
  if (def === undefined) throw new Error(`unknown decoration: ${p.id}`);
  const asset = decorationLook(def, p.variant ?? 0);
  const footX = def.passable
    ? p.x * CELL + (p.at?.x ?? CELL / 2)
    : p.x * CELL + (def.cols * CELL) / 2;
  const footY = def.passable
    ? p.y * CELL + (p.at?.y ?? CELL / 2)
    : (p.y + def.rows) * CELL - SEAT_PX.site;
  return {
    def,
    asset,
    x: Math.round(footX - asset.foot.x),
    y: Math.round(footY - asset.foot.y),
    footX,
    footY,
  };
}

/**
 * The map's own decorations (GameMap.decorations, bead bzc.72) as placed
 * decorations: a passable one stands on a point of its cell picked by a
 * hash of the cell (off the centre, so a cluster does not line up on the
 * grid); a prop on its footprint.
 */
export function mapDecorations(map: GameMap): PlacedDecoration[] {
  return (map.decorations ?? []).map((d) => {
    const def = decorationById(d.id);
    if (def === undefined || !def.passable)
      return { id: d.id, variant: d.variant, x: d.x, y: d.y };
    const at = {
      x: Math.round(CELL * (0.28 + 0.44 * hashUnit(d.x, d.y, 0xdec0))),
      y: Math.round(CELL * (0.45 + 0.4 * hashUnit(d.x, d.y, 0xdec1))),
    };
    return { id: d.id, variant: d.variant, x: d.x, y: d.y, at };
  });
}

/** The cells a placed decoration covers (a passable one: its own cell). */
export function decorationCells(p: PlacedDecoration): [number, number][] {
  const def = decorationById(p.id);
  if (def === undefined) return [];
  const cols = def.passable ? 1 : def.cols;
  const rows = def.passable ? 1 : def.rows;
  const out: [number, number][] = [];
  for (let dy = 0; dy < rows; dy += 1)
    for (let dx = 0; dx < cols; dx += 1) out.push([p.x + dx, p.y + dy]);
  return out;
}
