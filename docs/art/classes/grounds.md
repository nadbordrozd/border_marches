# Grounds asset contract

Status: draft (bead `border_marches-bzc.83`; the five imported grounds follow
[IMPORTED_FROM_PULP_WARS.md](../IMPORTED_FROM_PULP_WARS.md)).

## Inventory

| Ground | Files (public/assets/terrain/grounds/) | Period | Source |
| --- | --- | --- | --- |
| grass, jungle, steppe, badlands, wasteland | `<ground>.png`, `<ground>-swatch.png` | 8 cells (jungle 6) | Pulp Wars |
| volcanic | `volcanic.png` (400 x 400), `volcanic-swatch.png` (80 x 80), `volcanic-cracks.png` (480 x 480) | 5 cells; cracks 6 cells | studio set `grounds-volcanic` |
| snow | `snow.png` (400 x 400), `snow-swatch.png` (80 x 80) | 5 cells | studio set `grounds-snow` (bead bzc.87) |

The snow (take `base-e`) is calm blue-white with faint white wind marks.
It is an art family of its own (`GROUND_FAMILY`): snowy spruces, firs,
birches and larches ([trees.md](trees.md)), snow-capped peaks
([mountains.md](mountains.md)), snow doodads (set `winter-doodads`) and
winter decorations ([decorations.md](decorations.md)); it has no imported
forest set, so battles on snow borrow the grass conifer clumps
(`FOREST_FAMILY`). In `GROUND_RANK` it sits just before the volcanic: it
drifts out over every ground but the lava (winter zones never touch
volcanic ones).
| sand | `sand.png` (400 x 400), `sand-swatch.png` (80 x 80) | 5 cells | studio set `grounds-sand` (bead bzc.88) |

The sand (bead bzc.88) is one calm layer: golden dunes with soft diagonal
wind ripples (take `dunes-a`), low in contrast and seamless in a 3 x 3
repeat. It ranks last (`GROUND_RANK`), so the older grounds keep their
ranks and spill shapes; its drifting edge runs out over its neighbours. It
has its own trees and peaks (palm and cactus groves, golden sandstone mesas
and spires: its own art family in `src/assets/ground-family.ts`) and borrows
the steppe's imported forest set (`FOREST_FAMILY`, battle and town screens); no
imported doodads stand on it, since its own decorations (skulls, tumbleweed)
would repeat them.

| frosting | `frosting.png` (400 x 400), `frosting-swatch.png` (80 x 80) | 5 cells | studio set `grounds-frosting` (bead bzc.115) |

The frosting (bead bzc.115, the Candy Kingdom's native ground) is calm
pale strawberry icing with organic wavy cream palette-knife lines flecked
with sugar (take `icing-a`). It ranks last (`GROUND_RANK`, after the sand),
so every older ground keeps its rank and spill shape and its icing runs
out over its neighbours. Its own art family: frosted, cotton-candy and
lollipop groves with gumdrop bushes and candy canes ([trees.md](trees.md)),
strawberry gumdrop hills and rock-candy crags under poured icing
([mountains.md](mountains.md)), candy decorations
([decorations.md](decorations.md)); no imported doodads and the grass
family's forest set for battles (`FOREST_FAMILY`). Its motion is code:
a few sugar sparkles per frosting cell twinkle like the water's glints
(`MOTION.sparkle`, `cellSparkleSlots` in
`src/render/map/terrain-motion.ts`), a pixel then a small white cross,
only where the ground shows.

The volcanic texture is two layers: the calm basalt base (take `base-b`) and
an overlay of lava cracks (take `pixen-a`) drawn at its own period, so the
two repeat together only every 30 cells. The overlay file is the whole take;
the renderer keeps only its crack pixels at load (`crackOverlay` in
`src/render/map/terrain-motion.ts`: lava and the cracks' own dark red edge,
cracks of 8 px or more, 55% of them by a fixed hash, with a one-pixel dark
rim) and gives each crack one of three glow groups, which pulse out of step.

- Frosting (bzc.115): pixflux 400 x 400, flat shading, no fragments,
  8 takes. "Smooth pale pink icing ... broad soft swirls and gentle spread
  ridges ... like frosting smoothed over a huge cake with a palette knife"
  gave `icing-a` (wavy cream lines, a soft light drift; wrap seam about
  twice the inner noise, like the sand). The same words drew one big
  spiral; asking for sprinkles drew loud red dots on a radial light spot;
  "palette-knife lines" alone drew straight hatching or a drawn frame; the
  snow's phrasing drew lace bands, a ring motif or a wavy 60 px lattice
  that reads as a grid. The negative lists cake, plate, candy, puddles,
  blobs, circles and pattern words.

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
- Snow (bzc.87): pixflux 400 x 400, no fragments, "smooth fresh snow ...
  large soft, slightly bluer wind drifts ... faint thin curved wind lines".
  Asking for blue shadows in hollows drew round puddle blobs; asking for
  stones drew a stamped rock motif; one take came back as a faint brick
  grid. The negative lists puddles, blobs, dots, circles, squares and
  stones.
- Sand: pixflux 400 x 400, flat shading, no fragments at all; "rolling
  dunes seen from straight above ... no single big dune" gave the calm
  ripples (`dunes-a`); "a wide flat field of sand with wind ripples" gave
  loud white bead-like stripes or cell outlines that read as paving.

## Acceptance

Base: a 3 x 3 repeat on the sheet (`sheet --tile`) shows no seam or motif.
Cracks: organic, no grid; reviewed composed over the base in the game at
1x and 2x.
