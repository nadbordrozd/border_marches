/**
 * The decoration kinds (beads border_marches-bzc.48 and bzc.72): purely
 * decorative map pieces with no rules of their own beyond where they stand
 * and whether a hero can walk through them. Art-free, so the map generator
 * (src/core) can place them; the sprites of each kind are in
 * src/assets/decorations.ts (docs/art/classes/decorations.md).
 *
 * - Passable decorations are small details on open ground (a butterfly, a
 *   molehill, a crow): a hero walks over them.
 * - Impassable props fill one cell or two side by side (a boulder, a fallen
 *   log): they block the way like a forest cell.
 */
import type { Terrain } from "../core/map/types.ts";

/** A land terrain (decorations never stand in water). */
export type DecorationGround = Exclude<Terrain, "water">;

export interface DecorationKind {
  /** Kebab-case id, unique in the catalogue. */
  readonly id: string;
  readonly name: string;
  /** One line for the gallery card and the map hover card. */
  readonly text: string;
  /** The grounds it suits (the placer picks from these). */
  readonly terrains: readonly DecorationGround[];
  /** A hero walks over it; false: an impassable prop. */
  readonly passable: boolean;
  /** Footprint in cells (a passable decoration is 1 x 1). */
  readonly cols: number;
  readonly rows: number;
  /** How many looks (sprites) it has. */
  readonly looks: number;
}

const T: Readonly<Record<string, DecorationGround>> = {
  g: "grass",
  j: "jungle",
  s: "steppe",
  b: "badlands",
  w: "wasteland",
};

/**
 * [id, name, terrains (letters g j s b w), "p" passable or "x" prop, cols,
 * looks, text].
 */
// prettier-ignore
const ROWS: readonly (readonly [string, string, string, "p" | "x", number, number, string])[] = [
  // Passable decorations: small details a hero walks over.
  ["butterflies", "Butterflies", "gjs", "p", 1, 1, "Three butterflies flutter over the grass."],
  ["snail", "Snail", "gj", "p", 1, 1, "A snail on its slow way somewhere."],
  ["songbird", "Songbird", "gs", "p", 1, 1, "A little bluebird pecking for seeds."],
  ["molehill", "Molehill", "gs", "p", 1, 1, "Fresh earth: someone is busy down there."],
  ["mushroom-ring", "Mushroom Ring", "gj", "p", 1, 1, "A fairy ring of pale mushrooms."],
  ["hedgehog", "Hedgehog", "g", "p", 1, 1, "A hedgehog, minding its own business."],
  ["autumn-leaves", "Autumn Leaves", "gs", "p", 1, 1, "A heap of fallen leaves."],
  ["clover", "Clover", "gj", "p", 1, 1, "Clover with a ladybird on it."],
  ["dragonfly", "Dragonfly", "jg", "p", 1, 1, "A dragonfly darting over the undergrowth."],
  ["tree-frog", "Tree Frog", "j", "p", 1, 1, "A tree frog, quite pleased with itself."],
  ["swamp-reeds", "Swamp Reeds", "jg", "p", 1, 1, "Reeds and cattails from a wet hollow."],
  ["jungle-flower", "Jungle Flower", "j", "p", 1, 1, "A big red flower lying on the jungle floor."],
  ["thistles", "Thistles", "sg", "p", 1, 1, "Purple thistles: pretty, prickly."],
  ["crow", "Crow", "sgw", "p", 1, 1, "A crow watching the road."],
  ["cart-wheel", "Cart Wheel", "sg", "p", 1, 1, "An old cart wheel left by the way."],
  ["cairn", "Cairn", "sb", "p", 1, 1, "A little stack of stones someone left."],
  ["lizard", "Lizard", "bs", "p", 1, 1, "A lizard basking on the warm ground."],
  ["agave", "Agave", "bs", "p", 1, 1, "A spiky agave, thirsty and tough."],
  ["pot-shards", "Broken Pot", "b", "p", 1, 1, "A clay pot, long broken and long empty."],
  ["scorpion", "Scorpion", "bw", "p", 1, 1, "A small scorpion with its tail up."],
  ["grave-marker", "Grave Marker", "w", "p", 1, 1, "A crooked plank over a forgotten grave."],
  ["dead-weeds", "Dead Weeds", "w", "p", 1, 1, "Burnt, thorny weeds."],
  ["toadstools", "Toadstools", "wj", "p", 1, 1, "Pale toadstools nobody should eat."],
  ["broken-spear", "Broken Spear", "w", "p", 1, 1, "A spear shaft from a battle long ago."],
  // Impassable props: they block the way.
  ["big-boulder", "Big Boulder", "gsj", "x", 1, 1, "A mossy boulder too big to climb."],
  ["stump-cluster", "Stumps", "gs", "x", 1, 1, "Three thick stumps of a cleared wood."],
  ["broken-cart", "Broken Cart", "gs", "x", 1, 1, "A farm cart tipped over and left to rot."],
  ["standing-stones", "Standing Stones", "gsb", "x", 1, 1, "Two old stones leaning together."],
  ["giant-mushroom", "Giant Mushroom", "jg", "x", 1, 1, "A mushroom the size of a hut."],
  ["thornbush", "Thornbush", "sbw", "x", 1, 1, "A thicket of thorns nobody walks through."],
  ["dead-tree", "Dead Tree", "wb", "x", 1, 1, "A gnarled tree, long dead."],
  ["termite-mound", "Termite Mound", "sb", "x", 1, 1, "A tall mound full of busy termites."],
  ["ruined-pillars", "Ruined Pillars", "gsb", "x", 1, 1, "Broken columns of a forgotten temple."],
  ["stone-head", "Stone Head", "j", "x", 1, 1, "The mossy head of an ancient statue."],
  ["beast-skull", "Beast Skull", "wsb", "x", 1, 1, "The skull of something very big."],
  ["basalt-spikes", "Basalt Spikes", "wb", "x", 1, 1, "Black rock spikes, sharp as knives."],
  ["saguaro", "Saguaro", "b", "x", 1, 1, "A tall cactus waving at nobody."],
  ["hollow-stump", "Hollow Stump", "jw", "x", 1, 1, "The hollow stump of a giant tree."],
  ["fallen-log", "Fallen Log", "gjw", "x", 2, 2, "A huge fallen trunk across the way."],
  ["toppled-statue", "Toppled Statue", "gj", "x", 2, 2, "A stone king, fallen and broken."],
  ["beast-skeleton", "Beast Skeleton", "bsw", "x", 2, 1, "The bones of a giant beast."],
  ["ruined-wall", "Ruined Wall", "jg", "x", 2, 1, "A stretch of ancient wall under creepers."],
  ["broken-catapult", "Broken Catapult", "wg", "x", 2, 1, "A siege engine abandoned after a battle."],
];

export const DECORATION_KINDS: readonly DecorationKind[] = ROWS.map(
  ([id, name, terrains, kind, cols, looks, text]) => ({
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
    looks,
  }),
);

const BY_ID: ReadonlyMap<string, DecorationKind> = new Map(
  DECORATION_KINDS.map((d) => [d.id, d]),
);

/** The decoration kind with this id, or undefined. */
export function decorationKind(id: string): DecorationKind | undefined {
  return BY_ID.get(id);
}

/** The decoration kinds that suit a ground, passable ones or props. */
export function decorationKindsFor(
  terrain: Terrain,
  passable: boolean,
): readonly DecorationKind[] {
  return DECORATION_KINDS.filter(
    (d) =>
      d.passable === passable &&
      (d.terrains as readonly Terrain[]).includes(terrain),
  );
}
