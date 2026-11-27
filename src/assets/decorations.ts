/**
 * The decoration catalogue (bead border_marches-bzc.48,
 * docs/art/classes/decorations.md): purely decorative map pieces with no
 * rules of their own.
 *
 * - Passable decorations are small details on open ground (a butterfly, a
 *   molehill, a raven): a hero walks over them. Generated at 32 x 32.
 * - Impassable props fill one or two cells side by side (a boulder, a
 *   fallen log): they block the way like a forest cell. Generated at
 *   64 x 64 (one cell) or 128 x 64 (two cells).
 *
 * Every look is a studio sprite of set `decorations`, cropped to its opaque
 * box plus 1 px on the left, right and top; the last row is the foot.
 * Never scaled, never mirrored (the sun is at the bottom left). The
 * renderer draws a placed decoration with src/render/map/decorations.ts;
 * the map generator places them (src/core/map/decorate.ts, bead bzc.72)
 * from the art-free kinds in src/data/decorations.ts.
 *
 * The older doodads (manifest DOODAD_ASSETS, doodads.ts) stay the scattered
 * ground clutter; these are distinct subjects, never repeats of a doodad.
 */
import { DECORATION_KINDS } from "../data/decorations.ts";
import type { DecorationKind } from "../data/decorations.ts";
import type { GroundTerrain, ImageAsset, Point } from "./manifest.ts";

export interface DecorationAsset extends ImageAsset {
  readonly category: "decoration";
  readonly decoration: string;
  /** Index among the decoration's looks. */
  readonly variant: number;
  /** The pixel that stands on the ground point: the bottom centre. */
  readonly foot: Point;
}

/** A decoration kind (src/data/decorations.ts) with its sprites. */
export interface DecorationDef extends Omit<DecorationKind, "looks"> {
  /** The grounds it suits (a placer picks from these). */
  readonly terrains: readonly GroundTerrain[];
  /** Its looks (at least one). */
  readonly looks: readonly DecorationAsset[];
}

