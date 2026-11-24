# Towns asset contract

Status: draft (2026-11-24, bead `border_marches-bzc.15`; orchestrator call).
Specialises [`../ART_DIRECTION.md`](../ART_DIRECTION.md) for the faction
towns of v0.2 (the Realm, the Restless, the Goblin Horde): their 3x2 map
sprites and their town-screen art (building sprites and backdrops).

## Inventory

| Asset | Size (px) | Studio set | Game file | Lookup |
| --- | --- | --- | --- | --- |
| Map town, camp stage (fort 0-1) | 240 x 184 | `faction-towns` | `public/assets/towns/{realm-village,restless-graveyard,horde-warcamp}-3x2.png` | `townArt(faction, fortLevel)` |
| Map town, fort stage (fort 2-3) | 240 x 184 | `faction-towns`, `towns-3x2` | `public/assets/towns/{realm-castle,restless-churchyard}-3x2.png`, `goblin-hold-3x2.png` | `townArt(faction, fortLevel)` |
| Building sprite, one per building of each tree (22 x 3) | 64 x 64 | `town-buildings` | `public/assets/towns/buildings/<faction>/<building>.png` | `buildingArt(faction, building)` |
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
| Realm (`humans`) | cream limestone `#e6d8b4` / `#b3a07a`, white plaster with dark timbers, tabard blue `#2f6fd0` / `#1f4a8f` and red-brown `#a8492f` roofs | plank palisade village with a blue-roofed gatehouse / crenellated castle ring with blue-coned towers and a twin-towered gatehouse |
| Restless (`undead`) | slate `#5b5866` / `#3a3842`, shroud violet `#7a4fb5` / `#4e2f7a` roofs, bone white `#d8d0bc`, black iron; spooky-cute, never gory | iron-railed graveyard with an open grave / slate-walled churchyard with a black iron gate, chapel, manor and domed mausoleum |
| Horde (`goblins`) | riveted tin `#b8bcc0` / `#7d8288`, hazard yellow `#f2c230` roofs, sharpened logs `#b8733a`, tawny spotted hide | ring of stakes with a horned-skull gate / the Warlord's Hold |

## Geometry

- **Map towns**: generated at 232 x 176, cropped to their opaque rows and
  seated in the 240 x 184 canvas of the 3x2 footprint (bottom 160 rows the
  footprint, 24 rows rising into the row behind), lowest opaque row 4 px
  above the canvas bottom; measured boxes in `TOWN_3X2_ASSETS`. The gate is
  in the middle of the front wall, over the entry cell. Yards are
  transparent so the map ground shows through.
- **Building sprites**: generated at 64 x 64, cropped to the building (stray
  specks dropped), seated bottom-centred 2 px above the bottom of a 64 x 64
  canvas, so every building stands on one baseline in a row or a composed
  town picture. Never scaled.
- **Backdrops**: generated opaque at 256 x 232, cropped to rows 4-227 (the
  provider framed two of them with white rows) to 256 x 224, drawn at x2
  (512 x 448) behind the town
  picture; the sky and horizon fill the top quarter, the native ground
  (grass, wasteland, badlands) the rest, with scenery only at the edges.

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
- Map towns: layers `style`, `camera-three-quarter`, `light-south-west`,
  subject. One candidate per call.
- Building sprites: layers `style`, `light-south-west`,
  `class-town-building`, subject "each image a different one of these N
  ...: Name (description); ...". At 64 x 64 one call returns 16 candidates
  that follow the list in order, so 6-8 buildings per call give 2-3 takes
  each. Each accepted take's verdict starts with the building id it shows;
  `outputs[]` maps it to its file.
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
cell and a transparent yard; building sprites have nothing under them (no
grass plot, skirt or slab), no specks after cropping, and one building per
sprite; every building of every tree has a sprite (`tests/assets/town-art.test.ts`).
