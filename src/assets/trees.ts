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
