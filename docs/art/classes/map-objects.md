# Map objects asset contract

Status: draft (2026-11-24, bead `border_marches-bzc.16`; orchestrator call
under the user's "make all the decisions"). Specialises
[`../ART_DIRECTION.md`](../ART_DIRECTION.md) for the visitable sites,
dwellings, banks, gates and treasures of
[CONTENT_MAP_OBJECTS.md](../../design/CONTENT_MAP_OBJECTS.md).

## Inventory

Studio set `art/sets/map-objects`; derived files in
`public/assets/objects/map/<type>[-<variant>].png`, listed in
`src/assets/map-objects.ts` (`MAP_OBJECT_TYPES`, `MAP_OBJECT_ASSETS`,
`REUSED_OBJECT_ART`). The game looks art up with `artFor(type, variant)` in
`src/assets/object-art.ts`; `placeArt` gives the draw position on a
footprint.

- Type ids are the catalogue names in kebab case (`stopped-belfry`,
  `keymasters-tent`, `two-way-waystone`).
- Variants: bank sizes `small`, `medium`, `large` (all six banks); stat
  shrines `attack`, `defense`, `power`, `lore`; school shrines `tier-1` to
  `tier-3`; school temples by school (`bloom`, `accord`, `clock`, `hush`,
  `storm`); faction outposts `humans`, `undead`, `goblins`; key colours
  `red`, `blue`, `green`, `yellow` for the keymaster's tent and the border
  gate; waystone pair colours `teal`, `amber`, `crimson`, `blue`; resource
  piles by resource. `artFor` without a variant gives the first one.
- Colour variants that only change one part (the border gate's padlock,
  the waystone's portal, the yellow tent) are the accepted take with its
  pixels of one hue range turned to another hue, recorded as `edits` steps
  in `outputs[]` (same saturation and lightness; the yellow tent also gets
  a lift so it reads as yellow, not olive).

### Coverage (bzc.16)

| | Types |
| --- | --- |
| New studio art (53) | windmill, water wheel, orchard, haunted mine, faction outpost (3), stray hut, caretaker lodge, stat shrine (4), learning stone, arena, library, tree of knowledge, academy, tutor's hut, school shrine (3), hermit, rally camp, oasis, school temple (5), mana well, stables, sanctuary, observatory, scholar, the six banks (3 sizes each), keepers' vault, campfire, loose artifact, loose scroll, fallen adventurer, obelisk, keymaster's tent (4), border gate (4), seer hut, quest gate, prison, trading post, tollhouse, drill yard, curse-lifter's shrine, roadside inn, altar of sacrifice, two-way waystone (4), one-way waystone, pylon, event tile (a sparkle shimmer), sealed box, sign |
| Reused (3) | wishing well, treasure chest, resource pile (4) |
| No art by design (2) | buried keystone, buried cache (hidden) |

All 53 core and 9 stretch types are covered: 85 derived sprites, 35
PixelLab calls (US$2.87).
- Reused, not regenerated: the four resource pickups; the imported chest
  (treasure chest) and wishing well.
- Mines (bead `border_marches-bzc.30`): the sawmill, ore pit, gold mine
  and essence spring reused their older 72-80 px art until bzc.30 remade
  them at 2x2-site scale with the same recipe (`sawmill-b`, `ore-pit-b`,
  `gold-mine-b`, `essence-spring-c`; 6 PixelLab calls, US$0.48). The
  sawmill was redrawn chunkier by bead bzc.97 (`sawmill-c#0`, the roadside
  inn as style image: a plump plank mill with a dormer and a saw blade
  biting a log on a trestle, 108 x 88). The
  older art stays in the manifest (`RESOURCE_MINES`) but is no longer
  drawn; the haunted mine keeps `haunted-mine-a#2`, already at that
  scale (the remake `haunted-mine-b` had glow halos). See Mines below.
- Buried keystone and buried cache are hidden: `artFor` returns null and
  nothing is drawn. A type without art, or an unknown id, gets the imported
  roadside shrine flagged `placeholder: true`.

Winter sites (bead bzc.87, set `winter-objects`, 4 calls, same recipe and
style image): Frost Giant's Barrow (small, medium, large), Aurora Spire,
Hunter's Lodge, Walrus Rookery; `ART_ROWS` name their takes as
`@winter-objects/<take>`.

The per-type coverage, takes and verdicts are in
`art/sets/map-objects/verdicts.json` (every take has a one-line reason).

### Desert sites (bead bzc.88)

Studio set `art/sets/desert-sites`, same recipe as above (the sawmill as
style image, native size): the Pyramid on 200 x 144 (3x2), the Sphinx, the
Sun Temple and the Sunken Tomb on 128 x 128 (2x2), one look each (the
tomb's small and medium sizes share it). `ART_ROWS` names them by
`desert-sites/<take>`. The first Pyramid recipe (`pyramid-a`, with jackal
guardians and the word tomb) was refused by the provider's policy check
and is recorded as `FAILED`.

### Candy sites (bead bzc.124)

Studio set `art/sets/candy-sites`, the desert sites' recipe with the
chunky roadside inn (`map-objects/inn-a#0`) as style image for outline,
pixel size, chunky shapes and viewing angle (the bzc.97 chunky style), in
the Candy Kingdom's palette (gingerbread `#b86b34`, royal icing `#fff4ec`,
strawberry pink `#e2589b`, mint `#7fd6b5`, candy-cane red `#e03a3e`): the
Gingerbread Cottage (`cottage-a#2`, 109 x 102; one look for its medium and
large sizes), the Sugar Fountain (`fountain-a#0`, 101 x 112) and the Sweet
Shop (`shop-a#1`, 115 x 102), all 2x2 on 128 x 128, doors at the front
left. 3 calls (US$0.24), four takes each; white-roofed cottages were
rejected as reading like snow. The fountain is the palest of the three on
frosting; its black outline, white rim and red lollipop carry it.
### Volcanic sites (bead bzc.125)

Studio set `art/sets/volcanic-sites`: the Infernal Forge and the Brimstone
Pit (three sizes from one call) on 128 x 128, the Shrine of Embers on 64 x
64, with the roadside inn (`map-objects/inn-a#0`) as style image for the
chunky rounded shapes, as the chunky towns of bead bzc.97. 3 calls.

### Swamp sites (bead bzc.126)

Studio set `art/sets/swamp-sites`, same recipe as above (the sawmill as
style image, native size): the Witch's Hut (a shack on stilts with a
ladder and glowing windows) and the Drowned Temple (mossy, tilted temple
ruins with a stone face over the door) on 128 x 128 (2x2), the Hag's
Cauldron on 64 x 64 (1x1), one look each (the temple's three sizes share
it). `ART_ROWS` names them by `@swamp-sites/<take>`.

### Sea and coastal sites, and ships (bead bzc.158)

Studio sets `art/sets/sea-objects` and `art/sets/ships`, for the naval
layer of [NAVAL.md](../../design/NAVAL.md) (sections 5 and 10). Same recipe
as the candy and volcanic sites: `generate-image-v2` at native size, the
chunky roadside inn (`map-objects/inn-a#0`) as style image for outline,
pixel size, chunky shapes and viewing angle only. Two new class layers:

- `class-sea-object` (sea sites, entrance a sea cell): the site rises out of
  undrawn water, its bottom a flat waterline hugged by a thin white foam
  band (`#f2fbfc`, two or three pixels); everything around it transparent,
  so the map's own water shows. About half the accepted takes kept the band
  (pearl bed, buoy, mermaid rock, Sirens' Rock, small coral grotto,
  whirlpool); the grottos, wrecks, lighthouse islet and the shrine meet the
  water with their own rock or planks. If the map wants a foam ring under
  every sea site, it is a code overlay like the pickups' ripple (follow-up
  for the render bead), not a re-roll.
