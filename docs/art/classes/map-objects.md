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
| Reused (7) | sawmill, ore pit, essence spring, gold mine, wishing well, treasure chest, resource pile (4) |
| No art by design (2) | buried keystone, buried cache (hidden) |

All 53 core and 9 stretch types are covered: 85 derived sprites, 35
PixelLab calls (US$2.87).
- Reused, not regenerated: the sawmill, ore pit (the mined mountain), gold
  mine (gold claim) and essence spring; the four resource pickups; the
  imported chest (treasure chest) and wishing well.
- Buried keystone and buried cache are hidden: `artFor` returns null and
  nothing is drawn. A type without art, or an unknown id, gets the imported
  roadside shrine flagged `placeholder: true`.

The per-type coverage, takes and verdicts are in
`art/sets/map-objects/verdicts.json` (every take has a one-line reason).

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
straight front-on. The reused mines (72-80 px canvases) are smaller than
the new 2x2 sites; a 2x2 remake of the four mines is a follow-up.

## Acceptance

- No ground plate, shadow, people or second object in the image.
- Lit from the left; no mirrored copies.
- Reviewed per recipe on a grid contact sheet (native and enlarged, light
  and dark), then in context on every terrain:
  `node tools/object-poster.mjs --out <file.png>` places every look of
  every type on a strip of each land terrain beside a unit.
