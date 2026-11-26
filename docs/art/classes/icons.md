# Icons asset contract

Status: draft (2026-11-24, bead `border_marches-bzc.17`; orchestrator call,
the user said "make all the decisions"). Specialises
[`../ART_DIRECTION.md`](../ART_DIRECTION.md) for the small symbols of the
interface: spells, artifacts, secondary skills, feats and vows, battle
conditions and ground, the hero sheet's stats and the five school emblems.

## Inventory

Four studio sets, one per family, derived into `public/assets/icons/<kind>/<id>.png`
and listed in `src/assets/icons.ts` (`ICON_ASSETS`, looked up with
`iconFor(kind, id)`):

| Set | Kinds | Content |
| --- | --- | --- |
| `art/sets/icons-spells` | `spell` | 50 battle and 10 adventure spells ([CONTENT_SPELLS.md](../../design/CONTENT_SPELLS.md)) |
| `art/sets/icons-artifacts` | `artifact` | 30 Trinkets, 20 Wonders, 6 cursed Wonders, 12 Marvel pieces, 4 assembled Marvels, 12 consumables ([CONTENT_ARTIFACTS.md](../../design/CONTENT_ARTIFACTS.md)), the Keystone relic |
| `art/sets/icons-conditions` | `condition`, `ground` | 25 catalogue condition kinds plus Sworn, Challenged and the demo Guarded, 7 ground kinds plus Sweets; 16 px variants for stack overlays |
| `art/sets/icons-heroes` | `skill`, `feat`, `vow`, `stat`, `school`, `fallback` | 24 skills, 28 feats, 12 vows ([CONTENT_HEROES.md](../../design/CONTENT_HEROES.md)), the 14 hero-sheet stats (Attack, Defense, Power, Lore; Mana, Movement, Experience, Level, Sight, Morale, Luck, Command, Spellbook, Scroll case), the five school emblems, and one fallback per kind |

Content ids are the catalogue names in kebab case without apostrophes
(`Ringmaster's Whip` -> `ringmasters-whip`, `The Sky Falls` ->
`the-sky-falls`); `contentId(name)` in `src/assets/icons.ts` makes them.

## Geometry

- Native size **32 x 32** (spellbook, inventory, skill and feat lists,
  hover cards), shown at 1x or integer multiples. Conditions also have
  **16 x 16** variants made as their own takes at 16 px (stack overlays in
  battle); there is no downscale anywhere.
- The symbol fills most of the square with a margin of a few pixels; the
  frame is not part of the take.
- Never downscaled, never mirrored (the light would come from the wrong
  side).

## Frames (drawn by code)

Frames are a recorded derivation in code, never baked into a take: the
same take can sit in any frame, and a frame colour change needs no new art.
`iconFor` returns the frame; `src/ui/icons.ts` draws it in the interface and
`art/review/icon-sheet.mjs` draws it identically on the review sheets.

The frame of a 32 px icon is a 38 x 38 box: a 2 px border in the frame
colour, then a 1 px bevel between the border and the icon, the light tone
on the left and bottom edges (the sun is at the bottom left) and the shadow
tone on the top and right. The inside is transparent: the panel shows
through, so the icon is readable on light and dark panels alike.

