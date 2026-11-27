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

**Fewer, larger forms (bead `border_marches-xaj.32`, 2026-11-27).** The user
asked for ranges "less like a pile of individual rocks" that "blend with their
native terrain the way they do in Homam2". A range is now laid from
**massifs** first: big forms of two or three joined summits, about two cells
wide, whose lower slopes are painted in the colours of their own ground
(meadow grass, straw, red scree, snowfield, drifted sand, ash, jungle moss)
and whose foot has no outline, so the range rises out of its plain the way
the Heroes II green mountains do. The smaller tiers fill only what the
massifs leave, mostly along the edges and in narrow runs. The grass family's
older tiers are toned toward the meadow's green so they sit with the massifs,
and the underlay between sprites is the ground itself in shade.

**Every family (bead `border_marches-bzc.140`, 2026-11-27).** The candy,
swamp and volcanic ranges got massifs of their own the same way: gumdrop
summits whose icing skirt is the frosting's own pale pink, mossy peat
summits on mud-coloured slopes, and basalt summits on the volcanic plain's
dark cinder (the wasteland massifs they borrowed stood on a pale ash rim).
The jungle's and the desert's older tiers are toned toward their ground as
the grass family's are.

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
| Volcanic (bzc.140) | basalt | the wasteland's foothills, peaks and summits, and massifs of its own (`PEAK_FAMILY`, `PEAK_BORROW` in `src/assets/peaks.ts`) |
| Snow (bzc.87) | alpine | blue-grey rock under snow caps and snowfields; set `winter-peaks` (10 foothills, 12 peaks, 7 summits; 6 calls) |
| Frosting (bzc.115) | candy | strawberry gumdrop hills and rock-candy crags under poured royal icing (the snow caps' candy answer); set `candy-peaks` (24 foothills, 16 peaks, 7 summits; 5 calls) |
| Swamp (bzc.126) | mossy peat | dark peat rock under thick olive moss, mossy hummocks and crags with roots; set `swamp-peaks` (see its verdicts) |

Each family has three tiers: `foothill` (from 56 x 44 requests), `peak` (from
80 x 64) and `summit` (from 120 x 88): 170 accepted sprites of 284 takes, 31
PixelLab calls. Every take has a verdict in `art/sets/peaks/verdicts.json`.

The fourth tier, `massif` (bead xaj.32), is the studio set
`art/sets/range-massifs` (layer `class-massif`), files
`public/assets/terrain/peaks/<terrain>/massif-<n>.png`: 50 accepted of 72
takes in 18 calls (US$2.08; bead bzc.140 added 15 of 20 takes in 5 calls,
US$0.58), generated at 160 x 112 or 168 x 104 (four candidates a call) and
cropped to about 131-161 x 45-89.

| Family | Massifs | Shape |
| --- | ---: | --- |
| Grass | 7 | rounded and twin green summits on long ridges, some with grey rocky crowns, slopes in the meadow's own green |
| Steppe | 5 | jagged tan rock summits over a straw-grass foot |
| Badlands | 6 | flat-topped buttes and mesas on one strata ridge over a red scree skirt |
| Snow | 5 | snow-capped twin and triple summits over a snowfield foot |
| Sand | 7 | sandstone mesas, spires and wind-carved knobs over drifted sand |
| Wasteland | 4 | jagged basalt ridges with ember cracks over an ash foot |
| Jungle | 3 | limestone towers under moss on a jungle-green foot |
| Frosting (bzc.140) | 5 | one, two or three strawberry gumdrop summits under dripping icing on a wide pale pink frosting skirt that vanishes into the plain |
| Swamp (bzc.140) | 6 | rounded and craggy peat summits under olive moss over long mud-coloured slopes |
| Volcanic (bzc.140) | 4 | sharp basalt ridges, one broken cone, ember cracks, over dark cinder slopes |

Rejected on sight for massifs, besides the list below: a flat cut bottom or a
rectangular snow or sand plate under the form (with a white line under it),
a heap of separate lumps or blocks (also stacked square boulders and loose
gumdrops beside the form), a cake on a plate, a lone dome on a stump base
(reads as a mushroom), pyramids, and bare rock lower slopes that
sit on the ground as a block.

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
- Massifs (bead xaj.32) are tried before every other tier at each foot at
  least 0.1 field units inside the range, and kept only where their whole
  foot (every 12 px between the 14% insets) stands on Mountain cells inside
  the outline: their broad slopes never spread over a passable cell beside
  the range. Smaller tiers keep further off a massif's face (exclusion
  half-axis down the map 0.5 of the mean height instead of 0.32), and a hole
  is closed by the biggest form that fits (massif, peak, then foothill), with
  no copy of a massif within 150 px.
