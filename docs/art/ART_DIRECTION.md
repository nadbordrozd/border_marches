# Art Direction

**Status: inherited direction, adopted 2026-11-15** (bead
`border_marches-xaj.1`). border_marches takes over the art direction the
user approved for Pulp Wars (Bold chibi, 2026-09-29; sun at the bottom left,
2026-10-05), because the user asked this game to reuse Pulp Wars sprites and
its map lessons. The adventure-map goals in [section 4](#4-the-adventure-map)
are new here; their terrain pieces start as exploration sets until a sample
passes review.

This file is the single shared direction for every visual asset. Class files
under [`classes/`](classes/) add constraints for one class (units, tiles, UI,
...) and may specialise, never contradict, this file. How assets are made is
in [PIPELINE.md](PIPELINE.md).

**The rulebook** is the Pulp Wars digest
`/Users/nadbor/projects/pulp_wars/docs/art/LESSONS_MAP_AND_FACTION_SPRITES.md`.
Read it before planning any set. This file summarises it and adds what is
different here; where the two disagree, this file wins for border_marches.

## 1. The style in one paragraph

Bold chibi pixel art: chunky, cute figures with big heads (about half the
figure's height), short sturdy bodies and one oversized signature weapon,
tool or feature; a thick single-colour black outline; flat colours with one
shadow tone; low detail; every figure readable from its silhouette alone.
Three-quarter view looking slightly down, subjects facing south-east, lit by
a low sun at the bottom left (south-west). Pieces are fully saturated and
black-outlined; the ground under them is calm, lineless and textured, like
the adventure map of Heroes of Might and Magic II: clearly jungle or steppe
or ash, but always background. Charming, pulpy and silly; a board game come
to life, never gritty.

(The same text goes into the prompt fragment `art/fragments/style.txt`; that
file is outside this bead's scope and is a follow-up.)

## 2. Shared rules for every asset

The Pulp Wars TL;DR, condensed:

| Rule | Detail |
| --- | --- |
| Generate at display size | 80 x 80 px map cells; never generate big and downscale. Dense screens use integer nearest-neighbour x2/x3 of the same master. Sprites of 32 px or less get their own takes. |
| Strict hierarchy | Units (heroes, creature stacks) > towns > map objects (mines, pickups, dwellings) > trees and rocks > ground. Created by contrast, lightness and black outlines, not saturation alone. |
| Outlines | Units: single-colour black. Towns and buildings: a thin outline in a darker tone of each colour. Terrain pieces: black outer silhouette, inner outlines softened. Ground: none. |
| One light | Sun at the bottom left, stated in every prompt. **Never mirror a sprite** for a variant: it would be lit from the wrong side. |
| Nothing under a piece | No pedestal, disc, slab or ground plate. PixelLab adds an isometric slab under buildings, trees and rocks: plan a "remove all ground" edit, and list plate words in the exclusions. |
| Ground is calm | Few, discrete things on a quiet base; luma spread under about 3% (9% for grounds of separate tufts); tall tufts 16-24 px clear of the cell centre where pieces stand. |
| Colours as hex | Give every faction colour as hex with a shadow tone; colour words drift. Faction fragments name era, materials, colours and motifs only, never figures or buildings. |
| Faction readability | A light or saturated dominant material, one signature accent, a full value range; roles differ by body mass, mount, posture and headgear, never a thin prop. Silhouette test at the smallest zoom. |
| Edits over re-rolls | Restyle an accepted sprite with `edit-image-pixen`; one named part per edit; edits cannot move or enlarge. |
| No blur | No gradients or blur anywhere on the map; transitions are hard pixel steps drawn in code. |
| Chrome only with news | Stack counts and HP only where they carry information; no glows or always-on badges. |
| Reproducible, reviewed | Every request a recipe; every take kept; sample 3, review at native size and enlarged on light and dark, then batch ([PIPELINE.md](PIPELINE.md)). |

## 3. Geometry and resolution

| Class | Canvas (px, zoom 1) | Placement |
| --- | --- | --- |
| Map cell | 80 x 80 | Square grid; zoom steps 0.75, 1, 1.5, 2 |
| Ground | 80 x 80 per cell, from a periodic texture of 6-8 cells | Drawn at map coordinates modulo the period |
| Standard creature / hero | 56 x 80 | Bottom-centred |
| Large (mounted hero, Triceratops) | up to 72 x 88 | Bottom-centred, at most 4 px side overflow |
| Giant (T-Rex) | up to 88 x 104 | Bottom-centred, upward overflow allowed |
| Town | 80 x 80 to 96 x 88 per cell of its footprint | Bottom-centred; multi-cell towns are a design follow-up |
| Mine, dwelling | 64-72 px wide | Seated 3 px above the cell bottom |
| Pickup (resource, chest) | 40 x 40 to 48 x 48 | Centred; smaller and calmer than any creature |
| Mountain piece | 1 or 2 cells wide; low up to 13 px, tall up to 48 px above its footprint | Bricked rows, ragged foot |
| Forest piece | cols x 80 by rows x 80 + 24 | Paints only over its footprint and a 24 px band above |
| Resource icon (UI) | 32 x 32, generated at that size | HUD |

PixelLab Pixen sizes are multiples of 4; descriptions are capped at 2000
characters including all fragments.

Battle screen: the same creature sprites on a hex field whose ground is the
battle's terrain texture. Battle backgrounds beyond that are a later class.

## 4. The adventure map

The target is the Heroes of Might and Magic II adventure map: one continuous
natural landscape. The square grid exists for rules only.

Goals (each is a review check on a captured map at zoom 0.75 and 1):

1. **No visible grid.** No grid lines; cell outlines appear only for the
   hover cell and the planned path.
2. **No straight terrain borders.** Every boundary between two grounds is
   the ranked spill (an irregular strip about 10 px wide, blobs at corners,
   loose specks), its width a sum of waves over world pixels with a period
   of three cells, so no edge repeats along a long border. Rank, lowest
   first: Grass, Steppe, Jungle, Badlands, Wasteland (darker runs into
   lighter).
3. **Every mountain range looks unique.** Ranges are composed from one- and
   two-cell pieces, bricked row by row, low on the top row and tall under
   other mountains, with a ragged foot showing the cell's own ground. Beyond
   Pulp Wars: a larger piece set, and **no two neighbouring pieces share a
   variant** (horizontal or vertical). The generator gives ranges organic
   outlines (ridges, spurs, passes), never rectangles or round blobs.
4. **Forests look grown, not stamped.** Fixed 2 x 2 block packing with the
   exact-cover piece set, seam clumps, a ragged shade veil and the softening
   pass; the clump set follows the ground (see the mapping below). Single
   trees and small groves break open ground.
5. **Coasts and water as code.** A thin, uneven sand line where land meets
   water; shallow against deep as a wandering edge plus a half-depth shelf.
6. **Roads are dirt tracks drawn in code**, passing under trees and rocks;
   diagonal runs read as smooth curves, not staircases.
7. **Large-scale variation.** Grounds use soft drifts (a smooth periodic
   field, three palettes, single-pixel dithered edges) so a big region is
   not one flat colour; decorations (flowers, bones, puddles, small rocks)
   are strewn by a seeded roll and kept away from cell centres.
8. **Deterministic and local.** Every choice is a hash of coordinates and
   the map seed; changing one cell re-picks at most its own block or run.
   Multi-cell art at the fog's edge is packed for the whole map and clipped
   to explored cells, so nothing changes shape as the player explores.
9. **Draw order**: ground, spill, coast, road, then tall pieces and pieces
   row by row (the front row's overflow covers the feet of the row behind),
   then fog.

## 5. Terrain mapping (MVP)

Grounds reuse the Pulp Wars textured grounds; their faction associations
carry over as the neutral meaning of each terrain here.

| Terrain | Look | Pulp Wars source ground | Base colour | Forest clump set on it | Move cost |
| --- | --- | --- | --- | --- | ---: |
| Grass | Neutral grass, faint mottle and tufts | default Grass (Humans) | `#8ab85c` | default trees | 100 |
| Jungle | Lost World ground: darker bluer green, moss, litter | Dinosaurs | `#63a35b` | jungle | 150 (100 native) |
| Steppe | Goblin dry grass: straw drifts, tufts, seed heads | Goblins | `#d3c176` | scrub | 100 |
| Badlands | Martian red regolith with shaded rocks | Martians | `#b56c46` | alien fungus | 125 |
| Wasteland | Undead ash after a wildfire: twigs, embers | Undead | `#716a64` | dead wood | 150 |
| Shallow water | Flat light turquoise, a few ripples | Shallow water | about `#8fd3dc` | - | impassable |
| Deep water | Same, deep blue | Deep water | about `#4277a5` | - | impassable |
| Mountains | Warm grey rock, cream snow, slate outline, ragged foot over the cell's ground | Massif pieces | rock restyle per the lessons | - | impassable |
| Forest | Clump pieces over the cell's ground | Faction forests | per ground | - | impassable |
| Road | Code-painted dirt track | Dirt road | - | - | 75 |

Move costs are canonical in
[GAME_DESIGN.md](../design/GAME_DESIGN.md#71-grid-and-movement).

## 6. Reused Pulp Wars sprites

The user allowed reusing Pulp Wars sprites. The current-direction creature
sprites are in `/Users/nadbor/projects/pulp_wars/public/assets/chibi/units/`
(files `chibi-direction-<faction>-<unit>.png`).

| border_marches creature | Pulp Wars sprite |
| --- | --- |
| Caveman, Spitter, Raptor, Shaman, Triceratops, T-Rex | `chibi-direction-dinosaur-{caveman,spitter,raptor,shaman,triceratops,t-rex}.png` |
| Goblin, Bomb Chucker, Wolf Rider, Orc Brute, Troll, Ogre, Orc Warboss | `chibi-direction-goblin-{goblin,bomb-chucker,wolf-rider,orc-brute,troll,ogre,orc-warboss}.png` |
| Skeleton | `chibi-direction-undead-skeleton.png` |

Rules for reuse:

- Import byte-identical, with the source path and SHA-256 recorded next to
  the asset (for example in `docs/art/ASSET_INVENTORY.md` once it exists);
  never regenerate or repaint an imported sprite outside the
  pipeline. The pipeline has no import command yet (follow-up).
- Pulp Wars `.mask.png` owner masks are not used: factions are unique, and
  owner colour shows only in the interface.
- Grounds, mountain pieces and forest clumps may also be reused, under the
  same import rule; the code that composes them (packing, spill, coast) is
  rewritten here from the lessons, not copied.

## 7. Open questions

- **Battle facing.** All sprites face south-east (right). Defenders stand on
  the right and should face left, but mirroring breaks the light rule.
  Proposal: generate south-west-facing takes for the neutral creatures (the
  only defenders in the MVP) with the sun still at the bottom left; until
  then every creature faces right.
- Multi-cell towns (the Lost World town, the Warlord's Hold) and their entry
  cell.
- The Chieftain-on-raptor hero sprite and the mine and pickup art are new
  sets (bead `border_marches-xaj.9`).

## 8. Decisions

| Date | Decision | Evidence |
| ---- | -------- | -------- |
| 2026-11-15 | Inherit the Pulp Wars Bold chibi direction (80 px cells, art at display size, black-outlined saturated units over calm textured ground, sun bottom left, never mirror, nothing under pieces, strict hierarchy) | User request: reuse Pulp Wars sprites and lessons; Pulp Wars user approvals 2026-09-29 and 2026-10-05 |
| 2026-11-15 | Adventure map target: Heroes II-like continuous landscape (section 4) and the MVP terrain mapping (section 5) | User request: "no copypaste patterns", unique-looking mountain ranges |
