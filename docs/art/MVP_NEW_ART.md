# MVP new art (bead `border_marches-xaj.9`)

The sprites the MVP needs that the imported Pulp Wars art
([IMPORTED_FROM_PULP_WARS.md](IMPORTED_FROM_PULP_WARS.md)) does not cover,
made with the studio pipeline ([PIPELINE.md](PIPELINE.md)) in the inherited
Bold chibi direction ([ART_DIRECTION.md](ART_DIRECTION.md)).

Review sheet of the accepted art: [`sheets/mvp-new-art.png`](sheets/mvp-new-art.png)
(each game file at 1:1 and x3 on light, dark, and cut-outs of the jungle and
grass ground textures). It is rebuilt with:

```sh
node art/review/ground-sheet.mjs docs/art/sheets/mvp-new-art.png \
  dinosaur-chieftain=public/assets/units/dinosaur-chieftain.png ...
```

## Decisions per item: new or reused

The imported objects were reviewed at 1:1 and x3 on light and dark
([`sheets/imported.png`](sheets/imported.png) and a closer sheet of
`public/assets/objects/` and the mined mountain).

| Need | Verdict | Asset (manifest key) | Why |
| --- | --- | --- | --- |
| Hero: Chieftain on a raptor, 72 x 88 | **new** | `dinosaur-chieftain` (`HERO_ASSETS`) | No mounted Lost World figure exists. |
| Hero portrait, 48 x 48 | **new** | `portrait-dinosaur-chieftain` | Follows the hero. |
| Wood pickup | **new** | `wood-pile` | Nothing imported (lumber camps are buildings). |
| Ore pickup | **new** | `ore-pile` | The imported `ore` is copper-orange, too close to the Lost World red-orange accent; the new pile is dark charcoal iron with silver veins. `ore` stays in the manifest. |
| Gold pickup | **new** | `gold-pile` | Nothing imported (the treasure chest is a different pickup). |
| Essence pickup | **new** | `essence-crystals` | Nothing imported. |
| Treasure chest | **reused** | `treasure` (`TREASURE_PICKUP`) | Reads clearly as an open chest of coins at 40 px. |
| Sawmill (wood mine) | **reused** | `sawmill` | A sawmill with a saw blade and log pile; bold outlined like the rest. |
| Ore pit | **reused** | `mountain-mine-a` (mountain piece) | The mined mountain, as the bead allows. |
| Gold mine | **reused** | `gold-claim` | A timbered mine mouth in a boulder with a cart of gold nuggets: reads as a gold mine. |
| Essence spring | **new** | `essence-spring` | Nothing imported (the fountain is civic and blue, the shrine has no essence). |
| UI resource items, 32 x 32 | **new** (own takes at 32 px) | `resource-item-{gold,wood,ore,essence}` (`RESOURCE_ITEMS`) | Generated at 32 x 32, not downscaled. |

`RESOURCE_PICKUPS` and `RESOURCE_MINES` in `src/assets/manifest.ts` name the
pickup and mine of each resource. Since bead `border_marches-bzc.30` the map
draws the mines with 2x2-scale studio sprites through `artFor`
([classes/map-objects.md](classes/map-objects.md)); the mine art above stays
in the manifest but is no longer drawn.

**Essence colour:** violet, `#a855f7` with `#6b21a8` shadows and pale lilac
`#e9d5ff`, used on the pickup, the spring and the item. Not the faction
red-orange, not a ground colour (green, straw, red-brown, ash) and not the
turquoise shallow water, which ruled out the bead's suggested teal.

## Sets, takes and verdicts

Four sets under `art/sets/`; every take's verdict and reason is in its
`verdicts.json`.