/** Each decoration's looks as [w, h] in px, in variant order. */
// prettier-ignore
const LOOKS: Readonly<Record<string, readonly (readonly [number, number])[]>> = {
  "butterflies": [[29, 26]],
  "snail": [[25, 18]],
  "songbird": [[25, 21]],
  "molehill": [[28, 17]],
  "mushroom-ring": [[28, 23]],
  "hedgehog": [[27, 21]],
  "autumn-leaves": [[29, 20]],
  "clover": [[25, 23]],
  "dragonfly": [[22, 19]],
  "tree-frog": [[24, 19]],
  "swamp-reeds": [[23, 29]],
  "jungle-flower": [[26, 20]],
  "thistles": [[26, 30]],
  "crow": [[28, 23]],
  "cart-wheel": [[26, 24]],
  "cairn": [[24, 25]],
  "lizard": [[26, 21]],
  "agave": [[24, 20]],
  "pot-shards": [[28, 24]],
  "scorpion": [[22, 23]],
  "grave-marker": [[20, 26]],
  "dead-weeds": [[28, 23]],
  "toadstools": [[24, 23]],
  "broken-spear": [[24, 27]],
  "arctic-hare": [[22, 28], [22, 28]],
  "snowy-owl": [[25, 25], [25, 25]],
  "fox": [[29, 21], [29, 21]],
  "snowman": [[28, 25], [18, 30]],
  "frozen-shrub": [[23, 20], [23, 22]],
  "snow-tufts": [[23, 20], [24, 22]],
  "paw-prints": [[22, 22], [23, 22]],
  "ice-crystals": [[22, 21], [22, 22]],
  "big-boulder": [[58, 52]],
  "stump-cluster": [[56, 44]],
  "broken-cart": [[54, 53]],
  "standing-stones": [[50, 61]],
  "giant-mushroom": [[56, 61]],
  "thornbush": [[61, 54]],
  "dead-tree": [[54, 61]],
  "termite-mound": [[54, 62]],
  "ruined-pillars": [[53, 62]],
  "stone-head": [[62, 61]],
  "beast-skull": [[64, 52]],
  "basalt-spikes": [[51, 61]],
  "saguaro": [[42, 62]],
  "hollow-stump": [[62, 61]],
  "fallen-log": [[123, 63], [112, 60]],
  "toppled-statue": [[110, 46], [107, 59]],
  "beast-skeleton": [[113, 61]],
  "ruined-wall": [[128, 60]],
  "broken-catapult": [[90, 63]],
  "ice-boulder": [[61, 55], [62, 53]],
  "ice-spire": [[48, 61], [46, 61]],
  "abandoned-sled": [[62, 42], [61, 41]],
  "snowdrift": [[62, 57], [62, 60]],
  "mammoth-skeleton": [[127, 55], [128, 49]],
  "frozen-log": [[124, 63], [121, 64]],
  // The desert (bead bzc.88, set desert-decorations).
  "desert-tumbleweed": [[25, 23], [23, 24]],
  "scarab": [[22, 18], [26, 19]],
  "dry-grass": [[25, 22], [28, 22]],
  "desert-flower": [[24, 22], [24, 22]],
  "barrel-cactus": [[20, 22], [21, 23]],
  "ox-skull": [[27, 25], [25, 24]],
  "sand-snake": [[26, 25], [24, 24]],
  "pear-pads": [[26, 26], [26, 26]],
  "bone-heap": [[28, 19], [27, 20]],
  "dry-shrub": [[26, 24], [28, 24]],
  "fennec": [[27, 20], [28, 19]],
  "sandstone-boulder": [[62, 50], [58, 58]],
  "broken-column": [[44, 60], [46, 61]],
  "buried-head": [[58, 60], [60, 49]],
  "fallen-pillar": [[127, 47]],
  "temple-ruin": [[128, 46]],
  // The Candy Kingdom's frosting (bead bzc.115, set candy-decorations).
  "gumdrops": [[30, 26], [30, 26]],
  "cane-sprig": [[18, 28], [18, 28]],
  "melting-cone": [[25, 30], [25, 30]],
  "gummy-worm": [[29, 25], [28, 25]],
  "sugar-mouse": [[25, 27], [25, 27]],
  "sprinkles": [[24, 24], [24, 22]],
  "marshmallows": [[32, 28], [28, 20]],
  "licorice-knot": [[30, 15], [30, 17]],
  "chocolate-drops": [[30, 23], [30, 24]],
  "gingerbread-rabbit": [[20, 30], [23, 29]],
  "giant-cupcake": [[52, 60], [46, 59]],
  "gumdrop-boulder": [[62, 55], [50, 59]],
  "rock-candy": [[63, 53], [58, 59]],
  "fallen-cane": [[116, 52]],
  "chocolate-bar": [[118, 47]],
  "gingerbread-fence": [[118, 49]],
};

export const DECORATIONS: readonly DecorationDef[] = DECORATION_KINDS.map(
  (kind) => {
    const looks = LOOKS[kind.id];
    if (looks === undefined || looks.length !== kind.looks)
      throw new Error(`${kind.id}: ${kind.looks} looks expected`);
    return {
      ...kind,
      looks: looks.map(([w, h], variant): DecorationAsset => {
        const file = looks.length === 1 ? kind.id : `${kind.id}-${variant + 1}`;
        return {
          key: `decoration-${file}`,
          path: `assets/terrain/decorations/${file}.png`,
          w,
          h,
          category: "decoration",
          decoration: kind.id,
          variant,
          foot: { x: Math.floor(w / 2), y: h - 1 },
        };
      }),
    };
  },
);

/** Every decoration sprite, once. */
export const DECORATION_ASSETS: readonly DecorationAsset[] =
  DECORATIONS.flatMap((d) => d.looks);

const BY_ID: ReadonlyMap<string, DecorationDef> = new Map(
  DECORATIONS.map((d) => [d.id, d]),
);

/** The decoration with this id, or undefined. */
export function decorationById(id: string): DecorationDef | undefined {
  return BY_ID.get(id);
}

/** A look of a decoration (the variant wraps round its looks). */
export function decorationLook(
  def: DecorationDef,
  variant: number,
): DecorationAsset {
  const n = def.looks.length;
  return def.looks[((Math.trunc(variant) % n) + n) % n] as DecorationAsset;
}

/** The decorations that suit a ground, passable ones or props. */
export function decorationsFor(
  terrain: GroundTerrain,
  passable: boolean,
): readonly DecorationDef[] {
  return DECORATIONS.filter(
    (d) => d.passable === passable && d.terrains.includes(terrain),
  );
}
