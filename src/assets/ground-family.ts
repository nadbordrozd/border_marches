/**
 * Art families of the land grounds (bead border_marches-bzc.83). Each ground
 * has a texture of its own; the trees, peaks, doodads and imported forest
 * set come from its art family. A volcanic ground has only its texture (and
 * the glowing cracks in it) and borrows the wasteland's family: dark basalt
 * peaks with ash, dead trees, bones and ash doodads. The snow of bead
 * bzc.87 is a family of its own (snowy trees and peaks, snow doodads) but
 * has no imported forest set: its battles borrow the grass family's conifer
 * clumps (FOREST_FAMILY). The desert sand of bead bzc.88 likewise: its own
 * palm and cactus groves and golden sandstone mesas and spires, no doodads
 * of its own (its decorations are the detail), and the steppe's forest set.
 * The Candy Kingdom's frosting of bead bzc.115 is a family of its own too:
 * cotton-candy, frosted and lollipop groves, gumdrop and rock-candy hills
 * under poured icing, no doodads of its own, and the grass forest set.
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
  "snow",
  "sand",
  "frosting",
];

/** The art family each land ground draws its pieces from. */
export const GROUND_FAMILY: Readonly<Record<Land, ArtGround>> = {
  grass: "grass",
  jungle: "jungle",
  steppe: "steppe",
  badlands: "badlands",
  wasteland: "wasteland",
  volcanic: "wasteland",
  snow: "snow",
  sand: "sand",
  frosting: "frosting",
};

/** The art families with an imported (Pulp Wars) composed-forest set. */
export type ForestGround = Exclude<ArtGround, "snow" | "sand" | "frosting">;

export const FOREST_GROUNDS: readonly ForestGround[] = [
  "grass",
  "jungle",
  "steppe",
  "badlands",
  "wasteland",
];

/**
 * The forest set (battle tree clumps) each art family uses: its own, or a
 * borrowed one (bead bzc.87: snow borrows the grass family's conifers; bead
 * bzc.88: sand the steppe's; bead bzc.115: frosting the grass family's).
 */
export const FOREST_FAMILY: Readonly<Record<ArtGround, ForestGround>> = {
  grass: "grass",
  jungle: "jungle",
  steppe: "steppe",
  badlands: "badlands",
  wasteland: "wasteland",
  snow: "grass",
  sand: "steppe",
  frosting: "grass",
};
