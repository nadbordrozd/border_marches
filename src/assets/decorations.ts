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
 * nothing places them yet (a later bead puts them in map generation).
 *
 * The older doodads (manifest DOODAD_ASSETS, doodads.ts) stay the scattered
 * ground clutter; these are distinct subjects, never repeats of a doodad.
 */
import type { GroundTerrain, ImageAsset, Point } from "./manifest.ts";

export interface DecorationAsset extends ImageAsset {
  readonly category: "decoration";
  readonly decoration: string;
  /** Index among the decoration's looks. */
  readonly variant: number;
  /** The pixel that stands on the ground point: the bottom centre. */
  readonly foot: Point;
}

export interface DecorationDef {
  /** Kebab-case id, unique in the catalogue. */
  readonly id: string;
  readonly name: string;
  /** One line for the gallery card. */
  readonly text: string;
  /** The grounds it suits (a placer picks from these). */
  readonly terrains: readonly GroundTerrain[];
  /** A hero walks over it; false: an impassable prop. */
  readonly passable: boolean;
  /** Footprint in cells (props only; a passable decoration is 1 x 1). */
  readonly cols: number;
  readonly rows: number;
  /** Its looks (at least one). */
  readonly looks: readonly DecorationAsset[];
}

const T: Readonly<Record<string, GroundTerrain>> = {
  g: "grass",
  j: "jungle",
  s: "steppe",
  b: "badlands",
  w: "wasteland",
};

/**
 * [id, name, terrains (letters g j s b w), "p" passable or "x" prop, cols,
 * text, looks as [w, h] in px].
 */