- `class-ship`: a chunky toy boat seen from the side and slightly above,
  bow to the right, the hull cut flat at the waterline; no water, wake or
  foam (the bob and the wake are code, NAVAL.md 10.1).

Coastal sites (Fishing Village, Pirate Cove, Shipwright, Ferry Landing)
stand on the shore and use `class-map-object` like the land sites. Pickups
(Flotsam, Sea Chest, Castaway, Message in a Bottle) get the style and light
layers and the subject only, as the artifact pickups, 40 x 40, at the
pickup seat; their bob and ripple ring are code (NAVAL.md 5.6).

| Type | Footprint | Take | Derived |
| --- | --- | --- | --- |
| Pearl Bed | 2x2 sea | `pearl-bed-a#0` | 117 x 69 |
| Siren Grotto | 2x2 sea | `siren-grotto-a#0` | 110 x 91 |
| Sirens' Rock | 2x2 sea | `sirens-rock-a#0` | 106 x 106 |
| Shipwreck small / medium / large | 2x2 sea | `shipwreck-a#0`, `#1`, `#2` | 89 x 71, 109 x 84, 121 x 104 |
| Coral Grotto small / medium / large | 2x2 sea | `coral-grotto-a#0`, `#1`, `#3` | 79 x 58, 104 x 80, 121 x 108 |
| Kraken's Deep | 3x2 sea | `krakens-deep-a#0` | 146 x 108 |
| Buoy, Mermaid Rock, Shrine of the Tides, Whirlpool | 1x1 sea | `tiny-a#0`, `#4`, `#10`, `#15` (one call, four subjects) | 44 x 60, 62 x 55, 52 x 60, 60 x 50 |
| Lighthouse (on its islet) | 1x1 sea | `lighthouse-a#0` (64 x 96 canvas) | 55 x 80 |
| Fishing Village | 2x2 coastal | `fishing-village-a#0` | 117 x 93 |
| Pirate Cove | 2x2 coastal | `pirate-cove-a#3` | 112 x 100 |
| Shipwright | 3x2 coastal | `shipwright-a#0` | 164 x 105 |
| Ferry Landing | 1x1 coastal | `ferry-landing-a#9` | 61 x 58 |
| Flotsam, Sea Chest, Castaway, Message in a Bottle | 1x1 sea pickups | `pickups-a#0`, `#9`, `#19`, `#29` (one 40 x 40 call, four subjects, 36 candidates) | 31 x 27, 26 x 30, 31 x 31, 30 x 29 |
| Moored Boat | 1x1 sea | `ships/moored-a#0` | 96 x 82 |

