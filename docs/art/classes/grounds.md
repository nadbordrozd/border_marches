# Grounds asset contract

Status: draft (bead `border_marches-bzc.83`; the five imported grounds follow
[IMPORTED_FROM_PULP_WARS.md](../IMPORTED_FROM_PULP_WARS.md)).

## Inventory

| Ground | Files (public/assets/terrain/grounds/) | Period | Source |
| --- | --- | --- | --- |
| grass, jungle, steppe, badlands, wasteland | `<ground>.png`, `<ground>-swatch.png` | 8 cells (jungle 6) | Pulp Wars |
| volcanic | `volcanic.png` (400 x 400), `volcanic-swatch.png` (80 x 80), `volcanic-cracks.png` (480 x 480) | 5 cells; cracks 6 cells | studio set `grounds-volcanic` |

The volcanic texture is two layers: the calm basalt base (take `base-b`) and
an overlay of lava cracks (take `pixen-a`) drawn at its own period, so the
two repeat together only every 30 cells. The overlay file is the whole take;
the renderer keeps only its crack pixels at load (`crackOverlay` in
`src/render/map/terrain-motion.ts`: lava and the cracks' own dark red edge,
cracks of 8 px or more, 55% of them by a fixed hash, with a one-pixel dark
rim) and gives each crack one of three glow groups, which pulse out of step.

## Geometry

Seen from straight above, edge to edge, no centre, border or perspective;
drawn at map pixel modulo the period (80 px cells). A base must tile: its
wrap seam no worse than its own neighbour-to-neighbour noise.

## Readability

Calm: luma spread like the imported grounds (the volcanic base is quieter
still), a few discrete details. The volcanic cracks cover under 1% of the
ground; the rest is plain basalt so units and pieces stand out.

## Recipe

- Ground layers use the `class-ground` fragment only: the chibi `style`
  fragment turns a texture into a character or an object on a field.
- `create-image-pixflux` 400 x 400, flat shading, no style layer, subject
  without the word "texture" or "tile" gave the calm base.
- `create-image-pixen` 480 x 480 gives organic crack networks, but any
  mention of a seamless texture or tile makes it draw a paving grid.
- Never ask for "volcanic" alone: the models draw a volcano.

## Acceptance

Base: a 3 x 3 repeat on the sheet (`sheet --tile`) shows no seam or motif.
Cracks: organic, no grid; reviewed composed over the base in the game at
1x and 2x.
