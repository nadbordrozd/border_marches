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

In prompts this paragraph is split into the Pulp Wars layers that produced
the imported sprites (bead `border_marches-xaj.9`): `art/fragments/style.txt`
holds the Pulp Wars style layer verbatim, and the camera, light and class
fragments carry the view, the sun and the outline rules; see
[MVP_NEW_ART.md](MVP_NEW_ART.md#prompt-layers).

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
| Mountain piece | 2 or 3 cells wide, sandstone tablelands 4 or 5 (1x1 only as decoration); 1 to 3 rows; low up to 13 px, tall up to 48 px above its footprint | Bricked rows, ragged foot; the smallest mountain is 2x2 |
| Peak (mountain crowd, current default; replaces the mountain pieces on the map) | foothills from 56 x 44, peaks from 80 x 64, summits from 120 x 88, massifs (two or three joined summits, laid first) from 160 x 112, generated at that size | Bottom-centred on its foot; rises at most 40 px above the range's northern cells ([classes/mountains.md](classes/mountains.md)) |
| Tree (forest canopy) | about 14-43 x 25-44, generated at that size | Bottom-centred on its trunk; a crown rises at most 40 px above the wood's northern cells ([classes/trees.md](classes/trees.md)) |
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
3. **Every mountain range looks unique.** Ranges are composed from pieces two and
   three cells wide (the smallest mountain is 2x2), bricked row by row, low on the top row and tall under
   other mountains, with a ragged foot showing the cell's own ground. Beyond
   Pulp Wars: a larger piece set, and **no two neighbouring pieces share a
   variant** (horizontal or vertical). The generator gives ranges organic
   outlines (ridges, spurs, passes), never rectangles or round blobs.
4. **Forests look grown, not stamped.** A wood is one dense canopy of small
   single trees (bead xaj.26, `src/render/map/canopy.ts`): blue-noise trunks
   sampled at world coordinates, y-sorted so crowns overlap, an outline
   wobbled off the grid, a darker tint under the trees, a few decorative
   trees spilling onto free ground (never roads, objects or entrances), and
   a species mix per ground (see the mapping below). The same trees stand
   alone on open ground.
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

| Terrain | Look | Pulp Wars source ground | Base colour | Forest trees on it | Move cost |
| --- | --- | --- | --- | --- | ---: |
| Grass | Neutral grass, faint mottle and tufts | default Grass (Humans) | `#8ab85c` | conifers, deep green broadleaf, autumn orange and yellow | 100 |
| Jungle | Lost World ground: darker bluer green, moss, litter | Dinosaurs | `#63a35b` | broadleaf, palms, banana | 150 (100 native) |
| Steppe | Goblin dry grass: straw drifts, tufts, seed heads | Goblins | `#d3c176` | olive oaks, birches, wind-bent elms | 100 |
| Badlands | Martian red regolith with shaded rocks | Martians | `#b56c46` | junipers, mesquite, gnarled scrub | 125 |
| Wasteland | Undead ash after a wildfire: twigs, embers | Undead | `#716a64` | dead oaks, burnt pines, snags | 150 |
| Volcanic | Calm dark basalt with sparse glowing lava cracks whose glow pulses ([classes/grounds.md](classes/grounds.md)) | none: studio set `grounds-volcanic` | `#3f343d` | the wasteland's (dead oaks, burnt pines, snags) | 150 |
| Sand (desert) | Calm golden dunes with soft diagonal wind ripples ([classes/grounds.md](classes/grounds.md)) | none: studio set `grounds-sand` | `#dcb46c` | its own (bead bzc.88): date and fan palms, saguaros, column, prickly pear and barrel cacti; its peaks are golden sandstone mesas and spires | 125 |
| Frosting (candy) | Calm pale strawberry icing with wavy cream palette-knife lines flecked with sugar; white sugar sparkles twinkle on it ([classes/grounds.md](classes/grounds.md)) | none: studio set `grounds-frosting` | `#f2c4d4` | its own (bead bzc.115): frosted trees on gingerbread trunks, cotton candy, lollipops, gumdrop bushes, candy canes in drifts; its peaks are strawberry gumdrop hills and rock-candy crags under poured icing | 125 (100 native) |
| Shallow water | Flat light turquoise, a few ripples | Shallow water | about `#8fd3dc` | - | impassable |
| Deep water | Same, deep blue | Deep water | about `#4277a5` | - | impassable |
| Mountains | A crowd of front-view peaks, one family per ground ([classes/mountains.md](classes/mountains.md)) | New `peaks` set (the imported massif pieces only as battle rocks) | per ground | - | impassable |
| Forest | A canopy of small trees over the cell's ground | New `trees` set | per ground | - | impassable |
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
| v0.2 Realm, Restless and stray reuses (Longbowman, Man-at-Arms, Knight, Ghoul, Banshee, Gravecaller, Gremlin, Bog Leech, Lagoon Lurker, Winder, Rigger, Tin Titan, Rime Walrus) | see [V02_UNIT_ART.md](V02_UNIT_ART.md) |

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
- Multi-cell towns: done at 3x2 (beads xaj.14, xaj.19); the entry cell is
  the middle of the front row, under the gate.
- The Chieftain-on-raptor hero sprite and the mine and pickup art are new
  sets (bead `border_marches-xaj.9`): done, see
  [MVP_NEW_ART.md](MVP_NEW_ART.md).

## 8. Decisions

| Date | Decision | Evidence |
| ---- | -------- | -------- |
| 2026-11-15 | Inherit the Pulp Wars Bold chibi direction (80 px cells, art at display size, black-outlined saturated units over calm textured ground, sun bottom left, never mirror, nothing under pieces, strict hierarchy) | User request: reuse Pulp Wars sprites and lessons; Pulp Wars user approvals 2026-09-29 and 2026-10-05 |
| 2026-11-15 | Adventure map target: Heroes II-like continuous landscape (section 4) and the MVP terrain mapping (section 5) | User request: "no copypaste patterns", unique-looking mountain ranges |
| 2026-11-15 | **Retired 2026-11-25** (bead `border_marches-xaj.29`: the massif renderer, its sets and derived files were removed; mountains are peaks, see 2026-11-22). Mountain rock follows the ground: grey granite on grass and jungle, sandstone mesas on steppe and badlands, dark basalt with ash on wasteland; ranges are built from 2x2/3x2 massifs, 2x1/3x1 ridges and 1x1 crags, rounded humps and foothills; 3x2 towns at 240 x 184; 4-6 doodads per terrain (not wired yet) | Bead `border_marches-xaj.14`, [MASSIF_ART.md](MASSIF_ART.md) |
| 2026-11-15 | **Retired 2026-11-25** (bead `border_marches-xaj.29`: the massif renderer, its sets and derived files were removed; mountains are peaks, see 2026-11-22). Massif set iteration 4: sandstone massifs beyond tower buttes (fluted hills, striped domes, hoodoo clusters, table mesas), 1x1 peaks and 1x2 north-south spines per palette, rounded granite boulders instead of stair-like blocks, a scree-skirted basalt massif, the Warlord's Hold at the Lost World town's scale with its gate centred on the entry cell; ranges change rock only at low seams | Bead `border_marches-xaj.19`, [MASSIF_ART.md](MASSIF_ART.md#iteration-4-bead-xaj19) |
| 2026-11-15 | **Retired in part 2026-11-25** (bead `border_marches-xaj.29`: the massif pieces are gone; the generator's 2x2 rule stands). The smallest mountain is 2x2 tiles: the generator puts every Mountain cell in an all-Mountain 2x2 block, and ranges are built from 2x2, 3x2 and tall 2x3 massifs, 2x1/3x1 ridges and low humps; 1x1 peaks and rubble are decoration only; north-south bands run summit, saddle, summit | User (2026-11-15): "it is acceptable if the smallest mountain is 2x2 tiles"; bead `border_marches-xaj.20`, [MASSIF_ART.md](MASSIF_ART.md#iteration-5-bead-xaj20) |
| 2026-11-15 | **Retired in part 2026-11-25** (bead `border_marches-xaj.29`: the scree, rock base, plateaus and granite pieces are gone; the zone-border warp and the wobble pass stand). No straight edges and silhouette scree: zone borders get a fine warp and a wobble pass breaks every range or ground edge straighter than 3 cells (2x2 rule and seals kept); the scree and rock base follow the placed pieces' silhouettes, not the cells; big badlands fill with flat-topped plateaus (new kind `plateau`, 2x2/3x2/3x3) and keep landmark buttes for their edges; snowless granite (domes, slabs, cliffs, forested shoulders); a second 2x3 per palette; long low sandstone benches on back rims | Bead `border_marches-xaj.21`, [MASSIF_ART.md](MASSIF_ART.md#iteration-6-bead-xaj21) |
| 2026-11-15 | **Retired 2026-11-25** (bead `border_marches-xaj.29`: the massif renderer, its sets and derived files were removed; mountains are peaks, see 2026-11-22). Tablelands and landmark spacing: wide sandstone tablelands (4x2, 5x2) whose outlines are composed from accepted pieces, cut at cell edges into pieces that join into one tableland; landmark sprites (and big pieces) at least 12 cells from another copy of themselves anywhere on the map; recoloured siblings by edits; snowless granite ridges; deep badlands and steppe clusters; a rubble rock base | Bead `border_marches-xaj.22`, [MASSIF_ART.md](MASSIF_ART.md#iteration-7-bead-xaj22) |
| 2026-11-15 | **Retired 2026-11-25** (bead `border_marches-xaj.29`: the massif renderer, its sets and derived files were removed; mountains are peaks, see 2026-11-22). Iteration 8: tableland joins only within one top tone and never with the caprock-patch take (retired); wide granite massifs (4x2, 5x2) from spliced and flattened outlines with a per-column rise rule; three-row sandstone tablelands (4x3, 5x3) and their cuts; banded sandstone edge ridges; calmer granite clutter, quieter siblings, softer rubble | Bead `border_marches-xaj.23`, [MASSIF_ART.md](MASSIF_ART.md#iteration-8-bead-xaj23) |
| 2026-11-16 | Forests are a dense canopy of small single trees (about 0.2-0.55 cell wide, crowns at most 40 px above the wood), blue noise at world coordinates, wobbled outline, under-canopy tint, limited spill, species per ground; the 2 x 2 block packing and seam clumps are retired from the adventure map (battle and town screens still use the imported clumps). Open ground: the mini-mesa and rock-pillar doodads are retired, the cattle skull, tumbleweed and tall straw clump made rarer, lone trees drawn at native size | User (2026-11-16): Heroes II reference, "blend seamlessly", no grid, low enough not to hide a unit; bead `border_marches-xaj.26`, [classes/trees.md](classes/trees.md) |
| 2026-11-22 | Mountains are a dense y-sorted crowd of small front-view peak sprites, built like the forest, in five families by ground (green mountains, jungle karst, steppe crags, badlands buttes, wasteland basalt); no blending between families; outlines softened to a dark tone of each family's rock. Replaces the code-drawn relief as the default | User (2026-11-22): relief mountains differ in pixel style and are seen from above; separate sprites per terrain are fine; bead `border_marches-xaj.30`, [classes/mountains.md](classes/mountains.md) |
| 2026-11-24 | Adventure-map objects (62 catalogue types): bold black-outlined sites in the imported sawmill's view and pixel size, generated at native size (1x1 on 64 px, pickups on 40 px, 2x2 on 128 px, the 3x2 vault on 200 x 144), cropped to their body, foot on the footprint's bottom centre; bank sizes, faction outposts, school temples and key colours as variants; school accent colours fixed | Bead `border_marches-bzc.16`, [classes/map-objects.md](classes/map-objects.md) |
| 2026-11-24 | v0.2 unit art: Realm units keep the Pulp Wars crimson and gold heraldry (faction colour `#2f6fd0` is interface only); every hero class rides its own mount (charger, unicorn, skeleton horse, donkey, war boar, goat); strays avoid the faction signatures; creature portraits are 1:1 crops of their sprites | Bead `border_marches-bzc.14`, [V02_UNIT_ART.md](V02_UNIT_ART.md) |
| 2026-11-24 | Named heroes get their own 48 px busts in their class costume, made distinct by face, hair, age and one accessory from name or specialty; the Orc Warboss is redrawn at the giant canvas (88 x 104) after the imported design | Bead `border_marches-bzc.29`, [V02_UNIT_ART.md](V02_UNIT_ART.md#named-heroes-bead-border_marches-bzc29) |
| 2026-11-24 | Content icons: 32 px symbols (16 px condition overlays as their own takes) for spells, artifacts, skills, feats, vows, conditions, ground, stats and school emblems; one concrete object per symbol, no text; frames drawn by code in school colours (Bloom green, Accord blue, Clock brass, Hush plum, Storm red) and grade colours, never baked | Bead `border_marches-bzc.17`, [classes/icons.md](classes/icons.md) |
| 2026-11-15 | Essence is violet (`#a855f7`, shadow `#6b21a8`, light `#e9d5ff`) on its pickup, mine and item; the ore pickup is dark charcoal iron with silver veins, not the imported copper ore | Bead `border_marches-xaj.9`: teal clashes with shallow water, copper with the Lost World accent ([MVP_NEW_ART.md](MVP_NEW_ART.md)) |
| 2026-11-24 | v0.2 faction towns: each faction town has a camp stage (fort 0-1) and a fort stage (fort 2-3) at the 3x2 footprint, the Horde's fort stage being the Warlord's Hold; town screens get a 64 px sprite per building of each tree and a native-ground backdrop per faction; faction colours on the roofs, no flags | Bead `border_marches-bzc.15`, [classes/towns.md](classes/towns.md) |
| 2026-11-25 | Purely decorative pieces: 24 passable details (critters, small plants, little ruins; at most 32 px, smaller than any pickup, never loot look-alikes) and 19 impassable props of one or two cells side by side (boulders, logs, ruins, skeletons; inside their row, seated like sites); new subjects only, never repeats of the doodads | User: "passable decorations on the grass e.g. a tiny butterfly, as well as impassable stuff like a big log"; bead `border_marches-bzc.48`, [classes/decorations.md](classes/decorations.md) |
| 2026-11-25 | The front-view peaks are the only mountain renderer: the massif sprite packer (`?mountains=sprites`, sets `massif-granite`, `massif-sandstone`, `massif-basalt`), the code-drawn relief (`?mountains=relief`), the ground's scree and rock base, their tests, masters, style refs and derived files are removed; their history stays in [MASSIF_ART.md](MASSIF_ART.md) and in git | User approved the peaks (bead `border_marches-xaj.30`); bead `border_marches-xaj.29`, [classes/mountains.md](classes/mountains.md#retired-renderers) |
| 2026-11-26 | Volcanic ground and animated terrain: a new ground, calm dark basalt (studio take `grounds-volcanic/base-b`) with sparse lava cracks laid over it at their own period (the hot pixels of take `pixen-a`, thinned and rimmed in code), darkest of the grounds so it spills over the rest; it borrows the wasteland's trees, peaks, doodads and forest set. Water glints, flapping butterflies and other living decorations, and the cracks' pulsing glow are overlays drawn a dozen times a second, never in the cached ground | User request (bead `border_marches-bzc.83`): shimmering water, butterflies flapping, slightly pulsating magma on volcanic ground; [classes/grounds.md](classes/grounds.md) |
| 2026-11-26 | Winter landscape: a calm blue-white snow ground (take `grounds-snow/base-e`) with its own art family: snow-laden spruces and darker firs, birches, golden larches in drifts; alpine snow-capped peaks; snow doodads; 8 winter decorations and 6 props; four winter sites in the map-object style. Snow drifts over every ground but the volcanic; battles on snow borrow the grass conifer clumps | User request (bead `border_marches-bzc.87`): a winter landscape with its own decorations and special buildings; [classes/grounds.md](classes/grounds.md) |
| 2026-11-26 | The desert: a new ground, calm golden dunes (studio take `grounds-sand/dunes-a`), ranked last so the older spill shapes stay; its own palm and cactus groves (set `desert-trees`) and golden sandstone mesas and spires (set `desert-peaks`), apart from the red badlands buttes; desert decorations and props (set `desert-decorations`: tumbleweed, scarab, ox skull, fennec, sand snake, buried statue head, broken column, giant ribcage...); four desert sites (set `desert-sites`: Pyramid, Sphinx, Sun Temple, Sunken Tomb) in the map-object style | User request (bead `border_marches-bzc.88`): a desert landscape with its own decorations and special buildings; [classes/grounds.md](classes/grounds.md) |
| 2026-11-26 | Spellbook school frames: each spell in the book sits on a parchment medallion in a 48 px ornate square frame of its school (Bloom vine with leaves, Accord riveted blue steel, Clock brass with cogs, Hush plum with silver moons, Storm red with lightning bolts), one PixelLab take per school; the gilded (mastery) frame is the same take with a gold fillet inside and a gold rim with an ink line outside, as recorded pixel edits. Shown at 2x around the 2x spell icon. This specialises the code-drawn icon frames for the spellbook only | User request (bead `border_marches-bzc.99`): the H3 spellbook, "the frame around each spell indicates that the hero has mastery"; [classes/icons.md](classes/icons.md#spellbook-frames-bead-border_marches-bzc99) |
| 2026-11-26 | Map towns are cute, chunky, dense clusters round one tall central landmark (keep, cathedral, tin hall or hide tent, thatched longhouse) with a short thick front wall and a big centred gate, in the style of the liked map objects (the roadside inn is the style image); no more thin wall rings round empty yards. Every 3x2 town, the level towns (Lost World and goblin cities 1-3, the neutral village) and the sawmill redrawn (set `chunky-towns`, take `map-objects/sawmill-c`). Ground shadows: one model for every standing piece, a contact ellipse that never shows in front of the foot plus a fainter cast ellipse to the north-east (away from the sun), drawn with a stepped soft edge before any sprite so a shadow never darkens a neighbour | User request (bead `border_marches-bzc.97`): towns "primitive and not cute", sawmill "mediocre", "the drop shadows on many things miss the mark completely"; [classes/towns.md](classes/towns.md#map-town-direction-bzc97) |
| 2026-11-26 | Town-screen buildings follow the chunky map towns: one fat, rounded toy building per 64 px tile, thick dark outline, one oversized signature feature, the faction's accepted chunky fort town as style image (its palette), filling the tile; hall and fort families drawn as one building growing (the bigger stage made with the smaller as reference). All 66 sprites redrawn (set `chunky-buildings`); ids, paths and the 64 x 64 canvas unchanged; backdrops kept | User request (bead `border_marches-bzc.98`): the castle buildings look "primitive and not cute"; [classes/towns.md](classes/towns.md#town-screen-buildings-bzc98) |
| 2026-11-27 | Mountain ranges are laid from as few, as large forms as fit: a fourth peak tier, the massif (two or three joined summits, about two cells wide), stands wholly on the range and is tried first; its lower slopes are its own ground's colours with no outline at the foot, so a range rises out of its plain as in Heroes II; smaller tiers fill what is left; the grass family's older tiers are toned toward the meadow green; the underlay is the ground in shade | User request (bead `border_marches-xaj.32`): ranges "less like a pile of individual rocks", blending "with their native terrain the way they do in Homam2"; [classes/mountains.md](classes/mountains.md) |