| Set | Accepted (output) | Rejected and why |
| --- | --- | --- |
| `lost-world-hero` | `chieftain-b-blue#0` (edit of `chieftain-b#0`), `chieftain-portrait-a#0` | `chieftain-a`: cast shadow under the feet, red loincloth; `chieftain-b`: raptor slate grey-blue (recoloured by the edit); `chieftain-c`: raptor head painted orange; `chieftain-b-blue#1`: flatter blue |
| `pickups` | `wood-a#0`, `ore-d#0`, `gold-a-yellow#0` (edit of `gold-a#0`), `essence-a#0` | `ore-a`: spiky grey reads as a small mountain; `ore-b`: on a disc with orange spikes; `ore-c`: too small; `gold-a`: copper coins (recoloured by the edit); `gold-b`: maroon sack |
| `mines` | `essence-spring-a-nosnow#1` (two edits of `essence-spring-a#0`), seated 3 px above the bottom | `essence-spring-a`: soil slab; `-clean` #0 and #1: white snow-like lumps; `-nosnow#0`: thinner rim |
| `resource-items` | `item-gold-b-yellow#0` (edit of `item-gold-b#0`), `item-wood-a#0`, `item-ore-b#0`, `item-essence-b#0` | `item-gold-a`/`-b`: orange-copper; `item-ore-a`: glints read as eyes; `item-essence-a`: red and teal socket |

26 PixelLab requests: 25 recorded calls (20 creations, 5 edit jobs) and
one edit refused by the API before a job was created (HTTP 422, see below).
The API returned no per-call cost on this account (`usd: null` in
`art/costs.jsonl`).

## Prompt layers

Layers follow the Pulp Wars order (LESSONS section 5.2): style, camera,
light, faction, class, subject, then `Must not include: ...`.

- **Verbatim from Pulp Wars** (`scripts/art/chibi/fragments/`):
  `style.txt`, `camera-three-quarter.txt`, `camera-portrait.txt`,
  `camera-icon.txt`, `light-south-west.txt`, `class-unit.txt`,
  `class-portrait.txt`, `class-resource.txt`, `class-building.txt`,
  `class-portrait.negative.txt`; `faction-lost-world.txt` is the Pulp Wars
  DINOSAUR prompt fragment (`docs/art/factions/DINOSAUR.md`).
- **Adapted:** `class-item-32.txt` is Pulp Wars `class-icon.txt` with "48
  pixels" changed to "32 pixels" (and named so the word "icon" never
  reaches a prompt). The negative fragments `style`, `class-unit`,
  `class-building`, `class-item-32` and `faction-lost-world` are condensed
  to their key terms, and `class-resource.negative` drops "pile of many
  items" (it fights a wood or coin pile). Reason: the pipeline enforces
  PixelLab's 2000-character description cap (Pulp Wars sent up to about
  3000), and the verbatim negatives alone took about 900 characters.
- **Faction layer left out of the hero and portrait** for the same cap, as
  Pulp Wars did for its creature class: their subject lines carry the
  Pulp Wars /PRIMAL Dinosaur colours (deep blue hide, dark navy back, cream
  belly and bone, tawny spotted fur, one bright orange accent).

## What worked and what did not

- Gold drifts to copper-orange, even with a hex colour: name it "bright
  lemon yellow gold like a buttercup, not orange and not copper"; a
  recolour edit of a good shape was the reliable fix.
- `edit-image-pixen` rejects `outline`, `detail`, `view` and `direction`
  (HTTP 422): keep endpoint options on the create recipes, not in a set's
  `defaults`, or every edit inherits them.
- A raptor mount came back slate grey-blue; a one-part recolour edit
  ("change only the raptor's skin ... #2f5595") matched it to the imported
  raptor without touching the rider.
- Pixen drew a soil slab under the spring; the ground-removal edit cleared
  it but left snow-like lumps, cleared by a second, one-part erase edit.
- Two bright glints on a lump read as eyes at 32 px: ask for veins.

## Follow-ups

- Class files under `docs/art/classes/` (units, resources, buildings,
  ui-items) from these notes, once the orchestrator accepts the art.
- Seeing the art in the running game (bead `border_marches-xaj.10`).
- Raw takes live in the tool's raw folder of the worktree
  (`~/.studio-raw/agent-acae673d3789b3d33/`); `validate` needs only the
  masters, but a future edit of a rejected take needs its raw file.