| Frame | Colour | Shadow | Light | Used by |
| --- | --- | --- | --- | --- |
| Bloom | `#4caf50` | `#2e7d32` | `#a5d6a7` | Bloom spells, conditions, ground and Greencraft |
| Accord | `#3f7fd9` | `#24508f` | `#a9c8f5` | Accord ... and Covenant |
| Clock | `#d4a017` | `#8a6508` | `#f5dc7a` | Clock ... and Horology |
| Hush | `#8a63b8` | `#4e3270` | `#cdb4ea` | Hush ... and Quietus |
| Storm | `#d9472b` | `#8e2414` | `#f5a08f` | Storm ... and Stormcalling |
| Trinket | `#b07a45` | `#6e4522` | `#e0b98c` | Trinkets (bronze) |
| Wonder | `#aab4c2` | `#5d6878` | `#e6ebf2` | Wonders (silver) |
| Cursed | `#7d9a2c` | `#3d4d12` | `#c7dd7a` | cursed Wonders and The Upper Bulb (sickly green) |
| Piece | `#e8b923` | `#9a7208` | `#fff0a8` | Marvel pieces (gold) |
| Marvel | `#ff9f1a` | `#a8520a` | `#ffd9a0` | assembled Marvels (orange gold) |
| Consumable | `#c9b38a` | `#7d6a45` | `#efe3c4` | potions, papers and tools (parchment) |
| Skill | `#8c96a6` | `#4a5260` | `#d3d9e2` | army and journey skills (steel) |
| Feat | `#2fa39a` | `#17605a` | `#a3e3dc` | feats (teal) |
| Vow | `#5a6273` | `#2b303b` | `#a9b1c2` | vows (slate) |

School colours stay away from the essence violet (`#a855f7`, Hush is a
duller plum) and from each other on a colour-blind check by value as well
as hue: Clock is the lightest, Hush the darkest. Stats, school emblems and
conditions without a school (Lucky is Bloom; rock, corpse, bones, wreck
have none) are shown unframed, or in the frame their screen chooses.

## Readability

- One concrete object per symbol, a big silhouette, a dark outline, flat
  saturated colours with one shadow tone; a symbol reads at 32 px on both
  a light (`#f2f2f2`) and a dark (`#1e2126`) panel.
- No letters, numbers or text in a symbol: names and numbers are drawn by
  the interface.
- Family members that share an idea (the Thorned condition, the Thornskin
  spell, the Thornmail Vest) use different objects, so the icons are not
  mistaken for one another.

## Recipe

