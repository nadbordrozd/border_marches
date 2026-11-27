# Towns asset contract

Status: draft (2026-11-24, bead `border_marches-bzc.15`; orchestrator call).
Map towns redrawn cute and chunky on 2026-11-26 (bead `border_marches-bzc.97`,
see [Map town direction](#map-town-direction-bzc97)); town-screen buildings
redrawn in the same style on 2026-11-26 (bead `border_marches-bzc.98`, see
[Town-screen buildings](#town-screen-buildings-bzc98)); the Candy Kingdom's
town art added in the same style on 2026-11-27 (bead `border_marches-bzc.114`,
see [Candy Kingdom town art](#candy-kingdom-town-art-bzc114)). Specialises
[`../ART_DIRECTION.md`](../ART_DIRECTION.md) for the faction towns: their
map sprites and their town-screen art (building sprites and backdrops).

## Map town direction (bzc.97)

The user found the first map towns "primitive and not cute": thin rings of
wall round a transparent yard with a few small flat houses. They liked the
creatures, forests, mountains and the wood pile, chest, well, roadside inn
and toppled statue. The map towns now follow those:

- **A dense, tall cluster, not a ring.** One big central landmark rises
  highest at the back centre (the Realm's blue-coned keep, the Restless'
  crooked cathedral, the Horde's tin boss hall or hide tent, the Lost
  World's thatched longhouse); smaller buildings are packed round it and
  overlap; no empty yard, no thin ring wall. A short, thick front wall or
  fence carries a big gate at the bottom centre, over the entry cell.
- **The liked objects' style.** Thick black outline, big rounded toy-like
  shapes, saturated flat colours with one shadow tone, low detail, the same
  slightly-from-above front view and the sun at the bottom left. The style
  image is the roadside inn (`art/masters/map-objects/inn-a-0.png`).
- **Faction at a glance.** Faction colours on the roofs (blue cones, violet
  slate, hazard yellow, tawny thatch) and one signature gate (twin-towered
  gatehouse, iron gate between lantern pillars, horned ox skull, dinosaur
  skull jaws).
- **Two stages read apart.** The camp stage (fort 0-1) is lower and has a
  fence and a smaller landmark (a chapel, a hide tent); the fort stage
  (fort 2-3) has the stone wall and the big keep or hall. A camp take that
  copies its fort's landmark is rejected (realm-camp-a, restless-camp-a).
- **Level towns** (the Lost World and goblin cities 1-3 and the neutral
  village, drawn for towns that are not 3x2 or not grown yet) use the same
  class layer at their own canvas, the family's accepted 3x2 town as style
  image with its palette.

Studio set `art/sets/chunky-towns` (class fragment
`art/fragments/class-map-town.txt`). The sets `faction-towns` and
`towns-3x2` keep their history and masters but no longer derive game files.

## Town-screen buildings (bzc.98)

The first building sprites (set `town-buildings`, bzc.15) were thin
isometric boxes floating small in their 64 px tile with thin outlines: the
same "primitive and not cute" look the user rejected on the map. They are
redrawn in the map towns' style:

- **One chunky toy building per tile.** A single building in three-quarter
  view from slightly above (front, one side, roof), fat and rounded, thick
  dark outline, flat colours with one shadow tone, filling most of the 64 px
  tile; one oversized signature feature (dragon skull, horned skull, giant
  bone, tankard sign, clock tower, glowing windows).
- **The faction's map town as style image.** The accepted chunky fort town
  of the faction (`chunky-towns/{realm,restless,horde}-fort-s1`) gives the
  palette, outline and pixel size, so the hall tiles and the town picture
  above them read as one place.
- **Families grow.** Village, Town and City Hall are one building growing
  (the Realm's half-timbered hall gains a clock tower, then a blue dome; the
  Restless' slate hall gains its clock tower, then spires; the Horde's tin
  shack gains a storey, then a horned dome), and the fort buildings likewise
  (Realm: stake palisade, round blue-coned keep, the same keep inside a small
  castle; Restless: lantern-post railings, a slate wall with a lych-gate, a
  gate between two violet-coned towers; Horde: a stake row, a tin wall
  between stake bundles, a squat skull tower). A bigger stage is generated
  with the accepted smaller one as a reference image ("the same building,
  grown") where they share a body (the halls, the Royal Castle), or in one
  call with the family when they do not (the walls).
- **Taller things are stout.** Towers on legs came out spindly with thin
  brown outlines (`horde-s1` skull towers): describe them as fat, squat, on
  thick stilts.
- **One palette per faction.** A trial with the roadside inn as style image
  (`realm-inn-s1`) gave warmer reds and lit windows, but off the Realm map
  town's red-brown and the accepted hall family; it is recorded as an option
  for a later pass, not used.

Studio set `art/sets/chunky-buildings` (class fragment
`art/fragments/class-screen-building.txt`); `town-buildings` keeps its
history and masters but no longer derives game files. The backdrops
(`town-backdrops`) already match the style (thick outlines, flat colours)
and are kept.

## Candy Kingdom town art (bzc.114)

The fourth faction ([FACTION_CANDY.md](../../design/FACTION_CANDY.md#10-art))
follows the two sections above with no new rule; its calls:

- **Map towns.** Fort stage (`candy-palace-3x2`): a tall iced tiered-cake
  palace with a pink-roofed cuckoo-clock tower and two sugar-glass turrets,
  gingerbread cottages with pink roofs and mint shutters packed round it, a
  thick gingerbread wall with icing battlements and the gate of two crossed
  candy canes between two lollipops. Camp stage (`candy-hamlet-3x2`): a fat
  gingerbread cottage with an icing-dripped pink roof and a gumdrop chimney
  among pink- and mint-roofed sweet-shop cottages behind a candy-cane fence
  with the crossed-cane gate; no clock, no palace (written out with the
  negatives `palace, clock, tower, cake, stone wall`). Both first takes, style
  image the roadside inn as for the other towns.
- **Backdrop.** The native snow drawn as icing: a pale pink sky fading to
  mint, pink and mint gumdrop hills and a tiny sugar-glass castle on the
  horizon, icing-white ground with faint pink shadows and sprinkles, a pink
  frosting path, lollipop trees, candy canes and iced gingerbread mounds at
  the edges; style image the accepted Candy fort town.
- **Buildings.** Style image the Candy fort town (`@candy`). The halls are
  one gingerbread layer cake growing (two tiers; three tiers with a
  cuckoo-clock gable; three wide tiers under a pink frosting dome with a
  cherry), the grown stages with the village hall as reference image. A
  pink-and-cream cake village hall (`candy-s1#0`) was accepted first and then
  replaced by the gingerbread one (`candy-s1#1`) because the grown halls came
  out in gingerbread. The fort family grows from a candy-cane fence to a
  crenellated gingerbread wall to a sugar-glass keep inside that wall.
  Re-rolled once (`candy-reroll-a`, negative `slab`): the first fence takes
  were a thin zigzag of canes (asked again as a ring of canes with the
  crossed-cane arch), every first oven and press stood on a gingerbread
  slab, and the first Four O'Clock was a thin grandfather clock. A gummy
  den with teeth was rejected: nothing in the art eats anyone.
  Two buildings must not share a silhouette: cakes (halls), a cottage
  (Gingerbread House), a macaron spire (Magic Guild), a clock tower (the Four
  O'Clock). Negatives `purple, violet`: sugarplum purple stays on the
  creature, so the town never reads as the Restless.
- **Lookups.** The faction id `candy` (and the name `candy-kingdom`) is
  registered in `townArt`, `buildingArt` and `townBackdrop`; its building
  ids are FACTION_CANDY.md section 9 in kebab case, `the-four-oclock` the
  Keystone Hall, `candy-cane-fence`, `gingerbread-wall` and
  `sugar-glass-keep` fort 1-3.

## Inventory

| Asset | Size (px) | Studio set | Game file | Lookup |
| --- | --- | --- | --- | --- |
| Map town, camp stage (fort 0-1) | 240 x 184 | `chunky-towns` | `public/assets/towns/{realm-village,restless-graveyard,horde-warcamp,candy-hamlet}-3x2.png` | `townArt(faction, fortLevel)` |
| Map town, fort stage (fort 2-3) | 240 x 184 | `chunky-towns` | `public/assets/towns/{realm-castle,restless-churchyard,candy-palace}-3x2.png`, `goblin-hold-3x2.png` | `townArt(faction, fortLevel)` |
| Lost World town, 3x2 | 240 x 184 | `chunky-towns` | `public/assets/towns/dinosaur-town-3x2.png` | `town3x2Asset(obj)` |
| Level towns (Lost World, goblin; levels 1-3), neutral village | 88 x 96, 96 x 100, 96 x 104; 72 x 72 | `chunky-towns` | `public/assets/towns/{dinosaur,goblin}-city-{1,2,3}.png`, `village.png` | `townAsset(obj)`, the Lost World town screen |
| Building sprite, one per building of each tree (22 x 4) | 64 x 64 | `chunky-buildings` | `public/assets/towns/buildings/<faction>/<building>.png` | `buildingArt(faction, building)` |
| Town-screen backdrop, one per faction | 256 x 224 (shown x2) | `town-backdrops` | `public/assets/towns/backdrops/<faction>.png` | `townBackdrop(faction)` |

The lookups are in `src/assets/town-art.ts`; the data lists (building ids per
faction, fort and Keystone buildings) are in `src/assets/town-buildings.ts`.
The Horde's fort stage is the accepted Warlord's Hold (`towns-3x2`): its tin
wall is the Scrap Wall and its watchtower the Skull Tower.

Building ids are the faction documents' names (section 9 of
`docs/design/FACTION_*.md`) in kebab case without apostrophes
("Squires' Hall" is `squires-hall`). The Magic Guild levels share one sprite
(`magic-guild`); `fort-1` to `fort-3` and `keystone-hall` are accepted as
role aliases.

## Faction looks

| Faction | Materials and colours | Map town, camp / fort |
| --- | --- | --- |
| Realm (`humans`) | cream limestone `#e6d8b4` / `#b3a07a`, white plaster with dark timbers, tabard blue `#2f6fd0` / `#1f4a8f` and red-brown `#a8492f` roofs | a white chapel with a blue steeple among packed red-roofed cottages behind a plank fence and a little blue-roofed gate / a fat blue-coned keep among packed timber houses behind a thick crenellated wall with a twin-towered gatehouse |
| Restless (`undead`) | slate `#5b5866` / `#3a3842`, shroud violet `#7a4fb5` / `#4e2f7a` roofs, bone white `#d8d0bc`, black iron; spooky-cute, never gory | a little violet-roofed chapel among crypts, a gravedigger's cottage and tombstones behind iron railings / a tall crooked slate cathedral with a manor and a bone-white domed mausoleum behind a slate wall with a black iron gate |
| Horde (`goblins`) | riveted tin `#b8bcc0` / `#7d8288`, hazard yellow `#f2c230` roofs, sharpened logs `#b8733a`, tawny spotted hide | a big spotted hide tent among yellow-roofed tin shacks behind a stake fence with a horned-skull gate / the Warlord's Hold: a tall tin boss hall and a lookout tower behind a stake wall |
| Candy Kingdom (`candy`) | gingerbread `#b86b34` / `#7d4420`, royal icing `#fff4ec`, strawberry pink `#e2589b` / `#a8336c` roofs, candy-cane red `#e03a3e` and white stripes, mint `#7fd6b5`, sugar glass `#8fe3e8`; no purple | a fat gingerbread cottage with an icing-dripped pink roof among sweet-shop cottages behind a candy-cane fence with a crossed-cane gate / a tiered-cake palace with a cuckoo-clock tower and sugar-glass turrets behind a gingerbread wall with the crossed-cane gate between lollipops |
| Lost World (`lost-world`) | tawny thatch, tawny hide with dark brown spots, cream bone, red-orange paint, basalt | one 3x2 stage: a huge thatched longhouse among plump huts behind a log fence with a dinosaur-skull gate; levels 1-3 grow from three huts round a totem |

## Geometry

- **Map towns**: generated at 232 x 176, cropped to their opaque rows and
  seated in the 240 x 184 canvas of the 3x2 footprint (bottom 160 rows the
  footprint, 24 rows rising into the row behind), lowest opaque row 4 px
  above the canvas bottom; measured boxes in `TOWN_3X2_ASSETS`. The take is
  kept at its full width (4 px pad each side) so the gate, drawn in the
  image's middle, stays over the entry cell. Gaps between buildings are
  transparent; there is no yard to show.
- **Level towns**: generated at their canvas size and used as generated
  (no crop); the ground line (`TownAsset.ground`) is measured from the
  opaque pixels of the bottom rows.
- **Shadows**: never baked. The renderer gives every town the shared ground
  shadow (`groundShadows` in `src/render/map/scene.ts`).
- **Building sprites**: generated at 64 x 64, cropped to the building (stray
  specks under 8 px dropped as recorded pixel edits), seated bottom-centred
  2 px above the bottom of a 64 x 64 canvas (less when the building fills 63
  or 64 rows), so every building stands on one baseline in a row or a
  composed town picture. Never scaled.
- **Backdrops**: generated opaque at 256 x 232, cropped to rows 4-227 (the
  provider framed two of them with white rows) to 256 x 224, drawn at x2
  (512 x 448) behind the town
  picture; the sky and horizon fill the top quarter, the native ground
  (grass, wasteland, badlands, icing snow) the rest, with scenery only at
  the edges.

## Readability

- Map towns sit between units and map objects in the hierarchy: chunky,
  black-outlined, the faction colour on the roofs; reviewed on their native
  ground next to the Lost World town
  (`.orchestration/screens/bzc15/poster-map-towns.png` in the bead's
  worktree).
- Building sprites must read at 64 px on the dark wood UI and on light:
  each building gets one signature prop (shield and dummy, dragon head,
  coffin, horned skull, starry cone) and the roofs carry the faction colour.
  Two buildings of one faction must not share a silhouette (the Wailing
  Tower is gabled so it does not read as the Magic Guild's cone).
- No flags or banners anywhere: owner colour belongs to the interface.

## Recipe

- `generate-image-v2`, no background, a style image from the faction's
  accepted map town ("copy the palette, outline thickness, shading and pixel
  size only"). For the first map towns the Lost World town gave the layout
  ("round walled town with its gate in the middle of the front wall") with
  `color_palette: false`; a faction's second stage copies its first.
- Map towns (bzc.97): layers `style`, `light-south-west`, `class-map-town`,
  subject; style image the roadside inn with `color_palette: false` (colours
  as hex in the subject); a camp stage written without its fort's landmark
  and, when the fort's take as style image copied the layout, the inn
  again. One candidate per call at 232 x 176; four at the level towns'
  sizes. The first map towns (bzc.15) used `camera-three-quarter` and the
  Lost World ring as layout.
- Building sprites (bzc.98, set `chunky-buildings`): layers `style`,
  `light-south-west`, `class-screen-building`, subject "each image a
  different one of these N ..., four takes of each in this order: Name
  (description); ..." and the faction's colours as hex; style image the
  faction's chunky fort town with `color_palette: true`. At 64 x 64 one call
  returns 16 candidates that follow the list in order: 4 buildings per call
  give 4 takes each (2 give 8, 5 give 3). A grown stage (Town and City Hall,
  Royal Castle) adds the accepted smaller stage as a reference image. Each
  accepted take's verdict starts with the building id it shows; `outputs[]`
  maps it to its file. The bzc.15 sprites used `class-town-building`, the
  thin-ring map towns as style image and 6-8 buildings per call.
- Backdrops: layers `style`, `light-south-west`, `class-town-backdrop`,
  subject with the faction's ground hex, sky, horizon and edge scenery.
- Descriptions are capped at 2000 characters: the icon recipes drop the
  camera fragment (the class fragment carries the view) and keep each
  building to about 90 characters.

What did not work: subjects without a forced order give duplicates;
"garden" and "plot" words bring grass plates; a skull as a sign reads as
undead on any faction.

## Acceptance

Beyond the shared checks: map towns keep the gate centred over the entry
cell, a central landmark and a dense cluster (no ring of wall round an
empty yard), and the camp stage must not read as a copy of the fort stage;
building sprites have nothing under them (no
grass plot, skirt or slab), no specks after cropping, and one building per
sprite; every building of every tree has a sprite (`tests/assets/town-art.test.ts`).
