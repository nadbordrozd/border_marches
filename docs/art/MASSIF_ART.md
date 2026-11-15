# Map beauty iteration 2: massif pieces, 3x2 towns, doodads (bead `border_marches-xaj.14`)

New adventure-map art made with the studio pipeline ([PIPELINE.md](PIPELINE.md))
in the inherited Bold chibi direction ([ART_DIRECTION.md](ART_DIRECTION.md)).
The target, in the user's words: "all the mountain ranges look unique ...
cleverly connected so that no matter the shape of the mountain range it looks
like a coherent whole and not like the same rock sprite pasted 20 times".
Before this bead every range was a field of near-identical snow-capped cones.

The art is wired into the renderer by bead `xaj.15` (see
[Wiring](#wiring-bead-xaj15)); bead `xaj.19` filled the set's gaps and
reworked the packing ([Iteration 4](#iteration-4-bead-xaj19)). The captures
[`screens/map-seed3-M-z075.png`](screens/map-seed3-M-z075.png),
[`screens/map-massif-seed3-z1.png`](screens/map-massif-seed3-z1.png) (a
sandstone canyon) and
[`screens/map-spine-seed2-z1.png`](screens/map-spine-seed2-z1.png) (a
north-south sandstone spine) show the result after xaj.19.

## What was made

| Class | Sets | Game files | Manifest |
| --- | --- | --- | --- |
| Mountains, grey granite (grass, jungle) | `art/sets/massif-granite` | 26 under `public/assets/terrain/massifs/granite/` | `MASSIF_PIECES` (palette `granite`) |
| Mountains, sandstone mesas (steppe, badlands) | `art/sets/massif-sandstone` | 19 under `.../massifs/sandstone/` | `MASSIF_PIECES` (palette `sandstone`) |
| Mountains, dark basalt and ash (wasteland) | `art/sets/massif-basalt` | 17 under `.../massifs/basalt/` | `MASSIF_PIECES` (palette `basalt`) |
| 3x2 towns | `art/sets/towns-3x2` | `public/assets/towns/dinosaur-town-3x2.png`, `goblin-hold-3x2.png` | `TOWN_3X2_ASSETS` |
| Doodads | `art/sets/doodads` | 26 under `public/assets/terrain/doodads/<terrain>/` | `DOODAD_ASSETS`, `doodadsOf(terrain)` |

Pieces per palette (file `<kind>-<cols>x<rows>-<letter>.png`, key
`massif-<palette>-<kind>-<cols>x<rows>-<letter>`):

| Kind | Footprint | Canvas | Granite | Sandstone | Basalt |
| --- | --- | --- | ---: | ---: | ---: |
| massif | 2x2 | 160 x 208 (up 48) | 3 | 2 | 2 |
| massif | 3x2 | 240 x 208 (up 48) | 3 | 2 | 2 |
| ridge | 3x1 | 240 x 128 (up 48) | 2 | 2 | 2 |
| ridge | 2x1 | 160 x 128 (up 48) | 3 | 3 | 3 |
| crag | 1x1 | 80 x 104 (up 24) | 3 | 3 (buttes) | 3 |
| rounded | 2x1 | 160 x 104 (up 24) | 3 | 3 (worn mesas) | - |
| rounded | 1x1 | 80 x 104 (up 24) | 2 | - | - |
| foothill | 2x1 | 160 x 104 (up 24) | 3 | - | 3 |
| foothill | 1x1 | 80 x 104 (up 24) | 2 | 3 | - |
| mine | 1x1 | 80 x 104 (up 24) | 2 | 1 | 2 |

## Geometry and metadata (what the wiring bead needs)

Every massif piece's canvas is its footprint plus a band above it:
`w = cols x 80`, `h = rows x 80 + up`, `up` 48 for massifs and ridges and 24
for everything else (the same bands as the imported tall and low pieces).
Draw a piece whose north-west footprint cell is `(x0, y0)` at
`(x0 x 80, y0 x 80 - up)`; nothing is drawn outside the canvas, so a piece
never paints sideways past its footprint columns.

`MassifPieceAsset` (in `src/assets/manifest.ts`):

```ts
{ key, path, w, h, category: "massif-piece",
  palette: "granite" | "sandstone" | "basalt",
  kind: "massif" | "ridge" | "crag" | "rounded" | "foothill" | "mine",
  cols: 1 | 2 | 3, rows: 1 | 2, variant, up: 24 | 48,
  paintUp,   // rows of paint above the footprint's top edge (up - box.y); negative = inside
  footGap,   // transparent rows under the lowest opaque row (the cell's ground shows there)
  box: { x, y, w, h },   // opaque bounding box in the canvas
  cap: "snow" | "ash" | "none",
  source }   // the accepted take, "<set>/<id>#<n>"
```

`MASSIF_PALETTE_TERRAINS` maps palettes to grounds: granite to grass and
jungle, sandstone to steppe and badlands, basalt to wasteland.
`massifPieces(palette, kind?, cols?, rows?)` filters.

- **Seating.** Each master was moved by whole pixels (crop + pad, recorded
  in `outputs[].steps`) so its opaque box is centred and its lowest row is
  `footGap` px above the canvas bottom: 8 for most pieces, 3 for the granite
  3x1 ridges (124 px of rock in 128), 6 for the cleaned granite 2x1 ridges,
  4 for the granite mine. The ragged foot is the art's own boulder edge: the
  generations have no straight base line, so no code foot cut was baked in.
  If the renderer cuts a foot as it does for the imported pieces, cut no
  higher than `footGap + 6` px.
- **Width.** Most massifs and ridges fill their footprint edge to edge (box
  x = 0, w = canvas width); their outermost columns are a vertical side of
  rock 10 to 50 rows tall (`granite massif-2x2-b`: 106 rows on its right),
  so place another piece or a back-fill against those sides, not open
  ground. Rounded and foothill 2x1 pieces keep a 12 px margin each side.
- **paintUp.** Massifs rise 21 to 35 px above their footprint, 2x1 ridges 20
  to 41, 3x1 ridges 41 to 47 (all within the 48 band); every 1x1 and every
  low piece rises at most 13 px, most stay inside their footprint. So the
  low pieces suit the top row of a range and range edges; massifs and
  ridges want rock (or nothing important) in the row behind.
- **Towns** (`Town3x2Asset`): 240 x 184 canvases, footprint 3 x 2 cells plus
  24 rows above, centred, lowest opaque row 4 px above the bottom
  (`contactY` = box.y + box.h). Lost World town: box 4,13 232 x 167 (rises
  11 px above the footprint); Warlord's Hold: box 4,10 232 x 170 (rises 14
  px; re-taken in bead xaj.19, it was 195 x 147 and read small). Yards
  inside the walls are transparent. No flag anchor: there is no flag. Entry
  cell: see [Iteration 4](#iteration-4-bead-xaj19).
- **Doodads** (`DoodadAsset`): cropped to the opaque box plus 1 px, 24 to 41
  px; `anchor` is the bottom centre `(floor(w / 2), h - 1)`.

Nothing is mirrored, and every piece measures lit from the left (luma of
the left half minus the right half: +2.5 to +58; the weakest are the mines
and two basalt 2x1 ridges, where the dark tunnel or the columns dominate).

## Review evidence

Sheets (each piece on its target ground at 1:1 and x2; rebuilt by
`sh art/review/massif-sheets.sh`):

- [`sheets/massif-granite.png`](sheets/massif-granite.png),
  [`sheets/massif-sandstone.png`](sheets/massif-sandstone.png),
  [`sheets/massif-basalt.png`](sheets/massif-basalt.png)
- [`sheets/towns-3x2.png`](sheets/towns-3x2.png)
- [`sheets/doodads.png`](sheets/doodads.png)
- Mock ranges, one per palette, built from the new pieces only:
  [`sheets/massif-mock-granite.png`](sheets/massif-mock-granite.png),
  [`sheets/massif-mock-sandstone.png`](sheets/massif-mock-sandstone.png),
  [`sheets/massif-mock-basalt.png`](sheets/massif-mock-basalt.png). The mock
  (`art/review/massif-mock.mjs`) is a greedy cover, biggest footprint first,
  plus the renderer's corner back-fill with 1x1 rounded or foothill pieces;
  it is not the game's packing.

What the mocks show: ranges now read as a few big, different masses (a
snowy three-summit massif next to a dome next to a cliff-and-peak block)
instead of one cone repeated, and the palettes tell the terrains apart at a
glance. They do not yet read as one continuous mass everywhere: with a
greedy cover, ground shows in the notches between neighbouring pieces and at
the joints between rows. The renderer's back-fill helps; the wiring bead
should also let the front row overlap the row behind (massif paint rises up
to 35 px) and prefer 3x2 and 2x2 pieces in the interior with ridges along
the edges, rounded and foothill pieces on the outer rim.

## Verdicts in short

Every take has a verdict and a one-line reason in its set's
`verdicts.json`.

- **Granite**: 18 calls, 39 takes, 27 accepted (26 shipped). Rejected:
  Pixen takes (a staircase on a soil slab, a masonry wall), egg-shaped
  boulder pairs, shard piles, a mine whose frame floats, a stump-like crag.
  `g-massif22-v2a#0` is accepted as the style image of the other palettes
  but not shipped: its shade is darker and bluer than the rest of the set.
- **Sandstone**: 13 calls, 34 takes, 19 accepted. Rejected: near-duplicate
  silhouettes, takes cut off by the image edge, stair-like notches. The
  sandstone mine has a timber mouth and rails but no cart.
- **Basalt**: 13 calls, 31 takes, 18 accepted (17 shipped; `b-low21-a#2`
  is an accepted spare). Rejected: duplicate silhouettes, an ash crescent
  that read as a ring, a hatched texture, a stray blob, edge-clipped mines.
- **Towns**: 7 calls. Lost World town: Pixen take with a grass yard; the
  first ground-removal edit erased the skull gate with the grass, the second
  ("change only the ground ... keep the skull gate") kept it. Warlord's
  Hold: Pixen drew a front elevation (rejected) and a fort with a solid grey
  yard (rejected); `generate-image-v2` with the imported goblin city as the
  style image matched the goblin palette but came back small; a second call
  asking for the full width was accepted. Known difference: the Lost World
  town is drawn chunkier (bigger huts and logs) than the Hold, whose pixel
  scale follows the imported goblin cities; side by side the Hold looks
  finer and emptier. A re-roll of either at the other's scale is a
  follow-up if the review wants them matched.
- **Granite crags** (`crag-1x1-*`) are darker than the rest of the set
  (mean luma about 95 against 115 to 145, heavier black outline); they read
  as rocky knolls on their own but stand out in a mock range when used as
  back-fill, so the mock back-fills with the 1x1 rounded and foothill pieces.
- **Sandstone `ridge-2x1-a`** (styled from granite without its palette) is
  a little paler and pinker than the later sandstone pieces.
- **Doodads**: 5 calls (one per terrain), 125 takes, 26 accepted: grass
  (bushes, flowers, stones, mushrooms), jungle (fern, palm, mossy boulder,
  leaves, log), steppe (tumbleweed, cattle skull, cactus, shrub, dry grass),
  badlands (rocks, crater, mesa stub, pillar), wasteland (stump, bones, ash
  puddle with embers, burnt twigs, stone). Ferns seen from straight above
  and saturated mushrooms were rejected.

## What worked and what did not (lessons)

- **`create-image-pixen` cannot draw terrain masses.** Asked for a massif it
  drew a carved staircase on a soil slab; asked for a ridge, a masonry wall.
  `generate-image-v2` with an imported mountain as the style image gave the
  right palette, outline and pixel density at the first call.
- **v2 copies the style image's silhouette** when the request has the
  style image's size (or nearly): `b-massif22-a` has exactly the outline of
  its style image `g-massif22-b` (mask difference 0.000), and the four
  candidates of one call share one outline (2 to 4%). One call therefore
  gives one silhouette: for variety, vary the style image per call (or its
  size), and keep one candidate per call per kind. The sandstone and basalt
  sets reuse granite silhouettes on purpose (they never meet in one range)
  but none repeats within its own palette.
- **v2 candidate counts**: 4 per call up to 170 px a side, 1 above (every
  2x2 and 3x2 massif and every 3x1 ridge cost one call per take), 25 at
  48 x 48 (a whole terrain's doodads from one call with a "each image a
  different one of these: ..." subject).
- **Background remnants**: v2 sometimes returns opaque `#fefefe` or white
  backgrounds (granite 2x1 ridges, badlands doodads, basalt crags). They
  are cleared by a recorded `edits` step (near-white or light neutral grey
  components that touch transparency or the edge), never by hand.
- **`color_palette: false`** in `style_options` with a granite style image
  and hex colours in the subject gave convincing sandstone and basalt; the
  following pieces of each palette then used an accepted piece of their own
  palette with the palette copied.
- A "1x1" request at 80 x 128 came back with a second rock fragment in the
  image; the main piece is kept by a recorded crop.

## Calls and cost

56 PixelLab requests for this bead (granite 18, sandstone 13, basalt 13,
towns 7, doodads 5), within the 80-call budget; the account reports no
per-call cost (`usd: null` in `art/costs.jsonl`).

## Follow-ups

- Done in `xaj.15` (below): the packing, palettes, back-fill, doodads and
  the 3x2 town sprites.
- A 1x1 tall piece per palette (a single peak rising 48 px) and 1x2
  vertical ridge pieces do not exist yet; a one-cell-wide north-south run
  is drawn with low singles and joint fills.
- Town entry cells for the 3x2 towns.

## Wiring (bead xaj.15)

`src/render/map/massif.ts` (`packRanges`) covers every Mountain cell
exactly, range by range (8-connected), as a pure function of the range's
own cells, packed over the whole map so nothing changes on reveal:

- **Palette** per cell: the majority of `MASSIF_PALETTE_TERRAINS` over the
  range's cells within 4 cells (a small range takes its majority ground, a
  long border range changes palette with its ground); patches under 4
  cells join their surroundings. No piece spans two palettes.
- **Massifs** (3x2, 2x2) first, greedily by a score that likes 3 columns,
  rock against the vertical sides and a coordinate hash. Sandstone massifs
  (four tall buttes of much the same silhouette) need a higher score and a
  ring of lower rock round them, so they are landmarks, not the bulk.
- **Rows**: the remaining run of each row is cut by dynamic programming
  into 3x1 and 2x1 ridges and singles (long pieces liked, a seam under a
  seam of the row behind disliked). A 2x1 on the back rim, in front of a
  tall piece of the same columns (a saddle in a north-south column) or at
  the front is sometimes a low rounded or foothill hump. Singles are low
  1x1 pieces (granite crags are not used: they are darker than the set).
- **Variants**: a hashed pick that avoids the sprites within 3 columns and
  a row of the piece.
- **Paint over an open cell** behind a piece is at most 32 px
  (`OPEN_RISE_MAX`) and is drawn in the foreground at the piece's top row,
  so it covers the feet of a hero behind the range, never his cell centre;
  bodies sort with their bottom row.
- **Fills**: a low 1x1 piece half a cell off the grid on every joint where
  four range cells meet (or two cells of a one-cell column), drawn behind
  the row in front; and low boulders straddling the foot of every open
  cliff side of a massif or ridge, 22 px into the open cell, drawn in
  front of the piece.
- **Rock base** (`ground.ts`): deep inside a range the scree's rock floor
  turns into the palette's shadowed rock, so a notch between pieces reads
  as a crevice of the same mountain.
- Ore mines draw the palette's mine piece on their blocked cell; a 3x2 town
  at full growth (level 3 or no level) draws its 3x2 sprite, a smaller one
  the imported camp of its level; the 26 doodads share 60% of each
  ground's doodad weight with the code-drawn ones.
- The generator (`gen/borders.ts`) keeps a mountain spine at least 2.5
  cells deep on its spine side and widens one-cell-wide columns where the
  zone has room (one-cell-wide columns: 7.3% of mountain cells before, 2.9%
  after, seeds 1-20 size M).

## Iteration 4 (bead xaj.19)

The xaj.15 review found the set's gaps: the four sandstone massifs were all
tower buttes and repeated visibly in badlands canyons, sandstone ranges were
busy with a boulder on every joint and side, north-south runs were stacks of
equal blocks, granite side boulders read as stairs, basalt massifs stood on
boxy column feet, the Warlord's Hold read small, and nothing rose as a single
summit or ran one cell wide north-south.

### New art

Same pipeline and geometry as above (v2 with an accepted piece as the style
image; seated by recorded crop + pad steps). New kinds in the manifest:
`peak` (1x1, canvas 80 x 128, up 48) and `spine` (1x2, canvas 80 x 208, up
48). Rows are at the end of `MASSIF_ROWS` in `src/assets/manifest.ts`.

| Palette | New game files | From |
| --- | --- | --- |
| granite | `peak-1x1-a/b/c` (snowy single summits, rise 9-13 px), `spine-1x2-a`, `foothill-1x1-c/d` (rounded boulder heaps) | `g4-peak11-a#0/2/3`, `g4-spine12-a#0`, `g4-boulder11-a#1/3` |
| sandstone | `massif-2x2-c` (fluted badlands hill), `massif-2x2-d` (striped domes), `massif-2x2-e` (hoodoo cluster), `massif-3x2-c` (domes), `massif-3x2-d` (table mesa with gullies), `massif-3x2-e` (long fluted ridge), `ridge-2x1-d` (low table with a canyon cleft), `ridge-3x1-c` (mesa crumbling into knobs), `peak-1x1-a/b/c` (capped hoodoos), `foothill-2x1-a/b/c`, `spine-1x2-a` (stepped fin) | `s4-*` |
| basalt | `massif-2x2-c` (ash-capped summit on wide scree aprons, no column box), `rounded-2x1-a`, `peak-1x1-a/b/c/d`, `spine-1x2-a` | `b4-*` |
| towns | `goblin-hold-3x2.png` re-taken: 232 x 170, the Lost World town's chunky scale, horned gate in the middle of the front wall | `towns-3x2/goblin-hold-v4a#0` |

Two takes came back too short for the footprint they were asked for and ship
one size down (recorded in their verdicts): the low table `s4-massif22-table`
as a 2x1 ridge, `s4-massif32-mixed` as a 3x1 ridge, `b4-spine12-c` as a 1x1
peak.

Sheets: [`sheets/massif-granite.png`](sheets/massif-granite.png),
[`sheets/massif-sandstone.png`](sheets/massif-sandstone.png),
[`sheets/massif-basalt.png`](sheets/massif-basalt.png) (all pieces on their
grounds, 1:1 and x2; rebuilt by `sh art/review/massif-sheets.sh`, which now
lists peaks and spines) and every xaj.19 take with its verdict on light and
dark: [`sheets/iter4-takes-massif-granite.png`](sheets/iter4-takes-massif-granite.png),
[`sheets/iter4-takes-massif-sandstone.png`](sheets/iter4-takes-massif-sandstone.png),
[`sheets/iter4-takes-massif-basalt.png`](sheets/iter4-takes-massif-basalt.png),
[`sheets/iter4-takes-towns-3x2.png`](sheets/iter4-takes-towns-3x2.png).

Calls: 36 PixelLab requests (sandstone 16, granite 10, basalt 8, towns 2;
`usd: null` on this account). Takes: granite 6 accepted / 10 rejected,
sandstone 15 / 7, basalt 7 / 7, towns 1 / 1. Eight granite spine attempts
kept one; the other palettes kept one spine each.

Verdicts in short (one line per take in each `verdicts.json`):

- **Rejected**: a tilted cuesta whose arch read as an eye (a creature's
  head); spines cut off by both side edges (straight sides 80-152 rows: v2
  fills an 80 px wide canvas edge to edge unless the style image is a 2x1 or
  3x1 ridge); a basalt column tower with an ash streak like a waterfall; a
  stack of three round blobs (a snowman); an S-curved fin like a worm; a
  rectangular mesa block with a cake top; a vase-like hoodoo; egg-shaped
  boulders and a heap lit from the right; a boxy basalt stump; basalt humps
  that were cream (snow), blue-grey or pale ash; a finer, busier Hold with
  its gate off centre.
- **Lesson** (adds to the v2 finding above): for a narrow piece, style from
  a wide low piece (a 2x1 or 3x1 ridge) and do not ask for "the full width";
  styled from a 2x2 massif, v2 filled the canvas and clipped the sides every
  time, whatever the prompt said about margins.

### Wiring and packer changes (`src/render/map/massif.ts`)

- **Seams**: palette patches under `MIN_PATCH` (6) cells join their
  surroundings (was 4), and every cell touching another palette's rock takes
  low pieces only (no massif, tall ridge, peak or spine there), so a range
  changes rock at a saddle of humps and rubble.
- **Spines**: one-cell-wide north-south runs are cut into 1x2 spines from
  the foot up (rock behind only, they rise up to 48 px), with a single
  between two spines (always, while a palette has one spine sprite).
- **Peaks**: a single with rock behind it is often a peak, on the rim now
  and then.
- **Narrow bands**: a massif with open ground on both sides scores
  `BAND_PENALTY` lower, massifs sharing a column are never stacked edge to
  edge in a narrow band (`STACK_SKIP` in the bulk), and the score likes rock
  behind more (so the tallest pieces sit inside the range, where every
  variant is allowed).
- **Families**: pieces of one silhouette family are kept apart
  (`FAMILY`, `FAMILY_REACH` 3, the sandstone towers 5, tables 4) through a
  ladder of tiers, the towers keeping their spacing longest; the old
  sandstone "ring of lower rock" rule and its high massif threshold are gone
  (towers weigh 0.35, fluted hills 0.6, the 3x2 table 0.7).
- **Cut edges**: `EDGE_NEEDS` lists pieces whose art has a straight cut side
  (the 3x2 domes' flat foot and sides, the low table's and two ridges' right
  side); they go only where rock meets that side.
- **Busyness**: back-fills and side boulders are thinned per palette
  (`FILL_RATE` granite 0.9, sandstone 0.3, basalt 0.45; `SIDE_RATE` 0.8,
  0.25, 0.45). The two stair-like granite foothill blocks are never fills
  or side boulders and weigh 0.25 as singles; the new rounded boulders take
  their place. The scree-skirted basalt massif weighs 1.6.
- **Town entry cell**: the generator's entrance is the middle cell of the
  footprint's front row (`townBlocked` leaves it free); both 3x2 sprites
  have their gate centred on it (the Hold's horned gate and the Lost World
  skull within a few pixels of x = 120 of 240, checked at zoom 1.5), at the
  bottom of the canvas, so the road
  that ends on the entrance ends at the gate and a hero on the entrance
  stands in the gateway.

Measured on seeds 1-3 size M (pieces and fills of `packRanges`):

| | before | after |
| --- | --- | --- |
| sandstone fills (seeds 1 / 2 / 3) | 206 / 172 / 244 | 56 / 51 / 59 |
| distinct sandstone sprites | 28 / 27 / 27 | 33 / 31 / 30 |
| tower massifs; pairs within 5 cells | 22; 9 pairs | 19; 1 pair |
| `packRanges` per M map | 2.5 ms | 3.2 ms |

### Still artificial

- North-south bands two to four cells wide still read as a column of
  blocks (now different blocks with ridges between); only one-cell-wide
  runs get spines, and each palette has one or two spine sprites.
- The distinctive sandstone pieces (fluted hills, domes, tables) are each
  one or two sprites: at zoom 0.75 one of them shows two or three times in
  a screen, more than five cells apart.
- Sandstone 2x1 ridges are themselves little stepped buttes; a ragged
  sandstone edge is still a row of small buttes and boulder heaps.
- The 3x2 domes have a straight foot line, kept to the inside of a range.
- Basalt keeps three of its four massifs on boxy column feet (the new one
  is weighted up, not a replacement).
