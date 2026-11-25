/**
 * A review map of the decoration catalogue (bead border_marches-bzc.48),
 * shown by the debug page at ?view=map&map=decorations: one band of three
 * rows per land ground, its passable decorations on the first row (every
 * look, a cell apart), its props on the second (a free cell between them)
 * and a hero for scale on the third. Not a game map: nothing here is used
 * by map generation.
 */
import { GROUND_TERRAINS } from "../../assets/manifest";
import { decorationsFor } from "../../assets/decorations";
import type { GameMap, MapCell, MapObject } from "../../core/map/types";
import type { PlacedDecoration } from "./decorations";

export interface DecorationShowcase {
  readonly map: GameMap;
  readonly decorations: readonly PlacedDecoration[];
}

const BAND = 3;

export function decorationShowcase(): DecorationShowcase {
  const decorations: PlacedDecoration[] = [];
  const objects: MapObject[] = [];
  let width = 8;
  GROUND_TERRAINS.forEach((terrain, band) => {
    const y = band * BAND;
    let x = 1;
    for (const d of decorationsFor(terrain, true))
      d.looks.forEach((_, variant) => {
        decorations.push({ id: d.id, variant, x, y });
        x += 2;
      });
    width = Math.max(width, x);
    x = 1;
    for (const d of decorationsFor(terrain, false))
      d.looks.forEach((_, variant) => {
        decorations.push({ id: d.id, variant, x, y: y + 1 });
        x += d.cols + 1;
      });
    width = Math.max(width, x);
    objects.push({
      id: `hero-start-${band}`,
      kind: "hero-start",
      x: 1,
      y: y + 2,
      footprint: { w: 1, h: 1 },
      blocked: [],
      data: { player: band },
    });
  });
  const height = GROUND_TERRAINS.length * BAND;
  const cells: MapCell[] = [];
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1)
      cells.push({
        terrain: GROUND_TERRAINS[Math.floor(y / BAND)] ?? "grass",
        obstacle: "none",
        road: false,
      });
  return {
    map: { width, height, seed: 0, cells, objects },
    decorations,
  };
}