// prettier-ignore
const ROWS: readonly (readonly [
  string,
  string,
  string,
  "p" | "x",
  number,
  string,
  readonly (readonly [number, number])[],
])[] = [
  // Passable decorations: small details a hero walks over.
  ["butterflies", "Butterflies", "gjs", "p", 1, "Three butterflies flutter over the grass.", [[29, 26]]],
  ["snail", "Snail", "gj", "p", 1, "A snail on its slow way somewhere.", [[25, 18]]],
  ["songbird", "Songbird", "gs", "p", 1, "A little bluebird pecking for seeds.", [[25, 21]]],
  ["molehill", "Molehill", "gs", "p", 1, "Fresh earth: someone is busy down there.", [[28, 17]]],
  ["mushroom-ring", "Mushroom Ring", "gj", "p", 1, "A fairy ring of pale mushrooms.", [[28, 23]]],
  ["hedgehog", "Hedgehog", "g", "p", 1, "A hedgehog, minding its own business.", [[27, 21]]],
  ["autumn-leaves", "Autumn Leaves", "gs", "p", 1, "A heap of fallen leaves.", [[29, 20]]],
  ["clover", "Clover", "gj", "p", 1, "Clover with a ladybird on it.", [[25, 23]]],
  ["dragonfly", "Dragonfly", "jg", "p", 1, "A dragonfly darting over the undergrowth.", [[22, 19]]],
  ["tree-frog", "Tree Frog", "j", "p", 1, "A tree frog, quite pleased with itself.", [[24, 19]]],
  ["swamp-reeds", "Swamp Reeds", "jg", "p", 1, "Reeds and cattails from a wet hollow.", [[23, 29]]],
  ["jungle-flower", "Jungle Flower", "j", "p", 1, "A big red flower lying on the jungle floor.", [[26, 20]]],
  ["thistles", "Thistles", "sg", "p", 1, "Purple thistles: pretty, prickly.", [[26, 30]]],
  ["crow", "Crow", "sgw", "p", 1, "A crow watching the road.", [[28, 23]]],
  ["cart-wheel", "Cart Wheel", "sg", "p", 1, "An old cart wheel left by the way.", [[26, 24]]],
  ["cairn", "Cairn", "sb", "p", 1, "A little stack of stones someone left.", [[24, 25]]],
  ["lizard", "Lizard", "bs", "p", 1, "A lizard basking on the warm ground.", [[26, 21]]],
  ["agave", "Agave", "bs", "p", 1, "A spiky agave, thirsty and tough.", [[24, 20]]],
  ["pot-shards", "Broken Pot", "b", "p", 1, "A clay pot, long broken and long empty.", [[28, 24]]],
  ["scorpion", "Scorpion", "bw", "p", 1, "A small scorpion with its tail up.", [[22, 23]]],
  ["grave-marker", "Grave Marker", "w", "p", 1, "A crooked plank over a forgotten grave.", [[20, 26]]],
  ["dead-weeds", "Dead Weeds", "w", "p", 1, "Burnt, thorny weeds.", [[28, 23]]],
  ["toadstools", "Toadstools", "wj", "p", 1, "Pale toadstools nobody should eat.", [[24, 23]]],
  ["broken-spear", "Broken Spear", "w", "p", 1, "A spear shaft from a battle long ago.", [[24, 27]]],
  // Impassable props: they block the way.
  ["big-boulder", "Big Boulder", "gsj", "x", 1, "A mossy boulder too big to climb.", [[58, 52]]],
  ["stump-cluster", "Stumps", "gs", "x", 1, "Three thick stumps of a cleared wood.", [[56, 44]]],
  ["broken-cart", "Broken Cart", "gs", "x", 1, "A farm cart tipped over and left to rot.", [[54, 53]]],
  ["standing-stones", "Standing Stones", "gsb", "x", 1, "Two old stones leaning together.", [[50, 61]]],
  ["giant-mushroom", "Giant Mushroom", "jg", "x", 1, "A mushroom the size of a hut.", [[56, 61]]],
  ["thornbush", "Thornbush", "sbw", "x", 1, "A thicket of thorns nobody walks through.", [[61, 54]]],
  ["dead-tree", "Dead Tree", "wb", "x", 1, "A gnarled tree, long dead.", [[54, 61]]],
  ["termite-mound", "Termite Mound", "sb", "x", 1, "A tall mound full of busy termites.", [[54, 62]]],
  ["ruined-pillars", "Ruined Pillars", "gsb", "x", 1, "Broken columns of a forgotten temple.", [[53, 62]]],
  ["stone-head", "Stone Head", "j", "x", 1, "The mossy head of an ancient statue.", [[62, 61]]],
  ["beast-skull", "Beast Skull", "wsb", "x", 1, "The skull of something very big.", [[64, 52]]],
  ["basalt-spikes", "Basalt Spikes", "wb", "x", 1, "Black rock spikes, sharp as knives.", [[51, 61]]],
  ["saguaro", "Saguaro", "b", "x", 1, "A tall cactus waving at nobody.", [[42, 62]]],
  ["hollow-stump", "Hollow Stump", "jw", "x", 1, "The hollow stump of a giant tree.", [[62, 61]]],
  ["fallen-log", "Fallen Log", "gjw", "x", 2, "A huge fallen trunk across the way.", [[123, 63], [112, 60]]],
  ["toppled-statue", "Toppled Statue", "gj", "x", 2, "A stone king, fallen and broken.", [[110, 46], [107, 59]]],
  ["beast-skeleton", "Beast Skeleton", "bsw", "x", 2, "The bones of a giant beast.", [[113, 61]]],
  ["ruined-wall", "Ruined Wall", "jg", "x", 2, "A stretch of ancient wall under creepers.", [[128, 60]]],
  ["broken-catapult", "Broken Catapult", "wg", "x", 2, "A siege engine abandoned after a battle.", [[90, 63]]],
];

export const DECORATIONS: readonly DecorationDef[] = ROWS.map(
  ([id, name, terrains, kind, cols, text, looks]) => ({
    id,
    name,
    text,
    terrains: [...terrains].map((letter) => {
      const terrain = T[letter];
      if (terrain === undefined) throw new Error(`${id}: terrain ${letter}`);
      return terrain;
    }),
    passable: kind === "p",
    cols: kind === "p" ? 1 : cols,
    rows: 1,
    looks: looks.map(([w, h], variant): DecorationAsset => {
      const file = looks.length === 1 ? id : `${id}-${variant + 1}`;
      return {
        key: `decoration-${file}`,
        path: `assets/terrain/decorations/${file}.png`,
        w,
        h,
        category: "decoration",
        decoration: id,
        variant,
        foot: { x: Math.floor(w / 2), y: h - 1 },
      };
    }),
  }),
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
