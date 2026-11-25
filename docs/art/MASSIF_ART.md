# Map beauty iteration 2: massif pieces, 3x2 towns, doodads (bead `border_marches-xaj.14`)

> **Retired (bead `border_marches-xaj.29`, 2026-11-25).** The mountains of
> this document, both the massif sprites and the later code-drawn relief, are
> no longer in the game: the front-view peaks
> ([classes/mountains.md](classes/mountains.md)) replaced them, and the
> massif packer, the relief painter, the `massif-*` studio sets, their
> masters, style refs, derived files and review scripts were removed. Paths
> below name files as they were; they are in git history before that bead's
> commit. The 3x2 towns and doodads described here are still in use.

New adventure-map art made with the studio pipeline ([PIPELINE.md](PIPELINE.md))
in the inherited Bold chibi direction ([ART_DIRECTION.md](ART_DIRECTION.md)).
The target, in the user's words: "all the mountain ranges look unique ...
cleverly connected so that no matter the shape of the mountain range it looks
like a coherent whole and not like the same rock sprite pasted 20 times".
Before this bead every range was a field of near-identical snow-capped cones.

The art is wired into the renderer by bead `xaj.15` (see
[Wiring](#wiring-bead-xaj15)); bead `xaj.19` filled the set's gaps and
reworked the packing ([Iteration 4](#iteration-4-bead-xaj19)); bead `xaj.20`
made the smallest mountain 2x2 and rebuilt ranges from 2x2-and-larger pieces
([Iteration 5](#iteration-5-bead-xaj20)); bead `xaj.21` wobbled zone
borders and range edges, made the rock base follow the pieces' silhouettes
and added plateaus, snowless granite and second 2x3 pieces
([Iteration 6](#iteration-6-bead-xaj21)); bead `xaj.22` added wide
tablelands that join into one mass, recoloured landmark siblings kept a
screen apart, snowless granite ridges, deeper badlands and a rubble rock
base ([Iteration 7](#iteration-7-bead-xaj22)); bead `xaj.23` fixed the
tableland join smudges, added wide granite massifs, three-row tablelands
and banded sandstone edge ridges ([Iteration 8](#iteration-8-bead-xaj23)).
The captures
[`screens/map-seed3-M-z075.png`](screens/map-seed3-M-z075.png),
[`screens/map-tableland-seed2-z1.png`](screens/map-tableland-seed2-z1.png)
(a badlands block of joined tablelands) and
[`screens/map-granite-seed3-z1.png`](screens/map-granite-seed3-z1.png) (a
granite range round a wide granite massif) show the result after xaj.23.

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

## Iteration 5 (bead xaj.20)

The user, after xaj.19: "Keep iterating. BTW it is acceptable if the
smallest mountain is 2x2 tiles instead of 1x1 - if that helps." The
orchestrator adopted it: every Mountain cell now lies in an all-Mountain
2x2 block, and the packer builds ranges from 2x2-and-larger pieces only.

### Generator (`src/core/map/gen/clusters.ts`, `generate.ts`)

`squareMountains` runs after the clean-up passes. A Mountain cell outside
every all-Mountain 2x2 window grows into the cheapest window round it:
forest cells turn to rock for free (both block movement, so seals and
reachability do not change), open ground costs more and is taken only
outside pass corridors and town yards; pockets the growth closes are
re-resolved (three rounds, with the corner-only-join fix), and a final trim
turns what still cannot grow into forest (when it seals a zone border, or
would open as an unreachable pocket) or open ground. Small mountain
clusters start at four cells, and the lone-obstacle budget is for trees
only. Tests: `generate.test.ts` "builds every mountain from 2x2 blocks"
(50 seeds M, 3 S, 2 L) and "no lone peaks".

Seeds 1-50, size M: mountain cells 20,200 -> 23,225 (+15%); cells outside
a 2x2 block 3,216 -> 0; one-cell-wide cells (no rock west or east) 580 -> 0;
corner-only obstacle joins 5 -> 3; generation 53 ms per map either way.
Seed 3 before and after: `.orchestration/screens/xaj20/before-seed3-ascii.txt`
and `after-seed3-ascii.txt` (git-ignored); ranges are a little fatter, the
one-cell spurs and staircases have become two-cell ridges or are gone.

### Packer (`src/render/map/massif.ts`)

- **Massifs** 3x2, 2x2 and the new tall **2x3** (a two-cell-wide
  north-south ridge seen end-on). A massif never leaves a single free cell
  of its palette beside it in a row (no orphans), so every leftover row
  run is two or more cells and cuts into 2x1 and 3x1 pieces. Massif offers
  that no sprite can fill (rise rule at an open rim) are skipped.
- **North-south bands** (two or three cells wide, open both sides) like a
  massif as their summit (`BAND_BONUS`: 2x3 most), and massifs on exactly
  the same columns are not stacked edge to edge, so a band runs summit,
  low saddle, summit; massifs offset by a column may touch (a diagonal or
  staggered band steps sideways like a ridge line). The row between two
  summits of a band is always a low saddle. 2x3 pieces keep `TALL_SPACING`
  (8) cells apart within a range, divided by the number of 2x3 sprites.
- **Rows**: 3x1 and 2x1 ridges, or low 3x1 and 2x1 humps (new kind
  `rounded` 3x1) where a tall ridge may not stand (palette seams, an open
  rim with fewer than two fitting ridge sprites). Sandstone takes a low hump
  for 40% more of its 2x1 runs (`LOW_PAIR_RATE`): its 2x1 ridges are
  little stepped buttes. A 1x1 single is a fallback for a Mountain under an
  object only; `widenPaletteRuns` gives a lone palette cell in a row its
  neighbour's palette, and `MIN_PATCH` is 10 (small rock patches at a
  palette border were all seam and became heaps of humps).
- **Removed**: the spine pass (1x2 spines), peaks as structural singles,
  `SPINE_GAP`, `PEAK_WEIGHT`, `BAND_PENALTY`. Peaks are decoration now:
  `PEAK_FILL_RATE` (granite 0.15, sandstone 0.12, basalt 0.2) of the deep
  joints (rock behind too) get a 1x1 peak standing between the pieces
  instead of a low back-fill. Granite back-fills 0.9 -> 0.45 and side boulders 0.8 -> 0.5 (granite ranges were a field of boulder pairs).
- **Families and weights**: the fluted sandstone family has five sprites and
  a reach of 5 (a z1 screen showed five), weight 0.45 each; new families
  `basalt-scree` (2x2-c, 3x2-c) and `basalt-spires` (2x2-d, 3x2-d); the
  scree-skirted basalt massifs weigh 1.4 and the four boxy ones 0.35.

Measured on seeds 1-3 size M (`packRanges`, main -> this bead): pieces
215 / 172 / 202 -> 147 / 118 / 147; 1-column pieces (singles, peaks,
spines) 69 / 58 / 70 -> 0; massifs 43 / 33 / 45 -> 67 / 59 / 74; time per
M map 4.8 / 3.7 / 4.0 ms -> 5.5 / 3.1 / 4.0 ms.

### New art

Same pipeline (v2 with an accepted piece as the style image, seated by
recorded crop + pad steps). `MassifPieceAsset.rows` may be 3 (canvas 160 x
288, up 48); variant letters run to `l`.

| Palette | New game files | From |
| --- | --- | --- |
| sandstone | `massif-2x2-f` (low fluted hill, rises 13 px: back rim), `-g` (fluted twin crest), `-h` (low table slice, rock both sides), `-i` (lower hoodoo cluster, rises 20 px), `massif-3x2-f` (fluted dome with knobs), `-g` (hoodoo field), `massif-2x3-a` (end-on ridge: mesa summit over stepped blocks), `ridge-3x1-d` (low table with a cleft), `rounded-3x1-a/b` (striped humps; crumbling mesa), `rounded-2x1-d` (low mesa with hoodoos) | `s5-*` |
| granite | `massif-2x2-d` (broad snowy summit), `massif-3x2-d` (two snowy summits and a saddle), `massif-2x3-a` (craggy end-on ridge), `rounded-3x1-a/b` (hump ridge; weathered slabs) | `g5-*` |
| basalt | `massif-2x2-d` (twin spires on scree), `massif-3x2-c` (summit on scree aprons), `-d` (four spires on scree), `massif-2x3-a` (tall end-on summit), `rounded-3x1-a/b` (pale humps; broken ridge) | `b5-*` |

Calls: 30 PixelLab requests (sandstone 16, granite 8, basalt 6; `usd: null` on
this account). Takes: sandstone 12 accepted / 4 rejected, granite 5 / 4,
basalt 6 / 0 (one candidate per call at these sizes).

Verdicts in short (one line per take in each `verdicts.json`):

- **Rejected**: 2x3 takes clipped by the top or right edge, or reading as
  stacked round blobs or a bulb on a neck (`s5-tall23-b/c`,
  `g5-tall23-a/b`); striped domes cut by both sides on a straight foot
  (`s5-massif22-domes-b`); a 2x2 that came back as its small style image
  (`s5-massif22-lowrim-c`); cylinder stumps (`g5-massif22-b`).
- **Shipped one size down**: `s5-massif32-table-b` (a 3x1 ridge),
  `s5-massif22-lowrim-b` (a 2x1 hump).
- **Lessons**: v2 copies the style image's foot outline even at another
  canvas size (the three fluted takes share one foot), and a small style
  image in a bigger canvas comes back at its own size (`lowrim-c`, `-b`):
  for a low 2x2 or 3x2, style from a big piece and ask for "the lower three
  quarters with empty space above". For 2x3 end-on ridges, a 3x2 massif
  style image (granite `g-massif32-c`) gave the only clean granite take;
  ridge style images gave clipped or blobby ones.

Sheets: `sheets/massif-*.png` rebuilt by `sh art/review/massif-sheets.sh`
(massifs row now includes the 2x3 pieces, the low row the 3x1 humps).

### Still artificial

- Sandstone canyons are now varied (fluted hills, domes, hoodoo fields,
  tables, towers) but busy: every piece is a distinct landmark with its own
  silhouette, so a big badlands range reads as a collection of monuments
  rather than one eroded plateau. The low-rim pieces help only on the rim.
- A palette changes inside a range at a seam of low humps; where a small
  granite patch survives `MIN_PATCH` it still reads as a grey island.
- Granite interiors are mostly the same snowy-cone massifs plus the
  cliff-block 2x2; a dense granite range at zoom 1 still shows each 2x2
  sprite two or three times.
- Two-cell-wide north-south bands are summit, saddle, summit now, but where
  no 2x3 fits (spacing, rim rise) they fall back to stacked 2x2 blocks with
  a low hump between: better than a column of equal blocks, still regular.
- Back-rim 2x1 humps of sandstone (`rounded-2x1-*`) are small next to the
  2x2 mesas in front of them; seen from above a range's back edge can look
  like a row of pebbles.
- The granite and basalt 2x3 pieces are single sprites (kept 8 cells
  apart); the sandstone one is a mesa-and-blocks stack that reads as a
  tower from some angles.

## Iteration 6 (bead xaj.21)

The orchestrator's review of xaj.20: ranges along a zone border had
ruler-straight outer edges for eight cells and more, with the ground edge
beside them just as straight; the rock base filled whole cells; granite
interiors were mostly snowy cones; deep badlands read as a collection of
monuments; one 2x3 sprite per palette; sandstone back-rim 2x1 humps looked
like pebbles behind the mesas; small granite patches read as grey islands.

### Generator (`src/core/map/gen/zones.ts`, `wobble.ts`, `generate.ts`)

- **Fine zone warp**: a second domain warp of the zone Voronoi
  (`zones.fineWarp` 1.6 cells, `fineWarpScale` 3 cells) bends every border
  every few cells.
- **Wobble pass** (`wobbleEdges`, after the 2x2 squaring): every straight run
  of a boundary longer than `wobble.maxRun` (3) cells is broken every three
  or four cells by a two-cell feature. A range edge gets a BUMP (the two cells
  in front become Mountain, forming a 2x2 block with the run; only on quiet
  open ground that touches no other obstacle, pass corridor, kept-open cell,
  object or town yard) or a NOTCH (two rock cells become open; never spine
  cells, and every rock cell round them must stay in a 2x2 block). Against a
  forest belt both trade rock for trees. A ground edge on open land gets a
  two-cell tongue of the ground behind it. Pockets are resolved and the final
  square trim runs after it, so seals, passes, the 2x2 rule and reachability
  hold (the generator tests pass unchanged, plus a new straight-edge test).

Seeds 1-20, size M (boundary runs along a cell line):

| | before | after |
| --- | --- | --- |
| range-edge runs of 4+ / 6+ / 8+ cells | 420 / 76 / 24 (longest 14) | 158 / 12 / 1 (longest 8) |
| ground-edge runs of 4+ / 6+ / 8+ cells | 220 / 50 / 5 (longest 9) | 62 / 10 / 0 (longest 7) |
| mountain cells | 9,123 | 9,688 |
| generation per M map | 58 ms | 57-60 ms |

### Rock base along the silhouettes (`src/render/map/ground.ts`)

The scree (dust, rock floor) and the palette's rock base are cut from a
SILHOUETTE FIELD instead of the Mountain cells: the opaque 4 px blocks of
every placed piece inside its own footprint (and of the fills' lower
halves), closed by 6 blocks (24 px: notches and joints between pieces fill
with rock, the outer rim does not grow) and blurred twice (3 blocks).
`loadMapAssets` reads each massif piece's block mask (`pieceMasks`);
`buildGroundLayout(map, roadEnds, cover)` takes the cover, and the map view
passes `packRanges(map, featuredCells(...))`. Without masks or a cover the
old cell field is used (node tests, other callers). Where a low hump leaves
its cell open the cell's own ground shows; a range's rim follows its
pieces, not the cell edge. Field build: 25-38 ms per M map, 50-120 ms per L
map, once per terrain rebuild, on the first chunk painted.

### New art

Same pipeline (v2 with an accepted piece as the style image, seated by
recorded crop + pad steps). New kind `plateau` (2x2, 3x2 and 3x3; a 3x3
canvas is 240 x 288, up 48).

| Palette | New game files | From |
| --- | --- | --- |
| sandstone | `plateau-3x3-a` (level table, winding gully), `plateau-3x3-b` (mesa split by a canyon), `plateau-3x2-a` (table with a gully), `plateau-3x2-b` (striped table with scree fans; shipped one size down from a 3x3 request), `plateau-2x2-a` (quiet striped block), `rounded-3x1-c/d/e` (long low back-edge benches; `e` came back at its style image's size in a 3x2 canvas and ships as a 3x1), `massif-2x3-b` (stepped tableland end-on) | `s6-*` |
| granite (snowless) | `massif-2x2-e` (bare domes), `-f` (forested shoulder), `-g` (tilted slab crag), `massif-3x2-e` (blunt summit with pine clumps), `-f` (three domes), `-g` (cliff wall with grassy ledges), `massif-2x3-b` (stepped cliff ridge end-on) | `g6-*` |
| basalt | `massif-2x3-b` (jagged end-on ridge on scree, ash on the summit only) | `b6-tall23-c` |

Calls: 22 PixelLab requests (sandstone 13, granite 7, basalt 2; `usd: null`
on this account). Takes: sandstone 9 accepted / 4 rejected, granite 7 / 0,
basalt 1 / 1. Rejected: `s6-tall23-b` (S-curved crest over a lobe: blobs and
a worm), `s6-plateau32-b` (copied its style image's outline: a duplicate of
plateau-3x2-b), `s6-low32-a` (copied its style image's full-height outline:
not low), `s6-plateau33-c` (carved stairs, a paw-like front), `b6-tall23-b`
(an ash streak down the middle read as a waterfall).

Lessons: the xaj.20 findings held exactly. A 3x3 (240 x 288) request styled
from a 208 px tall image came back 168 px tall (shipped as a 3x2); styled
from a 288 px tall image it filled the canvas. A low 3x2 styled from a 3x1
came back as a 3x1. 2x3 pieces styled from 3x2 massifs were clean in every
palette (granite, sandstone and basalt each at the first or second call).

### Packer (`src/render/map/massif.ts`)

- **Plateaus inside**: a massif-sized offer (now 3x3 too) is INTERIOR when
  rock of its palette lies behind every column and beside at least half its
  rows. Interior offers may take a plateau (weight 3 against massifs 1,
  `PLATEAU_BONUS` 0.45 for two rows, 0.8 for three, so big badlands fill
  with plateaus first), and their candidates drop the LANDMARK families
  (towers, hoodoos, domes, fluted hills; the low fluted 2x2-f and long low
  3x2-h stay); an interior offer that only landmarks could fill is skipped.
  3x3 plateaus keep `TALL_SPACING` apart like the 2x3 pieces.
- **Back edge**: on the open back rim a sandstone 2x1 costs
  `BACK_PAIR_COST` (1.5) in the row cut, so rims are cut into long low
  benches where the run allows; the three benches (`BACK_EDGE_ONLY`) are
  used only there, never in front of rock.
- **Islands**: a palette patch under `ISLAND_PATCH` (30) cells that is also
  under a third of its range joins the palette round it (besides the
  `MIN_PATCH` 12 rule).
- **Granite variety**: the snowy cones (2x2-a/c, 3x2-a/b) weigh 0.6; the
  snowless domes and forested shoulders are families (`granite-domes`,
  `granite-forest`) kept apart.
- Cut sides of the new takes in `EDGE_NEEDS` (plateau-3x2-b and granite
  2x2-e/f east, plateau-2x2-a both, sandstone 2x3-b west).

Seeds 1-3 size M: pieces 159 / 145 / 160 (xaj.20: 147 / 118 / 147), of
them plateaus 5 / 1 / 9 and 2x3 pieces 4 / 1 / 0; `packRanges` 9-15 ms per
M map in node (cold).

### Still artificial

- Every sprite is a whole object with cliffs on all sides: two plateaus side
  by side read as two mesas, not one tableland, and the fluted plateaus
  (3x3-a, 3x2-a) look a little like tree stumps.
- Big badlands ranges are mostly two or three cells deep, so interiors are
  rare: on seed 2 only one plateau is used and the edges are still a row of
  distinct landmarks.
- Granite 2x1 ridges are all snowy; a granite frame at zoom 1 still shows
  snowy ridge pairs repeating. A snowless 2x1 set is the next gap.
- Range sides are pieces' vertical cliffs on a staggered cell outline: no
  longer one straight line, but a sawtooth of two-cell steps where the
  wobble bumped and notched.
- Between pieces of a closed range the rock base is a flat dark tone; where
  the closing fills a big notch it is a visible blob.

## Iteration 7 (bead xaj.22)

The orchestrator's review of xaj.21: the red hoodoo mound showed three times
on one zoom-0.75 screen along a badlands edge; every sprite is a whole object
with cliffs on all sides, so neighbouring plateaus read as separate mesas;
every granite 2x1 and 3x1 ridge was snowy; sandstone 2x1s were little
buttes; big badlands ranges were two or three rows deep; the rock base was a
flat dark tone; a low 3x2 back edge was still missing. The user: "Keep
iterating. BTW it is acceptable if the smallest mountain is 2x2 tiles
instead of 1x1 - if that helps."

### Landmarks a screen apart, recoloured siblings

- `massif-sandstone-massif-2x2-i` (the red hoodoo mound) was in no family:
  it is a hoodoo now, and the hoodoo family keeps 7 cells apart (towers 7,
  fluted and domes 6).
- Spacing is measured over the whole map, not per range, footprint to
  footprint. A LANDMARK sprite (and every big piece: 4- and 5-column
  tablelands, 3-row pieces, and tableland pieces counted by their take)
  keeps `LANDMARK_SPRITE_REACH` (12) cells from another copy of itself: at
  zoom 0.75 a screen is 24 x 15 cells. Wide tableland offers are also
  thinned at packing time (no more of one width within the reach than there
  are sprites of it), so the pick rarely has to fall back.
- Five recoloured siblings by `edit-image-pixen` ("change only the colours
  of the rock ... keep every shape"; same outline, other rock): pale cream
  hoodoo mound `massif-2x2-j`, rosy painted-desert hoodoos `massif-2x2-k`,
  rust hoodoo field with cream tops `massif-3x2-i`, bleached fluted hill
  `massif-2x2-l`, rust tower butte `massif-2x2-m`. Each joins its original's
  family (so they never stand together) and the hoodoos weigh 0.6 each, so
  the family as a whole is not more frequent than before. Edits return the
  same image twice (candidate #1 byte-identical; rejected as duplicates).

Seeds 1-5 size M: same-sprite landmark pairs within 12 cells, at most 2
(fallbacks where a slot had nothing else; the test allows that); on main,
seed 2 showed the red mound three times on one zoom-0.75 screen.

### Tablelands that join (the main new idea)

`generate-image-v2` copies the style image's outline at the style image's
size (Iteration 2 and 6 lessons). So the outline is now designed:
`art/review/compose-style.mjs` pastes column strips of accepted, baked pieces
into a style image of the wanted width (`art/refs/massif-sandstone/*.png`,
in git, hashed in the records). Every wide outline is the west end, the
middle columns repeated, and the east end of ONE piece, so every 80 px
column edge of every take cuts the rock where its rim and foot stand at the
same heights (within 6 px). The takes copied their outlines exactly (column
profiles equal to the style image's).

- **Fluted family** (outline of `plateau-3x2-a`): `s7-table52-a` (5x2,
  gullies), `s7-table42-a` (4x2, canyon notch), `s7-table42-b` (4x2, wash
  and ledge stripe), `s7-table52-b` (5x2, caprock patches). The style image
  also carried its flutes: "no flutes" in the prompt did not stop them.
- **Banded family** (outline of `massif-3x2-d`, straight striped cliffs):
  `s7-table42-c` (4x2), `s7-table52-c` (5x2, a deep alcove), `s7-table42-d`
  (4x2, caprock rim, slot canyon, step ledge), `s7-table52-d` (5x2, dry
  wash, buttresses). No flutes: the look follows the style image. The
  banded family weighs 1.5 and the fluted 0.5 (`FAMILY_WEIGHT`): the fluted
  fronts read as tree stumps and their 2-cell ends as fluted hills.
- **Quiet small mesas**: `s7-table22-a/b` (`plateau-2x2-q/r`), whole banded
  2x2 mesas styled from both ends of `massif-3x2-d`, for interior 2x2 slots
  (the low fluted hill `massif-2x2-f`, the only quiet 2x2 before, stood on
  every step of a diagonal staircase of them).
- Each take ships whole (`plateau-4x2-a/b/c`, `plateau-5x2-a/b/c`) and cut
  at cell edges by recorded `crop` steps into CUT pieces: a west end (cut on
  its east side), middles (cut both sides) and east ends (cut on its west
  side), 2, 3 and 4 columns wide (`plateau-2x2-b..p`, `plateau-3x2-c..o`,
  `plateau-4x2-d..l`; `TABLE_CUT` in `massif.ts` lists each piece's cut
  sides and family). Variant letters run to `t` now.
- **Packer**: offers of 5x2 and 4x2 come first where they fit
  (`WIDTH_SCORE`), on the rim too (whole tablelands have end cliffs). In the
  variant pick, a plateau slot with a plateau slot of the same rows right
  east of it starts a chain (`JOIN_RATE` 0.9) with a piece cut on its east
  side; the slot east of a cut piece always takes a piece cut on its west
  side of the same family, from another take where one fits (two pieces of
  one take side by side would rebuild the whole take); a chain carries on
  while the next slot can take a plateau (`CHAIN_RATE` 1) and ends with an
  east end. Cut pieces are never used outside a chain. Plateaus may now
  stand on a range's rim too (weight 0.8 against massifs 1), so a badlands
  edge is not only landmarks. Families `sandstone-tableland` (reach 6) and
  `sandstone-tableland-banded` (5).
- Seeds 1-5 size M: more than ten joins (test); seed 1 has a tableland 12
  cells long. Plateaus (all sizes) per map 31 / 24 / 28 on seeds 1-3 (xaj.21:
  5 / 1 / 9).

### Snowless granite ridges, sandstone 2x1s that are not buttes

- Granite: `ridge-2x1-d` (bare dome crag) and `ridge-2x1-e` (tilted slab
  with a grassy ledge) from one v2 call styled from the snowless 3x1 ridge
  (4 candidates: a shard pile and stepped blocks rejected); `ridge-2x1-f`
  and `ridge-3x1-c` are snowless edits of the snowy `ridge-2x1-a` and
  `ridge-3x1-a` (same outline, bare rock and grassy ledges). The three snowy
  2x1 ridges (one silhouette) weigh 0.6.
- Sandstone: `rounded-2x1-e/f/g`, low eroded ridges with sloping striped
  flanks and gullies (v2 styled from the low back-edge bench, 3 of 4
  candidates; a layered "cake" rejected), seated as low 2x1 humps and
  weighted 1.6; a sandstone 2x1 run takes a hump instead of a stepped butte
  ridge 75% of the time (`LOW_PAIR_RATE`, was 40%).

### Deeper badlands (generator)

`clusters.deep` in `config.ts`: a share of the mountain clusters of a
badlands (0.8) or steppe (0.45) zone are deep blocks, 22-36 cells, stretched
only 1.3 east-west, so they are at least four rows deep where the zone has
room. Seeds 1-10 size M: badlands and steppe mountain cells with rock all
round 288 of 2,684 (10.7%) -> 491 of 3,082 (16%); mountain cells there +15%.
The straight-edge test now allows three runs of 9+ cells in 50 maps (all
three along the map-edge frame, at y = 2, y = 46 and x = 5; was two).

### Rubble rock base

`rubbleAt` in `ground.ts`: the palette's rock base is cut into jittered
stones about 8 px across (2 px blocks), each a little lighter or darker,
lit on its lower-left rim and shaded on its upper-right (the sun is at the
bottom left), with darker cracks between them. Between pieces and in big
filled notches it now reads as scree and rubble, not a flat dark blob.

### Low 3x2 back edge: retried, rejected

`s7-low32-c` was styled from `plateau-3x2-a` squashed to 0.8 of its height
(`art/refs/massif-sandstone/low-3x2-a.png`) with "rock only in the lower
half": v2 copied the squashed outline exactly, so the take is a low copy of
`plateau-3x2-a` with the same gully and knobs. Rejected: it would read as
that sprite pasted. A low back edge needs a style image of its own shape.

### Calls and verdicts

22 PixelLab requests (sandstone 19, granite 3; `usd: null` except one v2
call that reported US$0.08): 9 edits (5 recolours accepted, 2 rejected as
candy-coloured stripes: `s7-fluted-c-rose` magenta, `s7-fluted-e-rust`
red-salmon; 2 snowless edits accepted), 13 v2 (8 tablelands and 2 small
mesas accepted, 1 low 3x2 rejected, 2 ridge calls 5 of 8 candidates
accepted). Every take has its
verdict and reason in its set's `verdicts.json`. Sheets:
`sheets/massif-sandstone.png` and `sheets/massif-granite.png` (rebuilt by
`sh art/review/massif-sheets.sh`).

Measured: `packRanges` 9-18 ms per M map in node (xaj.21: 9-15 ms), 149-155
pieces on seeds 1-3.

### Still artificial

- Rows of tablelands: a deep badlands block is now a few long tablelands,
  but each row has its own front cliff, so north to south it reads as
  stacked terraces; the fluted "organ pipe" fronts still show where a
  chain starts fluted.
- Interior 2x2 slots have few quiet sprites: the two small mesas can repeat
  one or two cells apart (the pick falls back to a repeat before it puts a
  landmark inside).
- Joins between takes show a slight colour step (the banded 5x2 is more
  orange than the 4x2) and the 6 px rim jog of the composed outline;
  invisible at zoom 0.75, visible at zoom 2.
- The edits that worked recolour the whole sprite; the saturated siblings
  (rosy hoodoos, rust tower) are louder than the set.
- Sandstone range edges still have stepped butte ridges and boulder heaps
  where a 2x1 must be a ridge; the low humps that replace them are flat
  ledges.
- Granite ranges are busy: a field of small ridges and boulders; the
  snowless ridges help colour, not mass.
- No low 3x2 back edge.

## Iteration 8 (bead xaj.23)

The orchestrator's review of xaj.22: rows of tablelands read as terraces;
dark reddish smudges along the top of the long seed-2 tableland; granite
ranges a busy field of small ridges and boulders; the two small quiet mesas
repeating a cell or two apart; stepped butte 2x1s on sandstone edges; loud
recoloured siblings; no low 3x2 back edge; a rubble base like paving at
zoom 2. The user: "Keep iterating. BTW it is acceptable if the smallest
mountain is 2x2 tiles instead of 1x1 - if that helps."

### Join smudges (found and fixed)

The smudges were in the art, not the join: `s7-table52-b` (asked for
"patches of darker red-brown caprock") has dark red-brown patches along its
back rim, clipped flat by the image top, and a more orange top (`#fab96b`
against the family's `#f1bb71`). On seed 2 the long tableland at
16..23,27 was `plateau-4x2-d` (52-a) + `plateau-4x2-g` (52-b). Fixes:

- `RETIRED_TAKES` in `massif.ts`: the packer never picks a piece of
  `s7-table52-b` (its six files stay in the manifest so variant letters
  stay gapless); every lookup goes through `usablePieces` (memoized).
- `TAKE_TONE` / `toneOf`: `s7-table52-d` has a lighter, two-tone top
  (`#fecb7b`); a chain joins only takes of one tone (a chain with no piece of
  its tone for a slot goes on in another tone rather than end on a cut side).
- Review check `tests/assets/tableland-tone.test.ts`: in the top band of
  every usable tableland piece (20 rows under the rim) the share of
  caprock-patch colours (luma 100-150, red over green by 60+) stays under 5%
  (the retired take's pieces measure 10-24%, the rest under 3%), and takes
  that may join (same family and tone) have top colours within 10 per
  channel.

### Granite massing: wide granite massifs

`art/review/compose-style.mjs` now also splices column strips of DIFFERENT
granite 3x2 massifs at points where their crests stand at the same height
(within 7 px) into wide outlines (`art/refs/massif-granite/granite-5x2-a`,
`-5x2-b`, `-4x2-a`, `-4x2-b`), and can FLATTEN an outline to three granite
tones keeping its dark lines (`*-flat`). Lesson: v2 copies the style image's
inner detail too, so a plain splice comes back as its sources glued at a
vertical seam (`g8-wide42-a`); the flattened outlines came back as one
repainted mass (`g8-wide52-b`, `g8-wide42-b`). Outlines spliced from a
peaked cone and a crag stay two mountains whatever the style (both `c`
takes rejected).

| Game file | From | |
| --- | --- | --- |
| `granite/massif-5x2-a` | `g8-wide52-a#0` | long snowless ridge, two summits on one notched crest, pines |
| `granite/massif-5x2-b` | `g8-wide52-b#0` | same outline (flattened): pointed and rounded summits, mossy ledges |
| `granite/massif-4x2-a` | `g8-wide42-b#0` | a long cliff wall rising to a craggy summit, lower shoulder |

Packer: granite wide massifs are offered like the tablelands (`WIDTH_SCORE`
4/5 first), thinned by distinct outlines within `LANDMARK_SPRITE_REACH`
(`SAME_OUTLINE` makes 5x2-a and 5x2-b one sprite for the spacing), family
`granite-wide` (reach 4). New per-column rise: `MassifPieceAsset.colRise`
(manifest row element 12) and `Slot.openBehind` is now a bit mask of open
columns, so `OPEN_RISE_MAX` is checked column by column (`riseAt`); a wide
massif whose summit rises 35 px over one column may stand on a back rim
where that column has rock behind. Granite clutter: `FILL_RATE` 0.45 -> 0.2,
`SIDE_RATE` 0.5 -> 0.2, `PEAK_FILL_RATE` 0.15 -> 0.08, and a new
`LOW_RIM_RATE` (granite 0.15, others 0.45) for 2x1 boulder-pile humps on
open rims.

### Three-row tablelands (north-south)

`tableland-4x3-b` and `-5x3-b` are the banded outlines deepened by one cell
(their row 62 repeated 80 times: straight end sides, a level top). Takes:
`s8-table43-a` (4x3, dry wash, two knobs) and `s8-table53-a` (5x3, dry wash,
alcove), whole (`plateau-4x3-a`, `plateau-5x3-a`) and cut at cell edges into
three-row chain pieces (`plateau-2x3-a..f`, `plateau-3x3-c..g`,
`plateau-4x3-b/c`, `TABLE_CUT` family banded). Offers of 5x3 and 4x3 come
first inside deep badlands (`PLATEAU_BONUS` 0.8 for three rows). Rejected:
`s8-table43-b` (its front edge 50 px higher than the outline's: a tall block,
whose cuts would step at every join). The 2x3 cut pieces wait for 2x3
plateau slots (none are offered yet).

### Sandstone edges, quiet mesas, siblings, rubble

- Banded edge ridges `ridge-2x1-e/f/g` (`s8-ridge21-band` #0, #2, #3, styled
  from the small banded mesa squashed to 0.6 and cut to 128 rows,
  `ridge-2x1-banded`), weight 1.5; the stepped butte ridges `ridge-2x1-a/b/c`
  0.2-0.25; `LOW_PAIR_RATE` sandstone 0.75 -> 0.55 (more short striped
  cliffs, fewer flat ledges on edges). #1 rejected (split into two buttes).
- Quiet mesas: family `sandstone-mesa-banded` keeps 5 cells apart (was 3).
  A third small mesa (`s8-table22-c`) came back a near copy of
  `plateau-2x2-q` and was rejected.
- Loud siblings: rosy hoodoos `massif-2x2-k` 0.6 -> 0.2, rust hoodoo field
  `massif-3x2-i` 0.6 -> 0.25, rust tower `massif-2x2-m` 0.35 -> 0.12.
- Rubble (`rubbleAt`): only 45% of stones are outlined (two loose stones
  merge into a slab), a slow wave turns a third of the base into gravel of
  tints only, and the tints, lit rim, shade and cracks are softer.
- Low 3x2 back edge: not attempted (budget went to granite and the
  three-row tablelands).

### Calls and verdicts

11 PixelLab requests (granite 6, sandstone 5), US$1.24 recorded
(`art/costs.jsonl`). Accepted 7 takes (granite 3, sandstone 4 incl. three
ridge candidates of one call), rejected 6 (`g8-wide42-a`, `g8-wide52-c`,
`g8-wide42-c`, `s8-table43-b`, `s8-table22-c`, `s8-ridge21-band#1`); reasons
in each `verdicts.json`. `packRanges` 10-11 ms per M map in node (was
18-21 ms in the same harness before the memoized lookups).

### Still artificial

- A three-row tableland in front of another table is still a terrace: true
  north-south joins need pieces cut on their north side (a 3-row take's
  lower rows with its surface as an `up` band tall enough to hide the cliff
  behind); not built.
- The three-row tablelands have straight vertical end sides (the deepened
  outline); visible at zoom 1.
- Granite back rims keep boulder-pile humps where fewer than two ridges fit
  the rise rule; only three wide granite sprites (two outlines), so most
  granite is still 2x2/3x2 massifs.
- Basalt untouched.

## Iteration 9a: low relief (bead xaj.25)

The user, with a Heroes of Might and Magic II adventure map as the
reference: mountains "blend seamlessly with their surroundings ... one
continuous mass that doesn't at all look like a bunch of separate sprites
... no gaps ... you cant tell that there is a square grid underneath ...
not giant in the sense that they wouldnt fully obscure a full height unit
standing behind". The orchestrator's call: retire the massif sprites as the
mountain renderer and paint every range as one low-relief heightfield.

The three committed relief screens
([`screens/relief-vs-reference.png`](screens/relief-vs-reference.png),
[`screens/map-relief-seed2-M-z1.png`](screens/map-relief-seed2-M-z1.png),
[`screens/map-relief-seed3-M-z075.png`](screens/map-relief-seed3-M-z075.png))
now show iteration 10 (below); the comparison sheet's middle column is this
iteration. The outline, cap, projection, foot and wiring described here
still hold; iteration 10 replaces the height (step 2) and the shading
(step 5).

### Approach (`src/render/map/relief.ts`)

No assets and no PixelLab calls: everything is code-painted per chunk, in
2 px blocks (like the rubble and scree), as a pure function of the map and
world pixels, so chunks continue each other exactly and nothing repeats per
cell. Nothing is mirrored; the light is the project sun at the bottom left.

1. **Outline.** The contour of the region's cell field (1 on a Mountain
   cell, 0 open, -0.6 on a road, object or water cell, so the foot pulls
   back from them) blurred by a 40 px Gaussian: 0.5 on a straight edge,
   lower at a convex corner (rounded) and higher at a concave one (filled).
   The threshold is 0.6 plus a slow swell (+-0.24, about 170 px), finer
   noise (60 and 14 px) and three oblique waves over world pixels (periods
   83 to 374 px, which never go flat along a straight run), clamped to
   0.36..0.86: on a straight edge the outline lies between 14 px outside the
   cells and 43 px (over half a cell) inside. Off the region the foot
   reaches at most 24 px from a region cell, so a filled notch stays a
   fillet and a passable cell stays readable. Object cells are never relief
   and the foot never enters a road, object or water cell.
2. **Height.** An exact Euclidean distance transform to the outline over
   the chunk plus a 102 px margin (clamped at 96 px, so every chunk gets the
   same distance) raised to a dome `amp * (1 - exp(-d / reach))` with a slow
   swell along the range; on it a ridged SUMMIT network (about 215 px, plus
   a 100 px octave at a fifth of the weight) that carries the big forms:
   ridgelines and peaks one and a half to three cells apart, reaching to the
   flanks as spurs. FOLDS (ridged noise stretched 90 to 110 px along, 26 to
   54 px across, at half the earlier height) run down the gradient of that
   macro height, north-south where it is flat, 40% quieter deep inside.
   Badlands are terraced in 22 px steps (two or three levels per range: flat
   mesa tops, steep risers with strata stripes by height).
3. **Cap.** A point `dNorth` px south of the outline in its column rises at
   most `dNorth + 17` px, so nothing is drawn more than 15 + 17 = 32 px
   above the region's northern cells (tested). Absolute ceiling 60 px.
4. **Projection.** Each 2 px column is marched from the front (south) to the
   back: a point of height h shows h px up, the nearer point wins, a step
   leaves a vertical face. Where a crest at least 14 px high hides more than
   32 px of ground behind it, its top pixel takes the crease tone (a real
   occlusion line, never along a low rim).
5. **Shading.** Lambert with the sun at the bottom left
   (`[-0.62, 0.5, 0.6]`), 6.5 bands per unit of slope light; north-facing
   slopes lose only a fifth of the light they would (at full darkness the
   thin band they make along a north rim read as an outline of the cells);
   lighter with height; crests lighter and gullies darker (1.8 bands, 70%
   from the summit network, 30% from the folds), so the big forms lead the
   shading; world-sampled grain (0.35 band; 0.12 on badlands tops) and a
   4 x 4 Bayer dither (0.5 band), quantised to five tones of the terrain's
   ramp, plus a crease tone. Terrain seams inside a range are dithered over
   about a third of a cell, read at a point warped by 26 px so they meander
   like the zone borders.
6. **Foot.** The outer 12 px are an ordered dither (more ground toward the
   outline), and over 16 px the tones lean to the ground texture's mean
   colour in three dithered steps: a range rises out of its ground with no
   cut and no gravel ring.

| Terrain | Look | amp / reach | summit | fold (across, along) | ramp (dark to light) |
| --- | --- | --- | --- | --- | --- |
| grass | green rolling ridges | 22 / 44 | 36 | 8 (50, 110) | `#0e2816` .. `#92c250` |
| jungle | steeper deep teal green | 28 / 32 | 34 | 10 (34, 90) | `#08221e` .. `#76b664` |
| steppe | tan and brown ridges | 20 / 44 | 40 | 7 (54, 110) | `#382214` .. `#e2c082` |
| badlands | terraced sandstone mesas | 46 / 30 | 12 | 3 (40, 110), terrace 22 | `#542418` .. `#f4cc96` |
| wasteland | basalt ridges | 24 / 38 | 36 | 8 (26, 90) | `#121118` .. `#8e888a` |

### Wiring (`map-view.ts`, kept local)

- `mountainMode()`: relief by default; `?mountains=sprites` keeps the
  xaj.23 massif path for A/B during this iteration (a later cleanup removes
  it and its unused assets).
- Relief mode drops the massif sprite entries from the terrain entries,
  turns the ground's scree ring off (`nearMountain` zeroed in the layout)
  and paints the relief into each cached chunk over the ground, before the
  body pass (so trees and doodads in front stand over it).
- **Lips**: for every region cell open to the north, the 80 x 32 px the
  relief raises over the open cell is cut from its chunk when the chunk is
  built and drawn again in the foreground at the range's row, so it covers
  the feet of a unit standing behind the range (never more than 32 px).
- Fog is unchanged: the relief is built from the whole map and the fog is
  drawn over it, so nothing changes shape when it is revealed.
- Cost: seed 2 size M, 36 chunks in 1.1 s in Chrome (the sprite path with
  its silhouette scree: 1.25 s); frames stay cached (0.06 ms mean).

### Tests (`tests/render/relief.test.ts`)

Relief by default; deterministic and identical when one rectangle is painted
in four uneven parts; nothing painted far from mountains; no ground inside a
range (every pixel deeper than the inward bite plus the foot is painted);
no pixel more than 32 px (+ one block) above the region's northern cells on
seeds 1 and 2 size M; the foot stays within 32 px of the region and never
on a road, object (a hero entrance in the test) or water cell; NO RULER
LINES: along every straight run of region edge three or more cells long
(seeds 1-3 size M, 97 runs) the outline's perpendicular offset has a
standard deviation above 4 px (lowest measured 4.3 px; before the revision
2.5 px); a lip for every region cell open to the north.

### Still artificial

- Revision after the orchestrator's review: half-cell bite and waves on
  the outline, larger landforms, folds halved, 22 px mesa terraces, softer
  north rims. A long straight flank (seed 2, the tan range's east side)
  still reads as one steep shaded wall at zoom 1, though its outline now
  wavers by about +-15 px.
- The relief is smoother than the outlined chibi objects on it: the only
  dark lines are creases and occlusion edges, no black outline round a
  range.
- Two-cell bands seen from the south show their stretched front face as
  vertical folds, most visibly on basalt.
- Merged with the canopy forests of xaj.26; both draw in relief mode.
- A narrow diagonal staircase of rock (one or two cells) is mostly foot and
  reads as a ridge line in the ground, not a mountain.
- Mines still draw the palette's mine sprite on their cell (no generated map
  puts an object on a Mountain cell today; such a cell would be a hole in
  the relief).

## Iteration 10: rising peaks, raised mesas (bead xaj.28)

The user, again with the Heroes II map: "keep iterating on the adventure
map look ... The mountains are one continuous mass that doesn't at all look
like a bunch of separate sprites ... the mountains are not giant". The
orchestrator's verdict on iteration 9a: continuity and edges good, but the
ranges read as a plan-view hillshade (crumpled paper, a relief map) rather
than mountains, and the badlands mesas read as canyons sunk below the red
ground. In the reference a range is a row of pyramidal peaks, each with a
sunlit face, a shadowed face, sharp crests and drapery gullies on the lower
flanks, visibly rising while staying low.

Comparison (reference, iteration 9a, iteration 10; steppe, grass and
badlands at zoom 2):
[`screens/relief-vs-reference.png`](screens/relief-vs-reference.png). Whole
maps: [`screens/map-relief-seed2-M-z1.png`](screens/map-relief-seed2-M-z1.png)
(steppe peaks, basalt, badlands) and
[`screens/map-relief-seed3-M-z075.png`](screens/map-relief-seed3-M-z075.png)
(badlands mesas, grass, basalt).

### Height: peaks (`relief.ts`, `RELIEF.peaks`, `buildSites`, `peakAt`)

- **Summit sites** on a staggered lattice over world pixels (104 px along a
  row, rows 0.86 of that apart, jittered by 0.95 of a pitch so no diagonal
  rows line up). Each site reads its terrain's look at its centre and keeps
  a peak with that look's `keep` probability. Its height is
  `peak * (0.45 + 0.75 u)`; 22% are major summits (x1.3 height and
  footprint), so a range has a few clear summits and lesser spurs. Its
  footprint radius is `radius * 104 * (0.7 + 0.55 size + 0.15 u)` px.
- **Faces.** Each peak is a faceted pyramid: four faces falling south-east
  (shadow), south-west (lit), north-west and north-east, or five with a
  small south face; the set is turned by up to +-29 deg and each face by
  +-11 deg. The south faces are steeper by `1 + south * uy`, so they rise in
  the projection. The pyramid falls as `(1 - t) ^ 1.25` (concave skirt),
  `t` the largest face distance over the radius, blended toward a round cone
  by `round`.
- **Spurs.** A second, smaller octave between the peaks, from its own
  lattice at half the pitch (52 px): 0.42 of the height, 75% of the sites
  kept, turned up to +-46 deg, no major summits. So a range has big
  summits, lesser peaks and spurs, not one row of similar triangles.
- **Field.** The highest pyramid or spur at each point (crests where faces
  meet, V gullies where neighbours meet), at least the look's `base`, times
  the envelope `1 - exp(-d / reach)` of the distance to the outline (the
  mass rises out of its foot). Drapery gullies (ridged noise along the
  downhill direction, `fold` px deep, `across` x `along` px) on the lower
  flanks only (fading out above 45-90% of the local peak height), and
  2.5 px lumps (noise, 32 x 28 px) so no face is a flat plane.
- **Cap.** As before (`dNorth + 17`), but measured from the region's cells
  rather than the outline where a fillet puts the outline more than 15 px
  north of them (`room`), and peaks are compressed softly (tanh) above 60%
  of the cap, so a peak near the north rim rounds off instead of being
  sliced flat.

### Height: badlands buttes on talus (`RELIEF.mesa`)

The first take (large plateaus with one or two levels) read as flat,
walkable paper cutouts; the orchestrator asked for many small buttes, 1 to
2.5 cells across, stepping up in 2 or 3 levels, no flat top wider than
about 1.5 cells, eroded slopes between them, and textured tops.

- **Buttes** on their own staggered lattice (84 px, rows 0.86 of that,
  jitter 0.9), each kept with 0.85 of the badlands share: two levels, or
  three (40%), of the 16 px terrace step; a footprint radius of 0.5 to 0.95
  pitches (42 to 80 px); flat over the inner 30% of it and falling linearly
  outside; six faces at hashed angles blended 0.35 toward a cone, read at a
  point warped by 9 px (ragged outlines). The field (the highest butte) is
  cut into terraces, each riser taking the top 20% of a step.
- **Talus** between them: a slope at most 13 px high (times the envelope,
  reach 22 px, and a noise swell) grooved by rills and gullies (ridged
  noise, 7 px deep, 11 px across, 46 px along the downhill direction), the
  9a striated look but raised. The height is the higher of talus and butte;
  the mass rises over 4 px at the outline (a cliff foot).

### Shading

- Sun moved a little west (`[-0.74, 0.42, 0.56]`, still bottom left), gain
  5.5 bands per unit of light toward the sun but 0.65 of that away from it
  (shadow faces about a band softer than the first take), base tone 2.6: a
  peak's south-west face is lit, its south-east face in shade, so the two
  faces part at the crest without black diamond bands.
- North-facing slopes lose 20% of the light at the north rim (no outline of
  the cells there) and 80% from 56 px inside (the shaded backs of peaks).
- Cast shadows: each point marches 64 px toward the sun; a point below the
  ray (slope 1 px per px) of anything there is 0.4 band darker (0.8 on
  badlands: a butte shades the talus east of it).
- Curvature (Laplacian over 2 blocks) darkens gullies and lightens crests,
  0.45 band per 10 px, everywhere (on badlands it lights the rims and
  darkens the riser feet and rills).
- Stipple: white-noise dither (0.4 band) per screen pixel instead of the
  ordered dither, plus the world grain (0.3 band, 0.6 of it on badlands).
- Per-terrain key (whole-relief tone offset): grass +0.2, jungle +0.2,
  basalt +0.15.
- **Badlands.** Butte tops +0.6 band plus 0.6 band per 30 px of height
  (upper levels lighter), a tone drift (0.45 band, noise 38 x 30 px), thin
  cracks (-1.3 band where a two-octave noise is near zero) and rubble
  (4 px specks on 5% of the top, half dark, half light; 2.5% on the
  talus). The top pixel of a riser and the north rim of a top +1 band
  (rims catch the light); riser pixels carry strata by height (+0.8 / -0.6
  / 0 in 4 px bands) and flutes (noise 5 px across), and darken toward the
  foot of each step (-1.8 band at the foot, squared falloff): lit at the
  rim, dark at the foot. The badlands foot is a 4 px dither; a peak's stays
  12 px. A dithered gap in the foot hides at most 6 px behind it, so a
  steep flank close to its foot shows no hole.

| Terrain | reach | peak px | radius | round | south | keep | base | gully (depth, across, along) | key |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| grass | 30 | 48 | 1.05 | 0.12 | 0.6 | 0.8 | 6 | 6 (22, 60) | 0.2 |
| jungle | 26 | 50 | 1.0 | 0.3 | 0.6 | 0.85 | 8 | 6 (18, 60) | 0.2 |
| steppe | 30 | 52 | 1.05 | 0.12 | 0.6 | 0.82 | 6 | 6 (18, 60) | 0 |
| badlands | 22 | buttes, 16 px steps | | | | | | 7 (11, 46) | 0 |
| wasteland | 28 | 54 | 1.0 | 0 | 0.6 | 0.85 | 6 | 6 (16, 56) | 0.15 |

Ramps as in 9a except: grass spread so its faces separate (deep
`[20, 54, 26]`, shadow `[34, 80, 32]`, mid
`[64, 126, 46]`, lit `[106, 172, 60]`, highlight `[160, 208, 90]`), and
steppe pulled toward the reference's mid-brown (mid `[156, 110, 66]`, lit
`[186, 140, 88]`, highlight `[214, 176, 118]`).

### Cost

Seed 2 size M: 36 chunks in 1.9 s in headless Chrome (9a: 1.1 s); the
window grows by the shadow march and each block tests about 25 sites per
lattice (peaks, spurs and, on badlands, buttes). Frames stay cached
(0.03 ms mean).

### Still artificial

- Peaks are one family per terrain; at zoom 1 a big steppe range is still a
  field of triangles, softer and more varied than the first take.
- Butte tops are rounded lozenges more than angular tablelands; the talus
  rills are uniform in direction within a slope.
- Grass reads less crisply than steppe and basalt.
- The relief is still smoother than the outlined chibi objects on it.
- Shadows stop at the relief's outline (nothing is painted on the ground).
