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

- Generated at native display size on a 48 x 48 canvas and cropped to the
  opaque box plus 1 px: about 14-43 px wide (0.2-0.55 cell) and 25-44 px
  tall. Never scaled, never mirrored (the sun is at the bottom left).
- Anchor: the bottom centre of the cropped image is the trunk base.
- The outline of a wood avoids the cell grid: blocked neighbours (water,
  rock, roads, objects, the map edge) pull it inside the wood, where it
  wobbles instead of being clipped straight along a cell edge; slow one-sided
  bites cut bays near the edge; deep inside the cells the canopy is always
  closed (no clearings), and the under-tint sits 20 px north of the region so
  it never shows south of the last trunks.
- In a wood (`src/render/map/canopy.ts`) a crown rises at most 40 px above
  the top edge of the wood's northernmost cell, and at most 14 px into a
  cell holding an object, so a full-height unit behind a wood stays half
  visible.

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

## Acceptance

- No ground plate, shadow or second tree in the image.
- Lit from the left; no mirrored copies.
- Reviewed per recipe on the contact sheet (native and x4, light and dark),
  then in the game at zoom 0.75 and 1 inside a wood.
