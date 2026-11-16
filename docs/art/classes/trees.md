# Trees asset contract

Status: draft (2026-11-16, bead `border_marches-xaj.26`; orchestrator call
after the user's Heroes of Might and Magic II reference). Specialises
[`../ART_DIRECTION.md`](../ART_DIRECTION.md) for the small single trees
that make up every forest on the adventure map.

## Inventory

Studio set `art/sets/trees`, derived files in
`public/assets/terrain/trees/<terrain>/<species>-<n>.png`, listed in
`src/assets/trees.ts` (`TREE_ASSETS`, `TREE_SPECIES_WEIGHTS`).

| Ground | Species (weight) | Source recipes |
| --- | --- | --- |
| Grass | conifer (5), broadleaf (2.4), autumn (2) | `grass-conifer-a`, `grass-broadleaf-a`, `grass-broadleaf-b`, `grass-autumn-a` |
| Jungle | broadleaf (3), palm (2.4), banana (1) | `jungle-a` |
| Steppe | oak (3), birch (1.4), bent (1.4) | `steppe-a` |
| Badlands | juniper (3), mesquite (2), gnarled (0.8) | `badlands-a` |
| Wasteland | deadoak (3), pine (2), leafy (1.6), snag (1) | `wasteland-a`, `wasteland-b` |

The same trees stand alone on open ground through the doodad layer
(`doodads.ts`, kind `tree`), at their native size.

## Geometry

- Generated at native display size on a 48 x 48 canvas and cropped to the
  opaque box plus 1 px: about 14-43 px wide (0.2-0.55 cell) and 25-44 px
  tall. Never scaled, never mirrored (the sun is at the bottom left).
- Anchor: the bottom centre of the cropped image is the trunk base.
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