The Sea Chest keeps a tuft of seaweed on its lid so it is not the land
treasure chest; the Castaway is a survivor waving on a log raft (a person,
as NAVAL.md 5.6 asks).

The whirlpool is drawn whole (rocky rim round a white foam spiral): every
take with an empty middle read as a hole or a pond. NAVAL.md 10.2 wanted
only the rim with the water spinning in code; the render bead can spin an
overlay on top, or cut the middle with a recorded `edits` step.

**Ships** (set `ships`, 96 x 88 canvas, one facing, never mirrored): the
sailing ship `sailing-b#2` (96 x 85), the moored ship `moored-a#0` (96 x
82, made with the sailing take as a reference image so the hull matches;
it is also the Moored Boat object's art, `moored-boat.png`), the pirate
ship `pirate-a#0` (95 x 86, the Corsair guard on the map). The first
recipe (`sailing-a`) gave long galleons with pointed bows, rejected for
NAVAL.md's "round boats like bath toys"; `sailing-b` asked for a short deep
tub hull. NAVAL.md 10.2 estimated Pixen; `generate-image-v2` with the inn
as style image keeps the ships in the map objects' style. Ships are 96 px
wide on their one cell (8 px over each side), the foot at the bottom
centre on the waterline.

Owner colour: the sailing and moored ships' sail and pennant are plain
white `#f5f1ea` (light `#fcf9f7`, `#e6e1d8`) with a pale grey shadow
(`#cdc7be`, `#d8d0c5`). `SHIP_ART[look].ownerKey` in
`src/assets/map-objects.ts` lists the exact colours; the renderer recolours
those pixels at x >= 26 to the owner's colour (grey for neutral), keeping
the shadow tone darker. The same colours left of x = 26 are the stern
lantern's glass and one highlight at the stern, and stay. The pirate's black
sail is not recoloured.

### Artifacts on the map and the Mystery Bag (bead bzc.105)

Studio set `art/sets/artifact-pickups`, the pickups' recipe (the sawmill as
style image, 40 x 40, one call of 25+ candidates each) with the layers
`style`, `light-south-west` and the subject only (the class layer forbids
letters and platforms, and these are a cloth and a bag with a question
mark). 2 calls, US$0.24.