- The underlay, inset from the outline, closes pinholes between the sprites:
  the ground's own texture pulled 60% toward the family's slope shadow.

## Readability

- Peaks are calmer than units and pickups: the map draws a toned copy
  (`peak-paint.ts`: 18% toward grey, 6% toward the family's line colour, 26%
  for the pale jungle limestone, which otherwise reads as speckled rubble,
  8% for the desert sandstone).
- The black outline becomes a dark tone of the family's rock, so the lines
  between overlapping peaks sit back and a range reads as one mass.
- Massifs keep more of their colour (8% toward grey, no darkening), their
  line is 40% of the way from the family's line colour to its slope shadow,
  and the outline along the lower 45% of their silhouette takes the colour of
  the slope beside it, so the foot melts into the ground. That includes the
  top edge of a wide, low skirt in that band (bead bzc.140: the candy
  massifs' icing skirt otherwise drew a dark rim on the pale frosting).
- The older tiers are toned toward their ground (`GROUND_LIFT`), so they sit
  with the massifs: the grass family's deep forest green has its green
  pixels brightened 32% and pulled 45% toward the meadow's hue; the jungle's
  moss is brightened 30% and pulled 55% toward the jungle floor's green and
  its limestone pulled 32% toward it (bead bzc.140); the desert's tan
  sandstone is brightened 10% and pulled 55% toward the dunes' gold (bead
  bzc.140).
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
- Frosting: "Strawberry pink #d65a94, shadow #9c3468, lit #ee8cb8 on the
  left faces; white icing #fff4ec (shadow #e3cfc4) poured over the top in
  rounded drips"; a pile of many small gumdrops (speckle), thin crystal
  needles and a terraced take were rejected. The description limit (2000
  characters with the layers) leaves room for three subjects a call.

Massifs (`class-massif`, bead xaj.32): "one big mountain massif ..., a broad
range of two or three joined summits", "a thin dark outline along the
summits and upper ridges only", "its lower slopes spread wide and low and
flatten out at the bottom edge of the image". The subject names the ground's
own colour for the lower slopes, for example "Its slopes are the meadow grass
of the plain around it: grass #8bb95e, lit #a6cf6e on the left faces, shadow
#5e8f45 and deep gullies #44703c on the right faces" (ground means measured
from the textures: grass #8bb95e, steppe #ccb86f, badlands #b36a45, snow
#d5e2f5, sand #e4b962, wasteland #79726b, jungle #65a25a; bead bzc.140:
frosting #fad5dd, swamp #4f502d, volcanic #42373f). Adding "tapering
out (to points) at both sides" and negatives "flat cut bottom, straight
bottom edge, line under it" fixed the boxy plates of the first steppe and
snow takes; the sandstone ones kept coming back with a cut base until the
subject said "rising out of sand dunes".

Bead bzc.140, the same layers: frosting "two round strawberry gumdrop
summits on a long iced ridge ... its lower slopes are smooth pale pink
frosting like the plain around it, #fad5dd, shadow #e2a9bf" (negatives
"cake, strawberries, cubes, blocks" after a strawberry cake and a row of
rock-candy cubes); swamp "peat rock #5a5040 ... olive moss #6b7f3c on the
upper slopes; its lower slopes are wet mud like the swamp around it,
#4f502d, shadow #3a3b22, lit #646638" (negatives "mushroom, stump" after a
moss dome on a stump); volcanic "rock charcoal #4e4a50 ... a few thin
glowing ember cracks #d0682c; its lower slopes are dark cinder like the
volcanic plain around it, #42373f, shadow #30282e, lit #5a4c56". All three
worked at the first call; the description limit leaves about 600
characters for the subject.

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
