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
  v: "volcanic",
  n: "snow",
  d: "sand",
  f: "frosting",
};

/**
 * [id, name, terrains (letters g j s b w v n d f), "p" passable or "x" prop, cols,
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
  ["crow", "Crow", "sgwv", "p", 1, 1, "A crow watching the road."],
  ["cart-wheel", "Cart Wheel", "sg", "p", 1, 1, "An old cart wheel left by the way."],
  ["cairn", "Cairn", "sb", "p", 1, 1, "A little stack of stones someone left."],
  ["lizard", "Lizard", "bsd", "p", 1, 1, "A lizard basking on the warm ground."],
  ["agave", "Agave", "bs", "p", 1, 1, "A spiky agave, thirsty and tough."],
  ["pot-shards", "Broken Pot", "b", "p", 1, 1, "A clay pot, long broken and long empty."],
  ["scorpion", "Scorpion", "bwvd", "p", 1, 1, "A small scorpion with its tail up."],
  ["grave-marker", "Grave Marker", "w", "p", 1, 1, "A crooked plank over a forgotten grave."],
  ["dead-weeds", "Dead Weeds", "wv", "p", 1, 1, "Burnt, thorny weeds."],
  ["toadstools", "Toadstools", "wj", "p", 1, 1, "Pale toadstools nobody should eat."],
  ["broken-spear", "Broken Spear", "wv", "p", 1, 1, "A spear shaft from a battle long ago."],
  // Winter (bead bzc.87): snow only, so other grounds draw what they drew.
  ["arctic-hare", "Arctic Hare", "n", "p", 1, 2, "A white hare, nearly invisible until it moves."],
  ["snowy-owl", "Snowy Owl", "n", "p", 1, 2, "A snowy owl, watching with yellow eyes."],
  ["fox", "Fox", "n", "p", 1, 2, "A red fox curled up asleep in the snow."],
  ["snowman", "Snowman", "n", "p", 1, 2, "Someone built a snowman out here. Who?"],
  ["frozen-shrub", "Frozen Shrub", "n", "p", 1, 2, "A shrub hung with icicles."],
  ["snow-tufts", "Snow Tufts", "n", "p", 1, 2, "Dry grass poking up through the snow."],
  ["paw-prints", "Paw Prints", "n", "p", 1, 2, "Fresh tracks: something passed this way."],
  ["ice-crystals", "Ice Crystals", "n", "p", 1, 2, "Blue crystals of ice grown out of the frost."],
  // The desert (bead bzc.88, set desert-decorations): sand only.
  ["desert-tumbleweed", "Tumbleweed", "d", "p", 1, 2, "A tumbleweed, going wherever the wind goes."],
  ["scarab", "Scarab", "d", "p", 1, 2, "A scarab rolling its precious ball across the sand."],
  ["dry-grass", "Dry Grass", "d", "p", 1, 2, "A tuft of grass that has not seen rain for months."],
  ["desert-flower", "Desert Flower", "d", "p", 1, 2, "Pink flowers, out after the one rain of the year."],
  ["barrel-cactus", "Barrel Cactus", "d", "p", 1, 2, "A small round cactus wearing a yellow flower."],
  ["ox-skull", "Ox Skull", "d", "p", 1, 2, "A bleached ox skull: the desert keeps no secrets."],
  ["sand-snake", "Sand Snake", "d", "p", 1, 2, "A coiled sand snake, warming itself."],
  ["pear-pads", "Prickly Pear", "d", "p", 1, 2, "Two prickly pear pads with a fruit nobody dares pick."],
  ["bone-heap", "Old Bones", "d", "p", 1, 2, "Bones of a camel that did not make it."],
  ["dry-shrub", "Dry Shrub", "d", "p", 1, 2, "A grey thorny shrub, more twig than leaf."],
  ["fennec", "Fennec", "d", "p", 1, 2, "A fennec fox asleep in the shade of its own ears."],
  // Impassable props: they block the way.
  ["big-boulder", "Big Boulder", "gsj", "x", 1, 1, "A mossy boulder too big to climb."],
  ["stump-cluster", "Stumps", "gs", "x", 1, 1, "Three thick stumps of a cleared wood."],
  ["broken-cart", "Broken Cart", "gs", "x", 1, 1, "A farm cart tipped over and left to rot."],
  ["standing-stones", "Standing Stones", "gsb", "x", 1, 1, "Two old stones leaning together."],
  ["giant-mushroom", "Giant Mushroom", "jg", "x", 1, 1, "A mushroom the size of a hut."],
  ["thornbush", "Thornbush", "sbw", "x", 1, 1, "A thicket of thorns nobody walks through."],
  ["dead-tree", "Dead Tree", "wbv", "x", 1, 1, "A gnarled tree, long dead."],
  ["termite-mound", "Termite Mound", "sb", "x", 1, 1, "A tall mound full of busy termites."],
  ["ruined-pillars", "Ruined Pillars", "gsb", "x", 1, 1, "Broken columns of a forgotten temple."],
  ["stone-head", "Stone Head", "j", "x", 1, 1, "The mossy head of an ancient statue."],
  ["beast-skull", "Beast Skull", "wsbvd", "x", 1, 1, "The skull of something very big."],
  ["basalt-spikes", "Basalt Spikes", "wbv", "x", 1, 1, "Black rock spikes, sharp as knives."],
  ["saguaro", "Saguaro", "bd", "x", 1, 1, "A tall cactus waving at nobody."],
  ["sandstone-boulder", "Sandstone Boulder", "d", "x", 1, 2, "A boulder the wind has been carving for ages."],
  ["broken-column", "Broken Column", "d", "x", 1, 2, "A column of a temple the sand swallowed."],
  ["buried-head", "Buried Head", "d", "x", 1, 2, "The head of a great statue, sunk to its chin in sand."],
  ["fallen-pillar", "Fallen Pillar", "d", "x", 2, 1, "A great pillar that fell and broke where it lay."],
  ["temple-ruin", "Temple Ruin", "d", "x", 2, 1, "A sandstone wall and a doorway to nowhere."],
  ["hollow-stump", "Hollow Stump", "jw", "x", 1, 1, "The hollow stump of a giant tree."],
  ["fallen-log", "Fallen Log", "gjw", "x", 2, 2, "A huge fallen trunk across the way."],
  ["toppled-statue", "Toppled Statue", "gj", "x", 2, 2, "A stone king, fallen and broken."],
  ["beast-skeleton", "Beast Skeleton", "bswvd", "x", 2, 1, "The bones of a giant beast."],
  ["ruined-wall", "Ruined Wall", "jg", "x", 2, 1, "A stretch of ancient wall under creepers."],
  ["broken-catapult", "Broken Catapult", "wg", "x", 2, 1, "A siege engine abandoned after a battle."],
  // Winter props (bead bzc.87): snow only.
  ["ice-boulder", "Ice Boulder", "n", "x", 1, 2, "A boulder of clear blue ice, too slick to climb."],
  ["ice-spire", "Ice Spire", "n", "x", 1, 2, "Blue ice crystals taller than a rider."],
  ["abandoned-sled", "Abandoned Sled", "n", "x", 1, 2, "A sled left in the snow. Its owner did not come back."],
  ["snowdrift", "Snowdrift", "n", "x", 1, 2, "A wall of wind-packed snow."],
  ["mammoth-skeleton", "Mammoth Skeleton", "n", "x", 2, 2, "The bones of a woolly mammoth, tusks and all."],
  ["frozen-log", "Frozen Log", "n", "x", 2, 2, "A huge trunk frozen to the ground, hung with icicles."],
  // The Candy Kingdom's frosting (bead bzc.115, set candy-decorations):
  // frosting only, so other grounds draw what they drew.
  ["gumdrops", "Gumdrops", "f", "p", 1, 2, "Two sugared gumdrops, dropped by someone in a hurry."],
  ["cane-sprig", "Candy Cane", "f", "p", 1, 2, "A little candy cane planted in the icing like a flower."],
  ["melting-cone", "Melting Ice Cream", "f", "p", 1, 2, "A dropped ice-cream cone, melting into a sticky puddle."],
  ["gummy-worm", "Gummy Worm", "f", "p", 1, 2, "A gummy worm, wriggling home through the icing."],
  ["sugar-mouse", "Sugar Mouse", "f", "p", 1, 2, "A sugar mouse with a string tail. It squeaks, faintly."],
  ["sprinkles", "Sprinkles", "f", "p", 1, 2, "Sprinkles, as if someone shook the sky."],
  ["marshmallows", "Marshmallows", "f", "p", 1, 2, "Two plump marshmallows, soft as pillows."],
  ["licorice-knot", "Licorice Knot", "f", "p", 1, 2, "A licorice twist tied in a knot nobody can undo."],
  ["chocolate-drops", "Chocolate Drops", "f", "p", 1, 2, "Chocolate drops, going soft in the sun."],
  ["gingerbread-rabbit", "Gingerbread Rabbit", "f", "p", 1, 2, "A gingerbread rabbit, sitting very still. Too still."],
  // The volcanic plains (bead bzc.125, set volcanic-decorations): lava
  // only, so other grounds draw what they drew.
  ["lava-vent", "Lava Vent", "v", "p", 1, 2, "A crack in the basalt where the lava bubbles up to look around."],
  ["obsidian-shards", "Obsidian Shards", "v", "p", 1, 2, "Shards of black volcanic glass, sharp enough to shave with."],
  ["brimstone-pool", "Brimstone Pool", "v", "p", 1, 2, "A little pool of bubbling sulphur. It smells exactly as bad as you think."],
  ["charred-bones", "Charred Bones", "v", "p", 1, 2, "The bones of something that came too close to the lava."],
  ["fumarole", "Fumarole", "v", "p", 1, 2, "A stubby rock chimney puffing embers, like a giant's pipe."],
  ["fire-salamander", "Fire Salamander", "v", "p", 1, 2, "A fire salamander basking where anyone else would cook."],
  ["cinder-heap", "Cinder Heap", "v", "p", 1, 2, "A heap of warm ash with cinders still glowing in it."],
  ["fire-lily", "Fire Lily", "v", "p", 1, 2, "A fire lily: the only flower that likes it here."],
  ["ember-beetle", "Ember Beetle", "v", "p", 1, 2, "A beetle whose back glows like a coal. Do not pick it up."],
  ["smouldering-stump", "Smouldering Stump", "v", "p", 1, 2, "A burnt stump, still smouldering from the inside."],
  ["giant-cupcake", "Giant Cupcake", "f", "x", 1, 2, "A cupcake the size of a cottage, cherry and all."],
  ["gumdrop-boulder", "Gumdrop Boulder", "f", "x", 1, 2, "A boulder of mint gumdrop, far too sticky to climb."],
  ["rock-candy", "Rock Candy", "f", "x", 1, 2, "Pink and teal sugar crystals taller than a rider."],
  ["fallen-cane", "Fallen Candy Cane", "f", "x", 2, 1, "A candy cane as long as a house, fallen across the way."],
  ["chocolate-bar", "Chocolate Bar", "f", "x", 2, 1, "A giant bar of chocolate, broken in two and left."],
  ["gingerbread-fence", "Gingerbread Fence", "f", "x", 2, 1, "A gingerbread fence with gumdrop posts. Keep off."],
  // Volcanic props (bead bzc.125): lava only.
  ["basalt-columns", "Basalt Columns", "v", "x", 1, 2, "Six-sided columns of black basalt, as if someone stacked pencils."],
  ["demon-horn-rock", "Demon-Horn Rock", "v", "x", 1, 2, "Two great horns of rock. Something very large is buried here, or wants you to think so."],
  ["obsidian-spire", "Obsidian Spire", "v", "x", 1, 2, "A spire of black volcanic glass, too sharp to climb."],
  ["magma-boulder", "Magma Boulder", "v", "x", 1, 2, "A boulder still cracked with glowing lava. Warm to the touch, briefly."],
  ["charred-log", "Charred Log", "v", "x", 2, 1, "A fallen trunk burnt black, its cracks still glowing."],
  ["scorched-skeleton", "Scorched Skeleton", "v", "x", 2, 1, "The scorched bones of a great horned beast."],
  ["basalt-wall", "Basalt Wall", "v", "x", 2, 1, "A row of basalt columns the lava left standing."],
  ["obsidian-ridge", "Obsidian Ridge", "v", "x", 2, 1, "A low ridge of black glass broken into chunks."],
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