`generate-image-v2`, 32 x 32, no background, layers `style`,
`light-bottom-left`, `class-symbol-32`, subject. One call returns 64
candidates; the subject lists 7 to 12 things ("each image shows exactly
one of these N things, each thing about equally often: (1) ...; (2) ..."),
so one call covers 7 to 12 content ids with 4 to 9 takes each, and the
clearest take of each is accepted. The recipe data is
`art/review/icon-recipes.mjs` (appends, never edits), the picks and
verdicts `art/review/icon-picks.mjs`.

Worked: concrete everyday objects named with their colours ("a shiny gold
hand bell with a wooden handle"); the model lays a list of up to 12 out
evenly. Did not work / watch for: hats grow faces (the thinking cap); a
blank candidate now and then; a part of an object comes back as the
whole object (an hourglass bulb drawn as an hourglass: describe the part's
own shape instead); black subjects (a cat, a crow, an iron ball) nearly
vanish on a dark panel, so ask for charcoal grey with a light chest or
bright eyes; "sleepy" subjects grow Z letters (rejected).

## Coverage (bead `border_marches-bzc.17`)

Every catalogue id has its own icon; `ICON_MISSING` is empty.

| Family | Own icons | Notes |
| --- | --- | --- |
| Spells | 60 / 60 (50 battle, 10 adventure) | school frame |
| Artifacts | 84 / 84 (30 Trinkets, 20 Wonders, 6 cursed, 12 pieces, 4 Marvels, 12 consumables) | grade frame |
| Conditions | 25 / 25 at 32 px, 25 / 25 at 16 px | school frame |
| Ground | 7 / 7 | school frame for fire, brambles, mist |
| Skills | 24 / 24 | school frame for the five school skills, steel otherwise |
| Feats, vows | 28 / 28, 12 / 12 | one icon each, none shared |
| Stats, schools | 14 / 14, 5 / 5 | unframed / school frame |
| Fallbacks | 9 (one per kind) | for ids added later |

31 PixelLab calls (`generate-image-v2`, 64 candidates each, 1,984 takes),
US$2.55 recorded in `art/costs.jsonl`: 3 samples, 21 batch calls, 3 at
16 px, 1 for the fallbacks and 2 re-rolls (the Upper and Lower Bulb drawn
as whole hourglasses; a black Jinxed cat and a dark Leeched leech that
vanished on a dark panel). 283 takes accepted, every other take rejected
with a reason (`verdicts.json`).

Review sheets (not in git): `.orchestration/screens/bzc17/*.png`, rebuilt with

```sh
node art/review/icon-sheet.mjs .orchestration/screens/bzc17/spells.png spells
node art/review/icon-grid.mjs /tmp/bloom-a.png icons-spells bloom-a   # one recipe's 64 takes
```

## Additions outside the content tables (bead `border_marches-9is`)

The gallery found five ids on the fallback icon. They are catalogue entries
by their game id, added in `art/review/icon-catalogue-build.mjs` (not read
from a design table):

| Id | Kind | Frame | Icon (32 px / 16 px) |
| --- | --- | --- | --- |
| `sworn` | condition (Realm, FACTION_HUMANS) | Accord | two crossed swords tied by a blue bow / the same with a ribbon band |
| `challenged` | condition (Realm) | Accord | a thrown steel gauntlet with a blue cuff / the same, tilted |
| `demo-guard` | condition (Guarded, battle grammar demo only) | Accord | a knight's helmet with a blue plume / the same |
| `sweets` | ground (remains, RULES_V2; nothing leaves it in v0.2) | none | a heap of wrapped candies |
| `keystone` | artifact (relic, CONTENT_MAP_OBJECTS 4) | Marvel, as the hero screen colours relics | a wedge of carved sandstone with a gold gem |

Recipes `conditions-e`, `conditions-e-16`, `conditions-f-16` (a re-roll: the
first 16 px gauntlets were all grey, without the 32 px icon's blue cuff) and
`relics-a`; 4 PixelLab calls, US$0.33. The 16 px badges are their own
16 px takes, never a downscale. Rejected: crossed swords without the ribbon
(a battle sign, not an oath), gold-banded keystones (read as a bucket) and
grey slabs with a flame gem (read as a candle or a tombstone).

## Hero sheet stats (bead `border_marches-bzc.82`)

The Heroes II style hero sheet shows every number as an icon. Recipe
`stats-b` (seed 17409, one call, 64 takes) added ten `stat` icons beside
the bzc.17 four:

| Id | Icon | Take |
| --- | --- | --- |
| `mana` | a tall blue crystal with a white shine | 0 |
| `movement` | a brown boot with a white wing at the heel | 25 |
| `experience` | a gold star with a shine | 42 |
| `level` | a laurel wreath tied with a red ribbon | 27 |
| `sight` | a brass spyglass | 28 |
| `morale` | a red heart with a gold crown | 29 |
| `luck` | a gold horseshoe, open end up | 30 |
| `command` | a red marshal's baton with gold ends | 36 |
| `spellbook` | a purple spellbook with a gold star and clasp | 44 |
| `scroll-case` | a leather scroll tube with a strap | 47 |

Rejected: cyan crystal clusters (read as ice), dark crimson hearts (sink
on a dark panel), a book stood on its spine, upright tubes (read as
bottles), a broken laurel without its ribbon, a star with stray sparkle
pixels; every other take is a spare. The sheet is
`.orchestration/shots/bzc.82/icons-sheet.png`, rebuilt with
`node art/review/icon-sheet.mjs <out.png> stats`.

## Acceptance

- Every take reviewed on a 64-candidate grid at 1x and 3x on light and dark
  (`art/review/icon-grid.mjs`), and the accepted family on a contact sheet
  (`art/review/icon-sheet.mjs`, framed and unframed, 1x and 3x, light and
  dark).
- No frame, badge, disc, ground or text in the take; no face on an object
  that has none; lit from the left.
- Every content id resolves through `iconFor`; an id without its own icon
  gets its kind's fallback (`fallback: true`), never a broken image.
