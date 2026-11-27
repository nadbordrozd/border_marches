/**
 * The small single trees of the forest canopy (bead border_marches-xaj.26,
 * docs/art/classes/trees.md): studio set `trees`, generated at native
 * display size (about 0.25-0.5 cell wide), cropped to their opaque box plus
 * 1 px, never scaled or mirrored. `src/render/map/canopy.ts` crowds them
 * into woods; lone ones dot open ground (doodads.ts).
 */
import { GROUND_FAMILY } from "./ground-family";
import type { ArtGround } from "./ground-family";
import type { GroundTerrain, ImageAsset } from "./manifest";

export interface TreeAsset extends ImageAsset {
  readonly category: "tree";
  /** The art family whose woods use it (ground-family.ts). */
  readonly terrain: ArtGround;
  /** conifer, broadleaf, autumn, palm, ... */
  readonly species: string;
  readonly index: number;
}

/** [terrain, species, index, w, h] of every tree (file <species>-<index>.png). */
const TREE_ROWS: readonly (readonly [
  ArtGround,
  string,
  number,
  number,
  number,
])[] = [
  ["grass", "conifer", 1, 24, 42],
  ["grass", "conifer", 2, 23, 40],
  ["grass", "conifer", 3, 26, 33],
  ["grass", "conifer", 4, 26, 37],
  ["grass", "conifer", 5, 24, 36],
  ["grass", "conifer", 6, 28, 36],
  ["grass", "conifer", 7, 27, 37],
  ["grass", "conifer", 8, 26, 37],
  ["grass", "conifer", 9, 26, 37],
  ["grass", "conifer", 10, 28, 37],
  ["grass", "conifer", 11, 27, 36],
  ["grass", "conifer", 12, 26, 37],
  ["grass", "conifer", 13, 23, 38],
  ["grass", "conifer", 14, 27, 37],
  ["grass", "conifer", 15, 25, 37],
  ["grass", "conifer", 16, 26, 36],
  ["grass", "conifer", 17, 22, 35],
  ["grass", "broadleaf", 1, 34, 34],
  ["grass", "broadleaf", 2, 35, 35],
  ["grass", "broadleaf", 3, 24, 33],
  ["grass", "broadleaf", 4, 33, 34],
  ["grass", "broadleaf", 5, 38, 35],
  ["grass", "broadleaf", 6, 33, 36],
  ["grass", "broadleaf", 7, 28, 36],
  ["grass", "broadleaf", 8, 28, 36],
  ["grass", "broadleaf", 9, 33, 32],
  ["grass", "broadleaf", 10, 24, 35],
  ["grass", "broadleaf", 11, 28, 36],
  ["grass", "broadleaf", 12, 29, 34],
  ["grass", "broadleaf", 13, 30, 32],
  ["grass", "autumn", 1, 40, 35],
  ["grass", "autumn", 2, 28, 40],
  ["grass", "autumn", 3, 43, 39],
  ["grass", "autumn", 6, 24, 39],
  ["grass", "autumn", 8, 41, 38],
  ["grass", "autumn", 9, 28, 39],
  ["grass", "autumn", 10, 41, 38],
  ["grass", "autumn", 11, 40, 35],
  ["grass", "autumn", 13, 26, 39],
  ["grass", "autumn", 14, 38, 37],
  ["grass", "autumn", 16, 38, 39],
  ["grass", "autumn", 17, 24, 39],
  ["jungle", "palm", 1, 28, 36],
  ["jungle", "palm", 2, 30, 38],
  ["jungle", "palm", 3, 30, 38],
  ["jungle", "palm", 4, 27, 36],
  ["jungle", "palm", 5, 30, 37],
  ["jungle", "broadleaf", 1, 34, 38],
  ["jungle", "broadleaf", 2, 36, 39],
  ["jungle", "broadleaf", 3, 35, 38],
  ["jungle", "broadleaf", 4, 35, 39],
  ["jungle", "broadleaf", 5, 33, 38],
  ["jungle", "banana", 1, 36, 38],
  ["jungle", "banana", 2, 34, 39],
  ["jungle", "banana", 3, 35, 39],
  ["jungle", "palm", 6, 36, 37],
  ["jungle", "palm", 7, 34, 36],
  ["jungle", "palm", 8, 35, 38],
  ["jungle", "palm", 9, 34, 33],
  ["jungle", "palm", 10, 36, 34],
  ["jungle", "palm", 11, 32, 36],
  ["jungle", "broadleaf", 6, 34, 37],
  ["jungle", "palm", 12, 27, 36],
  ["steppe", "oak", 1, 30, 32],
  ["steppe", "birch", 1, 21, 34],
  ["steppe", "bent", 1, 30, 31],
  ["steppe", "oak", 2, 38, 31],
  ["steppe", "birch", 2, 25, 37],
  ["steppe", "oak", 3, 27, 36],
  ["steppe", "oak", 4, 39, 35],
  ["steppe", "bent", 2, 31, 30],
  ["steppe", "oak", 5, 20, 23],
  ["steppe", "oak", 6, 42, 39],
  ["steppe", "oak", 7, 34, 33],
  ["steppe", "birch", 3, 32, 36],
  ["steppe", "bent", 3, 33, 33],
  ["steppe", "oak", 8, 18, 19],
  ["badlands", "juniper", 1, 33, 40],
  ["badlands", "mesquite", 1, 44, 35],
  ["badlands", "gnarled", 1, 39, 38],
  ["badlands", "juniper", 2, 35, 39],
  ["badlands", "mesquite", 2, 43, 32],
  ["badlands", "juniper", 3, 35, 40],
  ["badlands", "mesquite", 3, 44, 23],
  ["badlands", "juniper", 4, 38, 37],
  ["badlands", "mesquite", 4, 37, 33],
  ["badlands", "gnarled", 2, 35, 38],
  ["badlands", "juniper", 5, 38, 37],
  ["badlands", "mesquite", 5, 44, 31],
  ["badlands", "juniper", 6, 40, 35],
  ["badlands", "mesquite", 6, 42, 32],
  ["badlands", "gnarled", 3, 42, 40],
  ["badlands", "juniper", 7, 36, 37],
  ["badlands", "pinyon", 1, 33, 32],
  ["badlands", "pinyon", 2, 32, 33],
  ["badlands", "pinyon", 3, 34, 35],
  ["badlands", "pinyon", 4, 28, 27],
  ["badlands", "pinyon", 5, 37, 37],
  ["badlands", "pinyon", 6, 33, 30],
  ["badlands", "pinyon", 7, 31, 34],
  ["badlands", "pinyon", 8, 35, 32],
  ["badlands", "pinyon", 9, 28, 29],
  ["badlands", "pinyon", 10, 37, 29],
  ["badlands", "pinyon", 11, 26, 26],
  ["wasteland", "pine", 1, 24, 40],
  ["wasteland", "deadoak", 1, 28, 39],
  ["wasteland", "snag", 1, 32, 36],
  ["wasteland", "snag", 2, 24, 40],
  ["wasteland", "pine", 2, 29, 40],
  ["wasteland", "snag", 3, 40, 38],
  ["wasteland", "snag", 4, 34, 39],
  ["wasteland", "pine", 3, 21, 40],
  ["wasteland", "deadoak", 2, 34, 39],
  ["wasteland", "pine", 4, 21, 41],
  ["wasteland", "deadoak", 3, 37, 38],
  ["wasteland", "deadoak", 4, 35, 36],
  ["wasteland", "deadoak", 5, 34, 35],
  ["wasteland", "deadoak", 6, 37, 35],
  ["wasteland", "deadoak", 7, 34, 37],
  ["wasteland", "pine", 5, 25, 40],
  ["wasteland", "pine", 6, 26, 40],
  ["wasteland", "leafy", 1, 29, 39],
  ["wasteland", "leafy", 2, 30, 40],
  ["wasteland", "leafy", 3, 30, 39],
  ["wasteland", "leafy", 4, 30, 40],
  ["wasteland", "deadoak", 8, 30, 38],
  // Snowy woods (bead bzc.87, set winter-trees).
  ["snow", "spruce", 1, 20, 36],
  ["snow", "spruce", 2, 28, 33],
  ["snow", "spruce", 3, 26, 31],
  ["snow", "spruce", 4, 26, 37],
  ["snow", "spruce", 5, 30, 38],
  ["snow", "spruce", 6, 30, 36],
  ["snow", "spruce", 7, 28, 36],
  ["snow", "spruce", 8, 26, 35],
  ["snow", "spruce", 9, 28, 33],
  ["snow", "spruce", 10, 31, 35],
  ["snow", "spruce", 11, 22, 35],
  ["snow", "spruce", 12, 27, 34],
  ["snow", "fir", 1, 30, 29],
  ["snow", "fir", 2, 21, 34],
  ["snow", "fir", 3, 28, 35],
  ["snow", "fir", 4, 32, 37],
  ["snow", "birch", 1, 26, 41],
  ["snow", "birch", 2, 33, 38],
  ["snow", "birch", 3, 32, 41],
  ["snow", "larch", 1, 26, 38],
  ["snow", "larch", 2, 35, 37],
  // Desert groves (bead bzc.88, set desert-trees): palms and cacti.
  ["sand", "palm", 1, 32, 40],
  ["sand", "palm", 2, 33, 41],
  ["sand", "palm", 3, 32, 41],
  ["sand", "palm", 4, 31, 40],
  ["sand", "palm", 5, 33, 41],
  ["sand", "palm", 6, 35, 38],
  ["sand", "palm", 7, 28, 37],
  ["sand", "palm", 8, 24, 35],
  ["sand", "palm", 9, 41, 41],
  ["sand", "palm", 10, 39, 41],
  ["sand", "palm", 11, 39, 41],
  ["sand", "palm", 12, 43, 39],
  ["sand", "palm", 13, 42, 35],
  ["sand", "palm", 14, 29, 39],
  ["sand", "palm", 15, 33, 39],
  ["sand", "saguaro", 1, 28, 35],
  ["sand", "saguaro", 2, 29, 36],
  ["sand", "saguaro", 3, 27, 37],
  ["sand", "saguaro", 4, 31, 32],
  ["sand", "saguaro", 5, 31, 31],
  ["sand", "saguaro", 6, 30, 32],
  ["sand", "pear", 1, 38, 33],
  ["sand", "pear", 2, 39, 36],
  ["sand", "pear", 3, 37, 36],
  ["sand", "column", 1, 28, 33],
  ["sand", "column", 2, 29, 35],
  ["sand", "column", 3, 31, 33],
  ["sand", "barrel", 1, 26, 25],
  ["sand", "barrel", 2, 26, 26],
  ["sand", "barrel", 3, 26, 26],
  // Candy groves (bead bzc.115, set candy-trees): frosted, cotton-candy and
  // lollipop trees, gumdrop bushes and candy canes on the frosting.
  ["frosting", "frosted", 1, 32, 34],
  ["frosting", "frosted", 2, 34, 36],
  ["frosting", "frosted", 3, 34, 38],
  ["frosting", "frosted", 4, 32, 39],
  ["frosting", "frosted", 5, 28, 30],
  ["frosting", "frosted", 6, 38, 41],
  ["frosting", "cotton", 1, 28, 39],
  ["frosting", "cotton", 2, 26, 37],
  ["frosting", "cotton", 3, 28, 40],
  ["frosting", "cotton", 4, 26, 37],
  ["frosting", "cotton", 5, 26, 37],
  ["frosting", "cotton", 6, 28, 39],
  ["frosting", "cotton", 7, 28, 40],
  ["frosting", "cotton", 8, 39, 37],
  ["frosting", "cotton", 9, 35, 42],
  ["frosting", "cotton", 10, 28, 40],
  ["frosting", "lollipop", 1, 26, 37],
  ["frosting", "lollipop", 2, 26, 36],
  ["frosting", "lollipop", 3, 26, 36],
  ["frosting", "lollipop", 4, 28, 39],
  ["frosting", "lollipop", 5, 29, 40],
  ["frosting", "lollipop", 6, 22, 34],
  ["frosting", "lollipop", 7, 22, 34],
  ["frosting", "lollipop", 8, 22, 34],
  ["frosting", "lollipop", 9, 22, 34],
  ["frosting", "lollipop", 10, 22, 33],
  ["frosting", "gumdrop", 1, 34, 35],
  ["frosting", "gumdrop", 2, 36, 35],
  ["frosting", "gumdrop", 3, 38, 28],
  ["frosting", "gumdrop", 4, 34, 25],
  ["frosting", "cane", 1, 18, 32],
  ["frosting", "cane", 2, 18, 33],
  ["frosting", "cane", 3, 18, 32],
  ["frosting", "cane", 4, 36, 33],
];

