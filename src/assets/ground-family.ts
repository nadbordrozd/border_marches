/**
 * Art families of the land grounds (bead border_marches-bzc.83). Each ground
 * has a texture of its own; the trees, peaks, doodads and imported forest
 * set come from its art family. A volcanic ground has only its texture (and
 * the glowing cracks in it) and borrows the wasteland's family: dark basalt
 * peaks with ash, dead trees, bones and ash doodads.
 *
 * Its own module (no imports of values), so the asset tables of trees,
 * peaks and the manifest can all use it without an import cycle.
 */
import type { Terrain } from "../core/map/types";

/** A land terrain (as manifest.ts GroundTerrain). */
type Land = Exclude<Terrain, "water">;

/** The grounds with an art family of their own. */
export type ArtGround = Exclude<Land, "volcanic">;

export const ART_GROUNDS: readonly ArtGround[] = [
  "grass",
  "jungle",
  "steppe",
  "badlands",
  "wasteland",
];

/** The art family each land ground draws its pieces from. */
export const GROUND_FAMILY: Readonly<Record<Land, ArtGround>> = {
  grass: "grass",
  jungle: "jungle",
  steppe: "steppe",
  badlands: "badlands",
  wasteland: "wasteland",
  volcanic: "wasteland",
};
