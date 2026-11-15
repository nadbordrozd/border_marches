# Map beauty iteration 2: massif pieces, 3x2 towns, doodads (bead `border_marches-xaj.14`)

New adventure-map art made with the studio pipeline ([PIPELINE.md](PIPELINE.md))
in the inherited Bold chibi direction ([ART_DIRECTION.md](ART_DIRECTION.md)).
The target, in the user's words: "all the mountain ranges look unique ...
cleverly connected so that no matter the shape of the mountain range it looks
like a coherent whole and not like the same rock sprite pasted 20 times". The
captures of the map before this bead are
[`screens/map-seed1-M-z075.png`](screens/map-seed1-M-z075.png) and
[`screens/map-ranges-z1.png`](screens/map-ranges-z1.png): every range is a
field of near-identical snow-capped cones.

Nothing is wired into the renderer here (bead `xaj.15` does that); the art,
its manifest entries and review evidence are.

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
  11 px above the footprint); Warlord's Hold: box 22,33 195 x 147 (inside
  the footprint). Yards inside the walls are transparent. No flag anchor:
  there is no flag. The town's entry cell is still a design question.
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

- Wire the pieces (bead `xaj.15`): packing that prefers 3x2 and 2x2 massifs
  inside a range, ridges on its rows, foothills and rounded pieces on the
  rim, palette by the range's ground, back-fill with 1x1 low pieces, and no
  two neighbours of one kind with the same variant.
- A 1x1 tall piece per palette (a single peak rising 48 px) does not exist
  yet; runs of one cell with rock behind fall back to crags.
- Doodad strewing in the decoration layer, kept away from cell centres.
- Town entry cells and shadows for the 3x2 towns.
