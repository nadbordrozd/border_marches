# Mountains asset contract

Status: approved by the user (bead `border_marches-xaj.30`, 2026-11-22; the
orchestrator's call after the user rejected the code-drawn relief for its
dithered style and its from-above view). Since bead `border_marches-xaj.29`
the peaks are the only mountain renderer (see
[Retired renderers](#retired-renderers)). Specialises [`../ART_DIRECTION.md`](../ART_DIRECTION.md) for
the front-view peaks that make up every mountain range on the adventure map.

## Direction

A range is built the way the approved forest is built: a dense, y-sorted crowd
of small hand-style sprites whose bodies overlap into one mass. Every peak is
drawn from the same viewpoint as the trees, units and buildings (the front,
camera slightly above, base at the bottom, summit against the background),
with their dark outline and chunky flat shading, lit from the bottom left.

Mountains do not blend between terrains. The ground under a peak's foot picks
its family, and a hard change between two families is allowed.

## Inventory

Studio set `art/sets/peaks`, derived files in
`public/assets/terrain/peaks/<terrain>/<tier>-<n>.png`, listed in
`src/assets/peaks.ts` (`PEAK_ASSETS`).

| Ground | Family | Shape |
| --- | --- | --- |
| Grass | green mountains | rounded grassy bodies with grey rock crests |
| Jungle | karst | steep limestone towers under moss and vines |
| Steppe | dry crags | jagged tan and brown rock peaks |
| Badlands | buttes | red-orange flat-topped strata, mesas and hoodoos |
| Wasteland | basalt | dark jagged spires with thin ember cracks |
| Snow (bzc.87) | alpine | blue-grey rock under snow caps and snowfields; set `winter-peaks` (10 foothills, 12 peaks, 7 summits; 6 calls) |

Each family has three tiers: `foothill` (from 56 x 44 requests), `peak` (from
80 x 64) and `summit` (from 120 x 88): 170 accepted sprites of 284 takes, 31
PixelLab calls. Every take has a verdict in `art/sets/peaks/verdicts.json`.

## Geometry

- Generated at native display size and cropped to the opaque box plus 1 px on
  the top and sides; the last row of the image is the foot. Never scaled,
  never mirrored (the sun is at the bottom left).
- Anchor: the bottom centre of the cropped image.
- Placement (`src/render/map/peaks.ts`): blue-noise feet at world coordinates
  inside a wobbled outline, summits deep inside a range and foothills along
  its edge.
- A peak rises at most 40 px above the top edge of the range's northernmost
  cell in its column, and at most 14 px into a cell holding an object. What
  rises over an open cell is drawn in the foreground crown bands, so it covers
  only the feet of a unit standing behind.
- Feet never stand on a road, an object, an entrance or water.
- A rock-toned underlay, inset from the outline, closes pinholes between the
  sprites and stays hidden behind them.

## Readability

- Peaks are calmer than units and pickups: the map draws a toned copy
  (`peak-paint.ts`: 18% toward grey, 6% toward the family's line colour, 26%
  for the pale jungle limestone, which otherwise reads as speckled rubble).
- The black outline becomes a dark tone of the family's rock, so the lines
  between overlapping peaks sit back and a range reads as one mass.
- Spacing is per family (`PEAK_SPACING`): the spiky basalt gets the most air.
  Inside a range a foothill only fills a real hole.
- No two copies of a sprite stand within 64 px, and a sprite prefers no copy
  within 150 px.
- Rejected on sight: clipped subjects, crater tops seen from above, terraced
  "cake" shapes, column stripes (noise in a crowd), arches, built-looking
  boxes and anything that reads as a tree or a bush.

## Recipe

`generate-image-v2`, no background, layers `style`, `light-south-west`,
`class-peak`, subject. One call returns 25 candidates at 56 x 44, 9 at 80 x 64
and 4 at 120 x 88, of a mixed subject ("each image a different one of
these: ..."). Colours as hex with a shadow tone and a lit tone on the left.

Prompt fragments that worked:

- View (in `class-peak`): "a standing object seen from the front with the
  camera only slightly above it, exactly like a tree or a building on the same
  map: we see its front face rising up and its summit against the empty
  background, never its top from above".
- Grass: "Grass #3f7d45, shadow #2a5a38, lit #69a659 on the left; rock #8d8a7c,
  shadow #5c5a54".
- Jungle: "Limestone #a8a48c, shadow #6e6e5c; vines and moss #3f8a4e, shadow
  #24603f".
- Steppe: "Rock tan #b8965e, shadow #7c5f3a, lit #d9bd82 on the left faces".
- Badlands: "Rock red-orange #c46a3c, shadow #823f28, lit #e39a5c, pale strata
  stripes #e8c07a".
- Wasteland: "Rock charcoal #4e4a50, shadow #2e2b32, lit #77717a on the left
  faces, a few thin ember cracks #a05a30".
- Snow: "Rock blue-grey #6e7684, shadow #474e5c, lit #949cab on left faces;
  snow #eef4fa, shadow #b4c4d8 on right faces"; summits with a negative of
  "terraces, steps, crater, flat top" (the first summits came back as
  banded cakes and a crater).

## Acceptance

- No ground plate, shadow or second object in the image.
- Lit from the left; no mirrored copies.
- Reviewed per recipe at native size and enlarged on light and dark, then in
  a whole-map poster (`npm run map:poster -- --seed N --size M --out file.png`)
  beside trees, units and buildings.

## Retired renderers

Removed by bead `border_marches-xaj.29` (2026-11-25), with their URL switches,
tests and assets; the whole-map poster of seed 37 (size M) was byte-identical
before and after.

- **Massif sprites** (`?mountains=sprites`, beads `xaj.14` to `xaj.23`): the
  packer `src/render/map/massif.ts`, the `MASSIF_PIECES` manifest entries, the
  studio sets `massif-granite`, `massif-sandstone` and `massif-basalt` (their
  recipes, records, verdicts, masters and `art/refs` style images), the
  derived files under `public/assets/terrain/massifs/`, the scree and rock
  base of the ground painter, and the review scripts that composed them.
  History: [`../MASSIF_ART.md`](../MASSIF_ART.md); spend stays in
  `art/costs.jsonl`.
- **Code-drawn relief** (`?mountains=relief`, beads `xaj.25` and `xaj.28`):
  the heightfield painter `src/render/map/relief.ts` and its lips.
  History: [`../MASSIF_ART.md`](../MASSIF_ART.md) (iterations 9 and 10).

Both are recoverable from git history before the bead's commit.
