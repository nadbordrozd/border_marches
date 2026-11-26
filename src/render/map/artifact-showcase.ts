/**
 * A review map of artifacts lying on the adventure map (bead
 * border_marches-bzc.105), shown by the debug page at
 * ?view=map&map=artifacts: one band of two rows per land ground, with
 * loose artifacts of every grade (each drawn as its own icon), a Mystery
 * Satchel, a loose scroll, a treasure chest and a hero for scale. Not a
 * game map: nothing here is used by map generation.
 */
import { GROUND_TERRAINS } from "../../assets/manifest";
import { mysteryItem } from "../../core/map/mystery";
import type { GameMap, MapCell, MapObject } from "../../core/map/types";

/** A spread of looks: trinkets, wonders, a cursed one, a consumable. */
export const SHOWCASE_ARTIFACTS: readonly string[] = [
  "bloodstone-ring",
  "brass-bugle",
  "ball-and-chain",
  "cider-flask",
  "clerks-cape",
  "bailiffs-greatcoat",
  "blue-tonic",
  "bookbinders-thread",
];

const BAND = 2;

function one(
  id: string,
  kind: MapObject["kind"],
  x: number,
  y: number,
  data: Record<string, unknown>,
): MapObject {
  return { id, kind, x, y, footprint: { w: 1, h: 1 }, blocked: [], data };
}

export function artifactShowcase(): GameMap {
  const objects: MapObject[] = [];
  const seed = 105;
  const width = SHOWCASE_ARTIFACTS.length * 2 + 8;
  GROUND_TERRAINS.forEach((_terrain, band) => {
    const y = band * BAND;
    SHOWCASE_ARTIFACTS.forEach((artifact, i) => {
      // Rotate the list per band, so each ground shows every look.
      const id =
        SHOWCASE_ARTIFACTS[(i + band) % SHOWCASE_ARTIFACTS.length] ?? artifact;
      objects.push(
        one(`art-${band}-${i}`, "artifact", 1 + i * 2, y, {
          type: "loose-artifact",
          artifact: id,
        }),
      );
    });
    const x = 1 + SHOWCASE_ARTIFACTS.length * 2;
    objects.push(
      mysteryItem({ seed }, `mystery-${band}`, x, y),
      one(`scroll-${band}`, "site", x + 2, y, {
        type: "loose-scroll",
        spell: "poultice",
      }),
      one(`chest-${band}`, "pickup", x + 4, y, {
        resource: "gold",
        amount: 1000,
        chest: true,
      }),
      one(`hero-start-${band}`, "hero-start", 1, y + 1, { player: band }),
    );
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
  return { width, height, seed, cells, objects };
}
