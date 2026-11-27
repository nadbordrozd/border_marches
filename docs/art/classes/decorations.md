# Decorations asset contract

Status: draft (2026-11-25, bead `border_marches-bzc.48`; orchestrator call
under the user's "make all the decisions"). Specialises
[`../ART_DIRECTION.md`](../ART_DIRECTION.md) for the purely decorative map
pieces the user asked for: "passable decorations on the grass e.g. a tiny
butterfly, as well as impassable stuff like a big log".

## Inventory

Studio set `art/sets/decorations`; derived files in
`public/assets/terrain/decorations/<id>[-<n>].png`, listed in
`src/assets/decorations.ts` (`DECORATIONS`, `DECORATION_ASSETS`): per
decoration its id, name, one-line text, the grounds it suits, passable or
not, its footprint and its looks.

- **Passable decorations** (`passable: true`): small details a hero walks
  over, generated at 32 x 32 and cropped to about 15-30 px.
- **Impassable props** (`passable: false`): one cell (generated on 64 x 64,
  cropped to about 45-62 px) or two cells side by side (generated on
  128 x 64, cropped to about 100-125 px wide).

The catalogue (bzc.48): 24 passable decorations and 19 props (14 of one
cell, 5 of two cells; the fallen log and the toppled statue have two looks),
45 sprites from 16 PixelLab calls (US$1.31). Contact sheet:
[`../sheets/decorations.png`](../sheets/decorations.png); in context:
`npm run map:poster -- --map decorations --out <file.png>`.

| Kind | Id (name) | Grounds | Looks (px) |
| --- | --- | --- | --- |
| Passable | `butterflies` (Butterflies) | grass, jungle, steppe | 29x26 |
| Passable | `snail` (Snail) | grass, jungle | 25x18 |
| Passable | `songbird` (Songbird) | grass, steppe | 25x21 |
| Passable | `molehill` (Molehill) | grass, steppe | 28x17 |
| Passable | `mushroom-ring` (Mushroom Ring) | grass, jungle | 28x23 |
| Passable | `hedgehog` (Hedgehog) | grass | 27x21 |
| Passable | `autumn-leaves` (Autumn Leaves) | grass, steppe | 29x20 |
| Passable | `clover` (Clover) | grass, jungle | 25x23 |
| Passable | `dragonfly` (Dragonfly) | jungle, grass | 22x19 |
| Passable | `tree-frog` (Tree Frog) | jungle | 24x19 |
| Passable | `swamp-reeds` (Swamp Reeds) | jungle, grass | 23x29 |
| Passable | `jungle-flower` (Jungle Flower) | jungle | 26x20 |
| Passable | `thistles` (Thistles) | steppe, grass | 26x30 |
| Passable | `crow` (Crow) | steppe, grass, wasteland | 28x23 |
| Passable | `cart-wheel` (Cart Wheel) | steppe, grass | 26x24 |
| Passable | `cairn` (Cairn) | steppe, badlands | 24x25 |
| Passable | `lizard` (Lizard) | badlands, steppe | 26x21 |
| Passable | `agave` (Agave) | badlands, steppe | 24x20 |
| Passable | `pot-shards` (Broken Pot) | badlands | 28x24 |
| Passable | `scorpion` (Scorpion) | badlands, wasteland | 22x23 |
| Passable | `grave-marker` (Grave Marker) | wasteland | 20x26 |
| Passable | `dead-weeds` (Dead Weeds) | wasteland | 28x23 |
| Passable | `toadstools` (Toadstools) | wasteland, jungle | 24x23 |
| Passable | `broken-spear` (Broken Spear) | wasteland | 24x27 |
| Prop 1x1 | `big-boulder` (Big Boulder) | grass, steppe, jungle | 58x52 |
| Prop 1x1 | `stump-cluster` (Stumps) | grass, steppe | 56x44 |
| Prop 1x1 | `broken-cart` (Broken Cart) | grass, steppe | 54x53 |
| Prop 1x1 | `standing-stones` (Standing Stones) | grass, steppe, badlands | 50x61 |
| Prop 1x1 | `giant-mushroom` (Giant Mushroom) | jungle, grass | 56x61 |
| Prop 1x1 | `thornbush` (Thornbush) | steppe, badlands, wasteland | 61x54 |
| Prop 1x1 | `dead-tree` (Dead Tree) | wasteland, badlands | 54x61 |
| Prop 1x1 | `termite-mound` (Termite Mound) | steppe, badlands | 54x62 |
| Prop 1x1 | `ruined-pillars` (Ruined Pillars) | grass, steppe, badlands | 53x62 |
| Prop 1x1 | `stone-head` (Stone Head) | jungle | 62x61 |
| Prop 1x1 | `beast-skull` (Beast Skull) | wasteland, steppe, badlands | 64x52 |
| Prop 1x1 | `basalt-spikes` (Basalt Spikes) | wasteland, badlands | 51x61 |
| Prop 1x1 | `saguaro` (Saguaro) | badlands | 42x62 |
| Prop 1x1 | `hollow-stump` (Hollow Stump) | jungle, wasteland | 62x61 |
| Prop 2x1 | `fallen-log` (Fallen Log) | grass, jungle, wasteland | 123x63, 112x60 |
| Prop 2x1 | `toppled-statue` (Toppled Statue) | grass, jungle | 110x46, 107x59 |
| Prop 2x1 | `beast-skeleton` (Beast Skeleton) | badlands, steppe, wasteland | 113x61 |
| Prop 2x1 | `ruined-wall` (Ruined Wall) | jungle, grass | 128x60 |
| Prop 2x1 | `broken-catapult` (Broken Catapult) | wasteland, grass | 90x63 |
| Passable | `arctic-hare` (Arctic Hare) | snow | 22x28 (2 looks) |
| Passable | `snowy-owl` (Snowy Owl) | snow | 25x25 (2) |
| Passable | `fox` (Fox) | snow | 29x21 (2) |
| Passable | `snowman` (Snowman) | snow | 28x25, 18x30 |
| Passable | `frozen-shrub` (Frozen Shrub) | snow | 23x20, 23x22 |
| Passable | `snow-tufts` (Snow Tufts) | snow | 23x20, 24x22 |
| Passable | `paw-prints` (Paw Prints) | snow | 22x22, 23x22 |
| Passable | `ice-crystals` (Ice Crystals) | snow | 22x21, 22x22 |
| Prop 1x1 | `ice-boulder` (Ice Boulder) | snow | 61x55, 62x53 |
| Prop 1x1 | `ice-spire` (Ice Spire) | snow | 48x61, 46x61 |
| Prop 1x1 | `abandoned-sled` (Abandoned Sled) | snow | 62x42, 61x41 |
| Prop 1x1 | `snowdrift` (Snowdrift) | snow | 62x57, 62x60 |
| Prop 2x1 | `mammoth-skeleton` (Mammoth Skeleton) | snow | 127x55, 128x49 |
| Prop 2x1 | `frozen-log` (Frozen Log) | snow | 124x63, 121x64 |

Winter (bead bzc.87, set `winter-decorations`, 5 calls): 8 passable kinds
and 6 props, two looks each, snow only, so every other ground decorates as
before. The hare and the fox move a little, the owl hops
(`LIVING_MOTION`). Snow gets a second sprinkle of its own passable
decorations (`DECORATE.snowExtraShare`, its own random stream). The frozen
shrubs and straw tufts keep a thin snow-coloured base: on the snow ground
it reads as a little drift, so they were accepted.

### The desert (bead bzc.88)

Studio set `art/sets/desert-decorations` (same recipes and crops as above),
sand only, two looks each: passable `desert-tumbleweed` (Tumbleweed),
`scarab`, `dry-grass`, `desert-flower`, `barrel-cactus`, `ox-skull`,
`sand-snake`, `pear-pads` (Prickly Pear), `bone-heap` (Old Bones),
`dry-shrub` and `fennec`; props `sandstone-boulder`, `broken-column` and
`buried-head` (1x1), `fallen-pillar` and `temple-ruin` (2x1). The lizard,
scorpion, saguaro, beast skull and beast skeleton also stand on sand. The
tumbleweed and the skull share a subject with steppe doodads, so the sand
draws no imported doodads (its art family has none): the two never meet. Living ones
move (`LIVING_MOTION`): the tumbleweed rolls a few pixels to and fro, the
scarab creeps, the fennec breathes, the snake flicks. The sand gets a
second, sand-only pass of single passable pieces (`DECORATE.sandBias`).
Three recipes (`small-a`, `props-2x1-a`, `props-2x1-b`) were refused by the
provider's policy check (no candidates); they are recorded as `FAILED`.

They are new subjects, not repeats of the older doodads (bushes, flower
patches, stones, mushroom pairs, ferns, palms, small logs, tumbleweed, the
cattle skull, cacti, rocks, the small crater, stumps, bones, ash, twigs):
`tests/assets/decorations.test.ts` checks no id equals a doodad kind.

`?view=map&map=decorations` shows every look on each ground beside a hero.

### The frosting (bead bzc.115)

Studio set `art/sets/candy-decorations` (same recipes and crops as above;
4 calls), frosting only, so every other ground decorates as before.
Passable, two looks each: `gumdrops`, `cane-sprig` (Candy Cane),
`melting-cone` (Melting Ice Cream: a dropped cone melting into a puddle),
`gummy-worm`, `sugar-mouse`, `sprinkles`, `marshmallows`,
`licorice-knot`, `chocolate-drops` and `gingerbread-rabbit`. Props:
`giant-cupcake`, `gumdrop-boulder` and `rock-candy` (1x1, two looks),
`fallen-cane` (Fallen Candy Cane), `chocolate-bar` and
`gingerbread-fence` (2x1). Living ones move (`LIVING_MOTION`): the gummy
worm creeps, the sugar mouse twitches, the gingerbread rabbit breathes.
The frosting gets a second sprinkle of its own passable decorations
(`DECORATE.frostingExtraShare`, its own random stream, rounded up so a
crowded candy zone still gets one).

Rejected on sight in this set: loose round candies, wrapped sweets and
stars (coins and pickups), a heap of jelly beans (a gem pile), licorice
shapes that read as letters, a small lollipop and a giant melting cone
(repeats of the lollipop trees and of the passable cone), purple and
primary colourways off the Kingdom's palette (FACTION_CANDY 10.1).

## Placement (bead bzc.72)

The art-free kinds (id, name, line, grounds, passable, footprint, number of
looks) live in `src/data/decorations.ts`, so the map code can place them;
`src/assets/decorations.ts` adds the sprites. `src/core/map/decorate.ts`
places them last on every map (generated maps after their objects, named
maps after their edits), seeded from the map: `GameMap.decorations` lists
them and each prop cell carries `MapCell.prop`, which `isPassable` reads, so
pathfinding, the AI and every reach check treat a prop as a wall (also on
the Green Road). They are saved with the map. `MapView.setMap` draws the
map's own decorations; a passable one stands on a point of its cell picked
by a hash of the cell. Their cells count as featured, so doodads and spill
trees keep off them. Props get a soft contact and cast shadow.

Rules (orchestrator calls under "decide yourself"; tunables in
`DECORATE`):

- Passable: about 7 per 100 open cells, in clusters of one to three (one
  kind or a little mix of the ground's), never on a road, an object, a pass
  or gap corridor, beside a pickup or artifact (no loot look-alikes) or in a
  town's yard.
- Props: about 2.6 per 100 open cells, three cells apart. Half in place of
  an edge tree with open ground to its south (a wall stays a wall, so
  movement is unchanged; the wood keeps its outline: no lone or
  corner-joined trees). The rest on open ground, mostly against forest and
  rock: two cells from every entrance (off approaches and zones of
  control), three from a town's entrance, off roads and corridors, never
  leaving a way less than two cells across, the open cells round it joined
  close by, and a way round it at most one step dearer. Two-cell props are
  tried first along the woods.
- Hovering a prop names it with its line and "Blocks the way."

## Geometry

| Kind | Generated on | Derived file | Seat |
| --- | --- | --- | --- |
| Passable | 32 x 32 | opaque box + 1 px (at most 32 px a side) | foot on a ground point in its cell, default the cell centre |
| Prop, 1 cell | 64 x 64 | opaque box + 1 px | foot on the cell's bottom centre, `SEAT_PX.site` (4 px) above its bottom |
| Prop, 2 cells | 128 x 64 | opaque box + 1 px | foot on the footprint's bottom centre, 4 px above its bottom |

- Generated at native display size; never scaled, never mirrored.
- Crop: the opaque box plus 1 px left, right and top; the last row is the
  foot (bottom centre of the image). Stray rows a tiled neighbour leaves at
  the canvas edge are cropped away.
- Props never rise above their own row (at most 76 px tall), so they draw
  in the body pass with the trees and peaks, sorted by their foot; heroes
  and objects draw over passable decorations.

## Readability

- Hierarchy: units > towns > map objects > props and trees > decorations >
  ground. Props use the prop class layer (dark outer outline, soft inner
  lines, calmer than buildings); decorations the doodad class layer.
- A passable decoration is smaller than a 40 px pickup and never a thing a
  player would try to pick up: helmets, whole jars and anything shiny are
  rejected as loot look-alikes.
- Rejected on sight: ground patches or earth smears under the piece, plan
  views from straight above, rings that read as a well, near duplicates of
  a doodad or another decoration, thin lines that turn to noise at 1x.

## Recipe

`generate-image-v2`, no background, no style image (like the doodads,
trees and peaks of the same layer). Layers: `style`, `light-south-west`,
`class-doodad` (passable) or `class-prop` (props), subject. One call per
ground for passable decorations with a mixed subject ("each image a
different one of these: ..."): 64 candidates at 32 x 32, about 16 of each
subject. Props: four subjects per 64 x 64 call (16 candidates); one subject
per 128 x 64 call (4 candidates).

Worked: colours as hex; "small and low, about half of the image wide, much
smaller than a person" for passable details; "fills one map cell, about
three quarters of the image wide" for props; "across the image from left
to right, nearly the full image wide" for two-cell props.

Did not work: "two dragonflies" gives one; a crater seen from the front
comes back as a plan view or a stone ring; "half sunk in the earth" draws
an earth patch (a ground plate); a raven duplicates the crow; a rusty
helmet, a whole jar and a golden haystack read as loot or a resource pile;
a spear without its head reads as a twig.

## Acceptance

- Reviewed per recipe on a contact sheet (native and enlarged, light and
  dark), then in context with `?view=map&map=decorations`.
- `tests/assets/decorations.test.ts`: every look is a manifest asset with
  its foot on the last row, passable looks at most 32 px, props inside
  their footprint and row.
