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

### Volcanic sites (bead bzc.125)

Studio set `art/sets/volcanic-sites`: the Infernal Forge and the Brimstone
Pit (three sizes from one call) on 128 x 128, the Shrine of Embers on 64 x
64, with the roadside inn (`map-objects/inn-a#0`) as style image for the
chunky rounded shapes, as the chunky towns of bead bzc.97. 3 calls.

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