- A loose artifact is drawn as **the artifact itself**: its own 32 px icon
  (`public/assets/icons/artifacts`, `iconFor("artifact", id)`) at 1:1,
  resting on a flat purple oval cloth with a gold rim
  (`artifact-cloth.png`, 38 x 17, from `cloth-a#0`): the cloth's foot on
  the pickup seat (22 px above the cell's bottom), the icon's bottom edge
  4 px above it, so it sits on the middle of the cloth; the shared ground
  shadow under the cloth. The renderer does it
  (`artifactPickupEntry` in `src/render/map/scene.ts`); no per-artifact art
  is made. The older amulet-on-cloth sprite (`loose-artifact.png`) stays
  for the gallery and for a loose artifact with no artifact id.
- The Mystery Bag (`mystery-bag.png`, 27 x 31, from `mystery-a#15`): a
  purple sack tied with gold cord and a big gold question mark, seated like
  the other pickups. Purple is the colour of artifact pickups (the cloth
  and the bag); brown stays the chest's and the sealed box's.
- The recipe concept says "satchel": the brown satchels came out close to
  the chest and the box, so the purple sack was chosen and the type named
  the Mystery Bag.

## Geometry

| Footprint | Generated on | Derived file | Seat |
| --- | --- | --- | --- |
| 1x1 site | 64 x 64 | opaque box + 1 px (about 30-56 x 40-62) | foot 4 px above the cell's bottom |
| 1x1 pickup (campfire, loose artifact and scroll, sealed box, event shimmer) | 40 x 40 | opaque box + 1 px | foot 22 px above the cell's bottom (about mid-cell) |
| 2x2 site | 128 x 128 | opaque box + 1 px (about 70-128 wide) | foot 4 px above the footprint's bottom |
| 3x2 vault | 200 x 144 | opaque box + 1 px | foot 4 px above the footprint's bottom |

- Generated at native display size; never scaled, never mirrored (the sun
  is at the bottom left).
- Crop: the opaque box plus 1 px on the left, right and top; the last row
  is the foot. The foot point is the bottom centre of the derived image and
  stands on the footprint's bottom centre, `SEAT_PX` above its bottom edge.
- A 2x2 site is at most two cells wide (128 px of a 160 px footprint) and
  rises up to about one and a half cells, so tall sites (windmill, belfry)
  overlap the row behind like towns do.
- Entrances: the catalogue's entrance is the bottom centre cell (bottom
  left for an even width); prompts ask for the door at the front left.

## Readability

- Hierarchy: units > towns > map objects > trees and rocks > ground. Map
  objects keep the bold black outline of the imported buildings and towns,
  but their colours stay calmer than units: no saturated school colour
  covers more than a dome, a banner or an emblem.
- Rejected on sight: smoke and glow smears (no blur), loud magenta or red
  bodies, people or creatures in the image, ground plates, near duplicates
  of an accepted take, clutter that turns to noise at 1x.
- School colours (prompt hex, used only as accents): Bloom green `#4fa04a`,
  Accord crimson `#c8423a` (wax seals), Clock brass `#d9a63a`, Hush slate
  violet `#6c6a9e`, Storm electric blue `#4aa8e8`. Faction accents follow the
  faction documents: humans `#2f6fd0`, undead `#7a4fb5`, goblins `#5fa52a`
  with hazard yellow `#f2c230`.

## Recipe

`generate-image-v2`, no background, layers `style`, `light-south-west`,
`class-map-object`, subject; style image: the imported sawmill
(`public/assets/objects/sawmill.png`) for outline, pixel size, shading and
viewing angle only (`color_palette: false`). One call returns 16 candidates
at 64 x 64, 25 at 40 x 40 and 4 at 128 x 128.

Worked:

- Four subjects in one 64 x 64 call ("each image a different one of
  these: ...") gives about four takes of each, in the listed order.
- Bank sizes in one 128 x 128 call: "each image a different size of it: a
  small modest one, a medium one, a large grand one, and another large grand
  one".
- Faction variants in one call ("each image a different faction's: ...").
- Colours as hex with a shadow tone; "its front facing the viewer straight
  on" and "nearly the full image wide" for 2x2 sites.

Did not work: `camera-three-quarter` plus the class layer runs past the
2000-character limit (the class layer carries the view instead). A second
call for the same subject can come back at another scale (temple-b's
rotundas are smaller than temple-a's): ask for the fill ("nearly the full
image width") in every subject.

Watch for: generate-image-v2 tiles its candidates on one sheet, and a few
rows of the neighbouring tile can show at a take's top or bottom edge. The
derived file keeps only the largest run of opaque rows (the crop in
`outputs[]` leaves the stray rows out).

Known limits: 2x2 sites are drawn in the three-quarter view of the
imported sawmill and the 3x2 towns (a front face and one side), the vault
straight front-on.

## Mines

The game keeps every mine on a 2x1 footprint (`src/data/objectTypes.ts`,
entrance the right cell), but draws it at 2x2-site scale: about 100-125 px
wide and 85-118 px tall, generated on 128 x 128, its foot on the
footprint's bottom centre `SEAT_PX` above the bottom edge, so it rises over
the row behind like the other tall sites. The mine's door or steps are at
the front right, over the entrance cell where the hero stands. The renderer
(`objectEntries` in `src/render/map/scene.ts`) draws every `mine` object
with `artFor(mineType(obj))`: its recorded type, else the mine of its
resource.

## Owner flags

Bead bzc.146 (user: the old flags were "a bit too small and too ugly";
"generate a nice pixel sprite for it and programmatically change color";
placing it must not be "jarring"). One sprite flies on every owned town,
mine and flagged dwelling (faction outposts, stray huts, caretaker lodges,
walrus rookeries); unowned buildings fly none.

- **Sprite.** Set `owner-flags`, take `flag-a#62`: a chunky rectangular
  flag in a gentle wave on a dark brown pole with a gold knob, thick black
  outline, generated at native size (generate-image-v2, 32 x 32, style
  image the sawmill) with a plain white cloth and grey folds; cropped to
  28 x 31 (`public/assets/objects/map/owner-flag.png`). The 48 px takes
  were thinner and less chunky than the map pieces.
- **Recolour.** In code (`src/render/map/owner-flag.ts`): every light,
  unsaturated pixel is cloth and maps onto a three-step ramp of the
  player's colour (the fold grey onto a darker, slightly cooler shade, the
  white onto the colour, the brightest onto a lighter tint); the outline,
  pole and knob keep their pixels. Every player colour, and a neutral grey,
  reads on every ground thanks to the black outline.
- **Wave.** Four code-made frames: cloth columns shift by at most one pixel
  in a sine travelling from the pole, 200 ms a frame, on the terrain-motion
  clock; with terrain motion off (reduced motion among the reasons) frame
  0 holds. A capture hoists the flag out of its roof over 520 ms with a
  gold sparkle round the cloth (skipped under reduced motion).
- **Placement.** Per-sprite anchors in `src/assets/owner-flag.ts`, chosen
  by looking at each sprite: the pole stands on a high roof, turret, hut
  top, totem, water tower or rock shoulder right of the building's centre,
  2-8 rows of pole showing under the cloth, so the cloth flies right over
  sky or roofs, the gate and a hero at the entrance stay clear, and the
  town's own landmark stays the highest point where it can. One size for
  every building, the way Heroes II flies one flag size on every mine and
  castle.
- **Depth.** The flag is a scene entry with its building's pass, row,
  column and layer, made after it: drawn right over its building, under
  anything in front (a hero at the gate) and over what stands behind.
- **Review.** `tests/ui/owner-flag-check.mjs` (muted, hand-built
  ownership on the map debug page): 1280 x 800 shots of each town, native
  and 2x crops of towns and sites, four wave frames.
- The faction outposts keep their baked faction flags (the undead's purple
  pennant, the goblins' green flags, the candy pink one); the owner flag
  stands apart on its own roof or tower.

## Acceptance

- No ground plate, shadow, people or second object in the image. The
  renderer adds the shared ground shadow (bead bzc.97, `groundShadows` in
  `src/render/map/scene.ts`): a contact ellipse as wide as about 0.8 of the
  sprite whose lowest edge is at most 1 px under the foot, and a fainter
  cast ellipse to the north-east, both drawn before any sprite.
- Lit from the left; no mirrored copies.
- Reviewed per recipe on a grid contact sheet (native and enlarged, light
  and dark), then in context on every terrain:
  `node tools/object-poster.mjs --out <file.png>` places every look of
  every type on a strip of each land terrain beside a unit.