export const TREE_ASSETS: readonly TreeAsset[] = TREE_ROWS.map(
  ([terrain, species, index, w, h]) => ({
    key: `tree-${terrain}-${species}-${index}`,
    path: `assets/terrain/trees/${terrain}/${species}-${index}.png`,
    w,
    h,
    category: "tree",
    terrain,
    species,
    index,
  }),
);

/**
 * How common each species is in the woods of each ground (relative). The
 * canopy also gathers each species into loose patches.
 */
const OWN_SPECIES_WEIGHTS: Readonly<
  Record<ArtGround, Readonly<Record<string, number>>>
> = {
  grass: { conifer: 5, broadleaf: 3, autumn: 5 },
  jungle: { broadleaf: 3, palm: 2.4, banana: 1 },
  steppe: { oak: 3.4, birch: 0.7, bent: 1 },
  badlands: { juniper: 2, pinyon: 3.2, mesquite: 0.45, gnarled: 0.8 },
  wasteland: { deadoak: 3, leafy: 1.6, pine: 2, snag: 0.6 },
  // Snow (bead bzc.87): snow-laden spruces with darker firs to break up the
  // white, a few birches, golden larches in drifts.
  snow: { spruce: 5, fir: 2.4, birch: 0.9, larch: 2 },
  sand: { palm: 3.4, saguaro: 1.4, column: 0.8, pear: 0.8, barrel: 0.5 },
  // Frosting (bead bzc.115): frosted and cotton-candy crowns are the calm
  // base, lollipops and gumdrop bushes among them, candy canes in drifts.
  frosting: { frosted: 4, cotton: 3.4, lollipop: 2, gumdrop: 1, cane: 1.4 },
};

/** The species mix of each ground's woods: its art family's. */
export const TREE_SPECIES_WEIGHTS: Readonly<
  Record<GroundTerrain, Readonly<Record<string, number>>>
> = {
  ...OWN_SPECIES_WEIGHTS,
  volcanic: OWN_SPECIES_WEIGHTS[GROUND_FAMILY.volcanic],
};

/**
 * Clumped species (bead xaj.27, after the Heroes II reference): they grow
 * only in drifts, where a slow noise over the map rises past the level
 * given here (canopy.ts `TreeSpecies.drift`), so the autumn trees of the
 * grass woods come in patches on a calm green base instead of confetti.
 */
export const TREE_SPECIES_DRIFT: Readonly<
  Partial<Record<GroundTerrain, Readonly<Record<string, number>>>>
> = {
  grass: { autumn: 0.57 },
  snow: { larch: 0.6 },
  frosting: { cane: 0.6 },
};

/** The trees of one ground and species. */
export function treesOf(
  terrain: GroundTerrain,
  species?: string,
): readonly TreeAsset[] {
  const family = GROUND_FAMILY[terrain];
  return TREE_ASSETS.filter(
    (tree) =>
      tree.terrain === family &&
      (species === undefined || tree.species === species),
  );
}
