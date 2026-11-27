# Trees asset contract

Status: draft (2026-11-16, beads `border_marches-xaj.26` and `xaj.27`; orchestrator call
after the user's Heroes of Might and Magic II reference). Specialises
[`../ART_DIRECTION.md`](../ART_DIRECTION.md) for the small single trees
that make up every forest on the adventure map.

## Inventory

Studio set `art/sets/trees`, derived files in
`public/assets/terrain/trees/<terrain>/<species>-<n>.png`, listed in
`src/assets/trees.ts` (`TREE_ASSETS`, `TREE_SPECIES_WEIGHTS`).

| Ground | Species (weight) | Source recipes |
| --- | --- | --- |
| Grass | conifer (5), broadleaf (3), autumn (5, in drifts only) | `grass-conifer-a`, `grass-broadleaf-b`, `grass-autumn-a` |
| Jungle | broadleaf (3), palm (2.4), banana (1) | `jungle-a` |
| Steppe | oak (3.4), bent (1), birch (0.7) | `steppe-a` |
| Badlands | pinyon (3.2), juniper (2), gnarled (0.8), mesquite (0.45) | `badlands-a`, `badlands-b` |
| Wasteland | deadoak (3), pine (2), leafy (1.6), snag (0.6) | `wasteland-a`, `wasteland-b` |
| Snow (bzc.87) | spruce (5), fir (2.4), larch (2, in drifts only), birch (0.9) | set `winter-trees`: `snow-conifer-a`, `snow-mixed-a` |
| Swamp (bzc.126) | cypress (4: flat-topped bald cypresses hung with moss), mossoak (3: gnarled oaks draped with moss), mangrove (2.2: round crowns on stilt roots), bush (1: low mossy trees), willow (1.6, in drifts only: pale weeping willows) | set `swamp-trees`: `willow-a`, `mangrove-a` (33 of 50 takes, 2 calls; plain conifer cones and thin-branched crowns rejected) |
| Frosting (bzc.115) | frosted (4: pink frosting crowns on gingerbread trunks), cotton (3.4: cotton candy), lollipop (2), gumdrop (1: low bushes), cane (1.4, in drifts only: candy canes) | set `candy-trees`: `fluff-a`, `cane-a` (34 of 50 takes, 2 calls) |
| Volcanic (bzc.125) | charred (4: black trees with ember cracks), ashen (2.2: ash-grey dead trees), cindersnag (1.2: broken trunks with ember tips), emberleaf (0.8: a few red-orange leaves); files in the wasteland folder, drawn only by the lava | set `volcanic-trees`: `charred-a` (19 of 25 takes, 1 call) |

Bead bzc.165 replaced every game file above with `x15-*` takes at about
1.5x (see Geometry and Recipe); the first takes stay as accepted masters and
serve as the new recipes' style and reference images.

The same trees stand alone on open ground through the doodad layer
(`doodads.ts`, kind `tree`), at their native size, as common as their
species is in the woods (a clumped species at a quarter of its weight).

## Palette of a wood (bead `border_marches-xaj.27`)

After the Heroes II reference: a wood is a calm, dense dark-green and
conifer mass; colour comes in clumps, not confetti.

- Grass woods: conifers and deep-green broadleaf are the base. Autumn trees
  grow only in drifts (`TREE_SPECIES_DRIFT`: where a slow noise of about two
  cells passes 0.57), about 12% of grass-wood trees, and there they crowd
  together like the reference's autumn stands.
- Retired in xaj.27: all 13 lime "summer" takes of `grass-broadleaf-a` and
  the 5 olive yellow-green takes of `grass-autumn-a` (verdicts in
  `art/sets/trees/verdicts.json`): they read as loud lime confetti.
- Badlands: fewer umbrella mesquites; `badlands-b` adds 11 dense olive-sage
  pinyon/juniper crowns, warmer than the teal `badlands-a` junipers, so the
  scrub sits on the red earth in patches of two greens.
- Per-ground density and shade (`CANOPY_GROUND` in `canopy.ts`): green woods
  and badlands scrub pack closer (spacing 0.8-0.9) with a deeper under-tint;
  the see-through dead wasteland trees keep their spacing and a lighter one.

## Geometry

- Size (bead bzc.165, after the user liked the bzc.144 T1.5 preview but
  not its visible pixels): every family redrawn as real art at about 1.5x,
  generated at native display size and cropped to the opaque box plus 1 px:
  about 18-62 px wide (0.25-0.75 cell) and 35-64 px tall, most trees 46-61.
  The band accepted per species is about 1.25-1.8x its first takes' height,
  with a 64 px ceiling so no tree rivals the summits (43-84 px) and massifs
  (45-89 px). Never scaled, never mirrored (the sun is at the bottom left).
  (The first set, 2026-11-16: 48 x 48 canvas, 14-43 x 25-44 px.)
- Anchor: the bottom centre of the cropped image is the trunk base.
- The outline of a wood avoids the cell grid: blocked neighbours (water,
  rock, roads, objects, the map edge) pull it inside the wood, where it
  wobbles instead of being clipped straight along a cell edge; slow one-sided
  bites cut bays near the edge; deep inside the cells the canopy is always
  closed (no clearings), and the under-tint sits 20 px north of the region so
  it never shows south of the last trunks.
- In a wood (`src/render/map/canopy.ts`) a crown rises at most 50 px above
  the top edge of the wood's northernmost cell (40 before bzc.165), and at
  most 18 px into a cell holding an object (14 before), so a unit behind a
  wood stays partly visible. bzc.165 also widened the trunk spacing ellipse
  from 12 x 8 to 13 x 8 px and the edge thinning from 36 to 42 px, so the
  bigger crowns overlap into one canopy (as in the T1.5 preview, which kept
  12 x 8) without piling into a blob. Passability is untouched: trees are
  drawn on the Forest cells and the free ground beside them only.

## Readability

- Trees are calmer than units and pickups: the map draws a toned copy of
  each (`canopy-paint.ts`: 24% toward grey, 14% toward the ground's dark
  tone, black outline kept).
- One tree reads as a tree at 1x; a wood reads as one canopy of overlapping
  crowns, not as single sprites. Thin silhouettes (bare poles, single-pixel
  branches, weeping fringes) are rejected because they turn to noise in a
  crowd.

## Recipe

`generate-image-v2`, 48 x 48, no background, layers `style`,
`light-south-west`, `class-tree`, subject. One call returns 25 candidates of
a mixed subject ("each image a different one of these: ..."), so a species
family costs one call. Colours as hex with a shadow tone and a light on the
left side.

Worked: chunky crowns of leaf clumps, a short trunk, "about two thirds of
the image wide and nearly the full image tall". Did not work: wildfire
"dead trees" gave mostly stumps and bare poles until the subject asked for a
full bushy crown of short bare branches; free text "pear", "heart" and
"lollipop" shapes appear in round-crown subjects and are rejected.

### The 1.5x redraw (bead bzc.165)

Recipes `x15-*` in each set: `generate-image-v2` with the family's first
accepted take as `styleImage` (palette, outline, shading, chunky look) and up
to four first takes as `references` ("the same design, redrawn bigger"), the
first subject with "redrawn larger with a little more detail". 56 x 72, 64 x
64, 52 x 64 and 48 x 60 canvases return 16 candidates, 48 x 48 and 40 x 52
return 25; one call costs about US$0.082. A mixed subject of four items gives
four groups of four, one per item, each group the same size.

Size is the hard part: the output either keeps the references' pixel scale
(about 35-45 px tall whatever the canvas) or fills about 0.9 of the canvas
height when the items or the size line say "tall" / "Big ... nearly the full
image tall". Explicit fractions ("about three quarters of the image tall")
did not work: they came out at the old size or filled the canvas. What
worked: tall wording on a canvas whose two outcomes both land in the band,
for example 52 x 64 for the grass conifers (50-58 px). 72 px canvases with
tall wording gave 64-70 px trees, over the ceiling. A cane recipe
(`x15-cane-d`) was refused by PixelLab's policy filter (no charge, recorded
as FAILED).

Left over: the candy cane drift has one new sprite (two crossed canes,
`x15-cane-a#14`); more canes need another try. Mangroves have two.

## Acceptance

- No ground plate, shadow or second tree in the image.
- Lit from the left; no mirrored copies.
- Reviewed per recipe on the contact sheet (native and x4, light and dark),
  then in the game at zoom 0.75 and 1 inside a wood.
