# Grounds asset contract

Status: adopted (bead `border_marches-bzc.138`, the rollout of
[the texture experiment](#texture-experiment-bead-bzc127)): every land
ground is baked from PixelLab takes into one 12-cell texture, drawn under a
colour drift, cut from its neighbours by a brush with a rim, and sites stand
in trodden patches; see [the rollout](#rollout-bead-bzc138). The sections
below it on the older single takes are history: those takes are now inputs
of the bake.

## Inventory

Since bead bzc.138 every land ground's `<ground>.png` and
`<ground>-swatch.png` are baked (see [the rollout](#rollout-bead-bzc138)):
960 x 960, a 12-cell period, but the frosting (its icing take at 400 x 400,
5 cells). `edge-mask.png` (1200 x 1200) is the border brush. The table and
notes below record what each ground was before; the volcanic cracks
overlay is unchanged.

| Ground | Files (public/assets/terrain/grounds/) | Period | Source |
| --- | --- | --- | --- |
| grass, jungle, steppe, badlands, wasteland | `<ground>.png`, `<ground>-swatch.png` | 8 cells (jungle 6) | Pulp Wars (until bzc.138) |
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

| swamp | `swamp.png` (400 x 400), `swamp-swatch.png` (80 x 80) | 5 cells | studio set `grounds-swamp` (bead bzc.126) |

The swamp (bead bzc.126) is calm murky olive mud with a soft diagonal
mossy drift, olive reed flecks and dark wet speckles (take `mire-a`; one
recorded take, swappable by a later ground restyle). It ranks last
(`GROUND_RANK`, after the frosting), so every older ground keeps its rank
and spill shape and its mud creeps out over its neighbours. Its own art
family: bald cypresses, mossy oaks, mangroves, mossy bushes and pale
willows in drifts ([trees.md](trees.md)), mossy peat hummocks and crags
([mountains.md](mountains.md)), swamp decorations
([decorations.md](decorations.md)); no imported doodads, and the jungle
family's forest set for battles (`FOREST_FAMILY`). Its motion is code: two
bubble slots per swamp cell (`MOTION.bubble`, `cellBubbleSlots` in
`src/render/map/terrain-motion.ts`) where a pale murky pixel swells into a
little ring and pops, out of step, only where the ground shows; nothing
shows when the terrain is still.

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

- Swamp (bzc.126): pixflux 400 x 400, flat shading, no fragments, 7
  takes. "Wet swamp mud ... large soft, slightly greener mossy drifts ...
  many tiny short dark green flecks and a few small faint wet sheens"
  gave `mire-a`. Asking for puddles and reed tufts drew stamped reed clumps
  and a dark blob (`mud-a`), a standing figure (`mud-b`) or purple lakes
  with rims (`bog-a`); "wavy ripples" drew a frame (`marsh-a`); others a
  hard seam or a leaf lattice. The negative lists lakes, ponds, circles,
  lily pads, flowers and pattern words.

## Geometry

Seen from straight above, edge to edge, no centre, border or perspective;
drawn at map pixel modulo the period (80 px cells, 12 cells since bead
bzc.138). A baked texture tiles by construction (the bake works on a
torus).

## Readability

Painterly but background (ART_DIRECTION, "Ground is background", bead
bzc.138): fine 2-6 px detail in the ground's identity colour, luma spread
about 5-16% (the snow and frosting at the low end), no single large
feature; units, towns and sites read first. The volcanic cracks cover under
1% of the ground; the rest is basalt so units and pieces stand out.

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

## Texture experiment (bead bzc.127)

The user finds our grounds "nice but not as nice as" the Heroes II and III
maps. What makes those rich: dense painterly detail at 2-6 px (blades,
streaks, pebbles), colour drift at two scales, soft organic blotches, no
visible period, ragged interlocking edges between grounds with a darker
rim, and sites standing in their own patch of trodden earth. Ours are one
calm colour with 1 px noise (luma spread: grass 3.2%, red earth 6.1%,
sand 1.8%), a 5-8 cell period and the sine-wave spill.

**The lab.** `node tools/ground-lab/ground-lab.mjs [--out DIR] [--refs DIR]`
paints three fixed 8 x 6 cell scenes (grass, red earth, water and a forest
edge; sand meeting grass; a crowded corner with sites) with the game's own
`paintGround` and with each experiment, the game's trees, doodads and
pieces on top, and writes one sheet per scene (1x panels plus a 2x window)
and an overview. Its painter is `paintGround` with two hooks (`texel`,
`rankAt`) and checks on every run that it reproduces the game byte for
byte. Default output `.orchestration/ground-lab/` (git-ignored); with
`--refs` the sheets carry crops of the reference screenshots and must not
be committed. Nothing in it runs in the game.

| Variant | What | Verdict |
| --- | --- | --- |
| A code layers | the game's textures patch-bombed (warped Voronoi regions of about 2 cells, each reading the texture at its own offset), two-scale drift in three dithered palettes, a 2-4 px mottle, a code-drawn tuft/pebble/ripple overlay at its own 9-cell period | kills the period and adds drift; the code tufts read as sprinkles, not grass. Drift alone is worth keeping |
| B PixelLab takes | several 400 px takes per ground (not tileable), bombed round their middles | far richer, painterly like Heroes III, but the model's own colours (olive grass, brown earth) and too busy for the piece hierarchy |
| B2 takes in game colours | B with each take moved to the game ground's mean colour and about 2.6x its luma spread (`matchTake`) | the best texture: painterly blades, ripples and cracks in each ground's identity colour, no visible repeat |
| C brush-mask edge | the border between grounds cut by the smooth field's contour plus a reach driven by a generated ink-blot mask and a slow noise (lobes and shards both ways, about +-15 px), with a dark 1 px line and a 4-5 px dithered rim on the lower ground | clearly better than the spill: organic, layered edges; still hard pixel steps |
| C noise edge | the same with a procedural mask (no art) | nearly as good; smoother lobes, fewer shards |
| A+C | code only | richer than today at zero art cost, but flatter than B2 |
| Combo | B2 + A's drift (0.6) + C + trodden patches under sites (a dulled earth ellipse cut by the brush) | the recommendation |

**Recommendation: the combo, rolled out in two steps.**

1. *Grounds:* per ground 2-3 pixen takes at 400 x 400 with the
   `high top-down` view (set `ground-lab-pixen`), the ground's interior
   cropped, colour-matched to its current mean colour and baked offline by
   the bomber into one long-period tileable texture (say 12 cells, 960 px)
   per ground, so the renderer keeps sampling a texture modulo its period;
   plus A's drift at run time. Needs a user approval: the luma spread rises
   from 2-6% to about 5-16% (the "Ground is calm" rule), though the units
   and sites still read first on the sheets.
2. *Transitions:* C in `groundRankAt` (the reach from a baked tileable
   brush mask instead of `spillReach`'s sines, per pixel instead of 2 px
   blocks) with the rim band per lower ground; then the trodden patches
   under sites from the plan's terrain objects.

**Rollout cost.** Ten land grounds once swamp (bead bzc.126) lands: grass,
steppe, jungle, badlands, wasteland, snow, volcanic (its cracks overlay
stays), sand, frosting, swamp; water is unchanged. The hit rate here was
6 usable pixen takes in 12 calls (pixflux: 0 in 12), so about 5 calls per
ground, 50 calls, about US$0.50; one edge mask serves every pair. Code:
a bake step from masters to the long-period textures (a studio-art output
step or a checked derivation, so `validate` covers it), the drift layer,
the mask edge and rim in `ground.ts`, the patches in the terrain plan, and
`GROUND_RANK` read for the rim style. Battle and town screens that reuse
the ground textures get the new look for free.

**Performance.** The ground is painted per pixel into cached 640 px chunks.
Baked textures cost what today's do; memory is about 3.7 MB per ground at
960 px (37 MB for ten, against about 1.6 MB per ground now), or 640 px
(1.6 MB each) with a little more visible repeat. The lab's unoptimised
per-pixel bombing ran about 2x the current chunk time, the brush edge
about 1.3x, the noise edge about 1x, the whole combo about 3x; baking the
bombing and sampling the mask from a table should bring the combo near
1.3x the current build time. Chunks are cached, so this is paid on first
view only.

**Lessons.** pixflux with `medium shading` and `highly detailed` draws
stamped motifs, stripes, polka dots or a tiled floor; with an init image
at strength 300 it keeps the underpainting's blobs as hard shapes. pixen
paints convincing ground but frames it (a rim, a plate, a lit corner):
keep `view: high top-down` (without it pixen draws a clearing, a pit or a
courtyard) and crop the interior. Ink blots on paper make a good edge
mask; moss on stone drew a floor plan.

## Rollout (bead bzc.138)

The combo of the lab, in the game. The orchestrator approved the higher
contrast (luma spread about 5-16%, was 2-6%) as an art-direction change the
user may overrule (ART_DIRECTION section 2, "Ground is background").

**Takes.** Set `grounds-pixen` (pixen 400 x 400, `view: high top-down`,
lineless, highly detailed), plus the lab's accepted takes (set
`ground-lab-pixen`) and two older single takes. Which take feeds which
ground is in `art/bake/grounds.json`:
| Ground | Takes (crop) | Colour, spread |
| --- | --- | --- |
| grass | `ground-lab-pixen` grass-q, grass-s, grass-p | `#8bb95e`, 8% |
| steppe | `grounds-pixen` steppe-c, steppe-d (flatten 0.7) | `#ccb86f`, 7% |
| jungle | `ground-lab-pixen/grass-p` and `grounds-pixen/swamp-a` (its moss clumps) | `#65a25a`, 10% |
| badlands | `grounds-pixen/badlands-b`: calm earth with hairline cracks, the calmer red earth asked for | `#b36a45`, 9% |
| wasteland | `grounds-pixen` wasteland-d (ash, charred twigs) and badlands-b (cracks), flatten 0.6 | `#79726b`, 8% |
| snow | `grounds-pixen/sand-a` (its wind ripples read as drifted snow), flatten 0.6 | `#d5e2f5`, 3.5% |
| volcanic | `grounds-pixen/badlands-b` and `ground-lab-pixen/dirt-s` (cracked rock); cracks overlay kept | `#42373f`, 7% |
| sand | `grounds-pixen/sand-a`, `ground-lab-pixen/sand-p` | `#e4b962`, 5% |
| frosting | `grounds-frosting/icing-a`, `mode: repeat` | `#fad5dd`, 4% |
| swamp | `grounds-pixen/swamp-a` (wet mud ripples, moss clumps) | `#4f502d`, 10% |

Pixen hit rate: 6 usable of 32 calls (US$0.35). The model frames its
ground (a rim, a wall, a plate), and for snow, icing, ash and basalt it
draws a scene (a snowy courtyard, cakes, flagstones); "looking straight
down at ...: only ..., nothing else" did no better than "seen from straight
above, ... running off every edge". Words that worked: grass, dry grass,
rust earth, golden sand, swamp mud, ash with twigs. So the snow and the
volcanic basalt borrow the ripples and cracks of other takes, moved to
their own colours, and the frosting keeps its own tileable icing take.

**The bake** (`node tools/art/ground-bake.mjs bake|validate|preview`,
recipe `art/bake/grounds.json`): each take is cropped to its open interior
(pixen frames its ground), its slow light and dark patches half pulled to
its own mean (box radius 24 px), then moved to the ground's colour (the
mean of its texture before bzc.138, so every ground keeps its identity
colour) at the ground's luma spread. The takes are patch-bombed onto a
960 px torus: warped Voronoi regions 96 px apart, each reading one take
round its middle at its own offset, with a 6 px stippled seam between
regions. A take that already tiles and has long strokes (the frosting's
icing lines) is `mode: repeat`: recoloured only, at its own period. The
swatch is the texture's first cell. `validate` re-derives every file from
the hash-checked masters and compares pixels; `tests/assets/manifest.test.ts`
runs it and `CHECK_ART` (tools/orchestration/config.sh) runs it with the
studio validate.

**The brush** (`edge-mask.png`, 1200 x 1200 grey, baked by the same tool
from the ink-blot take `ground-lab-pixen/ink-p` bombed the same way, half
weight, plus a slow periodic noise, 0.7): byte v is an edge value
(v / 255 x 2 - 1) x 1.4.

**At run time** (`src/render/map/ground.ts`, per pixel, cached in the
640 px chunks):

- *Borders* (`groundEdgeAt`, replacing the Pulp Wars spill): the higher
  ground reaches 2 px past the smooth field's meandering contour plus 11 x
  the brush (read at an offset per rank), so lobes, bites and droplets run
  both ways, about +-13 px, in hard pixel steps. 11 keeps every lobe inside
  the 3 x 3 rank neighbourhood (the lab clipped at 15). The lower ground
  under the cut gets a 1 px dark line and a 3-5 px rim band dithered by a
  Bayer threshold (`RIM`, per lower ground).
- *Drift* (`ground-noise.ts` `driftField`): two scales of value noise
  (about six and one and a half cells), rotated and warped, sampled every
  8 world px and read bilinearly, cut at 0.44 and 0.56 with a 4 x 4 Bayer
  threshold into three palettes per ground (`DRIFT_TINT`: darker and
  cooler, the texture's own, lighter and warmer). The volcanic cracks are
  not drifted.
- *Trodden patches* (`groundPatches`): under every town, mine, dwelling,
  site, bank and teleport of the map as made (terrain-plan.ts
  `terrainObjects`, so a patch never moves in a game; tested with the
  terrain-stability test), an ellipse about 0.84 x the footprint wide and
  0.48 deep round its foot, its edge frayed by the brush, where the
  ground's own texture is mixed toward a packed-earth colour of that ground
  (`PATCH`).

**Cost.** `paintGround` per 640 px chunk over every chunk of three generated M maps
(seeds 11-13, 108 chunks, the second of two passes, Node, a loaded
machine): about 1.17-1.27x the pre-bzc.138 painter (for example 66 ms
against 78 ms), within the 1.3x budget; the textures are sampled as before,
the brush is one table read per higher rank, the drift a bilinear read of
a grid sampled every 8 px (about 6,500 noise evaluations a chunk), the
patches an ellipse test in the few cells round buildings. Memory: a baked
ground is 960 x 960 RGBA, 3.7 MB as read pixels (the frosting 0.6 MB), 34
MB for the ten against about 10.7 MB before, plus the 1.4 MB brush table
(one byte a pixel); the browser holds the decoded images as well.

Battle and town screens that tile the ground textures get the new grounds
as they are (no drift, no brush). The lab (tools/ground-lab) still compares
its experiments against the pre-bzc.138 painter in its own models; its
"lab painter equals the game's paintGround" check no longer holds.
