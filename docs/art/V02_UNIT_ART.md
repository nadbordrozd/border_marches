# v0.2 unit art (bead `border_marches-bzc.14`)

Sprites and portraits for the three v0.2 factions, the strays and
caretakers, the two summons and the six hero classes, in the inherited Bold
chibi direction ([ART_DIRECTION.md](ART_DIRECTION.md)), facing south-east
and never mirrored (the battle-facing decision of section 7 stands).
Reused Pulp Wars sprites are byte-identical imports listed in
[IMPORTED_FROM_PULP_WARS.md](IMPORTED_FROM_PULP_WARS.md#v02-factions-and-strays-bead-border_marches-bzc14);
new ones come from the studio sets `faction-units`, `class-heroes` and
`strays` under `art/sets/`, each take with a recorded verdict and reason.

Code: `src/assets/v02-units.ts` registers the sprites (spread into
`UNIT_ASSETS` and `HERO_ASSETS`); `src/assets/unit-art.ts` looks them up by
game id: `unitArt(creatureId)`, `heroArt(classId)`, `unitPortrait`,
`heroPortrait`, `hasUnitArt`, `hasHeroArt`. Unknown ids fall back to a
placeholder (`stray-shade` for creatures, `dinosaur-chieftain` for heroes).

## Creatures

| Id | Sprite key | Source |
| --- | --- | --- |
| `squire` | `human-squire` | new (`squire-a`, generated at 48x72, padded) |
| `longbowman` | `marksman` | Pulp Wars `marksman` |
| `man-at-arms` | `swordsman` | Pulp Wars `swordsman` |
| `friar` | `human-friar` | new (`friar-a`) |
| `knight` | `knight` | Pulp Wars `knight` |
| `dragonslayer` | `human-dragonslayer` | new (`dragonslayer-a`, giant) |
| `skeleton` | `undead-skeleton` | Pulp Wars (imported by xaj.4) |
| `ghoul` | `undead-ghoul` | Pulp Wars `ghoul` |
| `banshee` | `undead-banshee` | Pulp Wars `banshee` |
| `gravecaller` | `undead-necromancer` | Pulp Wars `necromancer` |
| `vampire` | `undead-vampire` | Pulp Wars (imported by xaj.4) |
| `late-king` | `undead-late-king` | new (`late-king-b`, giant) |
| `goblin`, `bomb-chucker`, `wolf-rider`, `ogre` | `goblin-*` | Pulp Wars (imported by xaj.4) |
| `orc-warboss` | `goblin-orc-warboss-giant` | new (`orc-warboss-giant-a`, giant, bead bzc.29) after the imported 56x80 `goblin-orc-warboss`, which stays registered |
| `boomshaman` | `goblin-boomshaman` | new (`boomshaman-b`) |
| `gremlin` | `cult-imp` | Pulp Wars Cult imp |
| `bog-leech` | `cult-tentacle` | Pulp Wars Cult tentacle |
| `lagoon-lurker` | `cult-frog-unit` | Pulp Wars Cult frog |
| `winder` | `dwarf-clockwork-gunner` | Pulp Wars Dwarf clockwork (the wind-up key) |
| `rigger` | `dwarf-engineer` | Pulp Wars Dwarf engineer |
| `tin-titan` | `dwarf-brass-titan` | Pulp Wars Dwarf brass titan |
| `rime-walrus` | `ice-folk-walrus` | Pulp Wars Ice Folk walrus |
| `bellhop`, `whipping-boy`, `lamplighter`, `newsie`, `notary`, `crooner`, `loan-shark`, `groundskeeper`, `gumshoe`, `deep-sea-diver`, `sexton`, `fire-eater`, `prize-pumpkin`, `beanstalk-giant` | `stray-<id>` | new (set `strays`) |
| `seedling`, `shade` | `stray-<id>` | new summons |

## The Candy Kingdom (bead `border_marches-bzc.112`)

Six new creatures in the set `faction-units`, from
[FACTION_CANDY.md section 10](../design/FACTION_CANDY.md#10-art): same
endpoint, layers and `@piece` options as the rest of the set, the section
10.1 palette written into each subject, facing south-east, one static
sprite each with a 1:1 head crop as its 48x48 portrait. Registered with
the art faction `candy` (`src/assets/manifest.ts`), feet measured by
`art/review/measure-units.mjs`, opaque tops in `src/assets/unit-tops.ts`.

| Id | Sprite key | Take | Canvas |
| --- | --- | --- | --- |
| `gingerbread-man` | `candy-gingerbread-man` | `gingerbread-man-a#0`, generated at 48x72, padded | 56x80 |
| `peppermint-archer` | `candy-peppermint-archer` | `peppermint-archer-a#0` | 56x80 |
| `taffy-wrangler` | `candy-taffy-wrangler` | `taffy-wrangler-b-clean#0` (ground-plate edit) | 56x80 |
| `sugarplum` | `candy-sugarplum` | `sugarplum-b#0` | 56x80 |
| `gummy-bear` | `candy-gummy-bear` | `gummy-bear-a#0` (creature layer) | 72x88 |
| `rock-candy-dragon` | `candy-rock-candy-dragon` | `rock-candy-dragon-b#0` | 88x104 |

Rejected, each with its reason in `verdicts.json`: a pig cowpoke in brown
clothes (`taffy-wrangler-a`; the re-roll names the body as taffy with no
snout), a south-west-facing smooth-scaled dragon (`rock-candy-dragon-a`;
the creature layer's "rounded rubbery shapes" fought the facets, so `-b`
drops it for an explicit outline and names the facets and the facing),
ground plates under the Wrangler and the first Sugarplum (removed by
edits), and that round-plum Sugarplum itself, which on the battle line-up
read smaller than the tier 1 Gingerbread Man (`sugarplum-b` fills the
canvas). The Candy outpost is `map-objects/outpost-candy-a#2` (a
gingerbread watchtower behind a candy-cane wall, 113x115), registered as
the `candy` variant of `faction-outpost` in `src/assets/map-objects.ts`.

## The Deepforge (bead `border_marches-bzc.131`)

Six new creatures in the set `faction-units`, from
[FACTION_DWARVES.md section 10](../design/FACTION_DWARVES.md#10-art), made
as the Candy Kingdom's were: same endpoint and `@piece` options, the section
10.1 palette (brass, copper, verdigris, iron, steam white, ginger and grey
beards) written into each subject, white steam and never black smoke,
facing south-east, a 1:1 crop as the 48x48 portrait (the Tinker's take is
48 px wide, so hers is head and body). The two dwarves take the unit class
layer; the Mortar too (a walking gun with feet); the Gyrocopter, Steam Tank
and Ironclad drop it and name the outline, as `rock-candy-dragon-b`.
Registered with the art faction `dwarves` (`src/assets/manifest.ts`), feet
measured by `art/review/measure-units.mjs`, opaque tops in
`src/assets/unit-tops.ts`.

| Id | Sprite key | Take | Canvas |
| --- | --- | --- | --- |
| `tinker` | `dwarves-tinker` | `tinker-b-clean#0` (ground-plate edit), generated at 48x72, padded | 56x80 |
| `rivet-gunner` | `dwarves-rivet-gunner` | `rivet-gunner-a#0` | 56x80 |
| `gyrocopter` | `dwarves-gyrocopter` | `gyrocopter-b#0` | 56x80 |
| `mortar` | `dwarves-mortar` | `mortar-a#0` | 56x80 |
| `steam-tank` | `dwarves-steam-tank` | `steam-tank-a-ram#0` (ram edit) | 72x88 |
| `ironclad` | `dwarves-ironclad` | `ironclad-a#0` | 88x104 |

Canvases follow the Candy tiers (1-4 standard, 5 large, 6 giant) so the
sizes rise with tier; FACTION_DWARVES 10.2 had first drawn the Gyrocopter
large (72x88), which would have stood it above the tier 4 Mortar.
Rejected, each with its reason in `verdicts.json`: a Tinker whose wrench
was a stub behind her shoulder (`tinker-a`; the re-roll holds it across her
front), a grass block under that re-roll (removed by an edit), a Steam Tank
whose ram nose was an open gun barrel (`steam-tank-a`; the edit
`steam-tank-a-ram` closes it into a riveted ram head: the Tank rams, it does
not shoot) and a Gyrocopter half the size of its canvas (`gyrocopter-a`,
smaller than the tier 2 Rivet Gunner on the line-up). The Gyrocopter's pilot
came back white-bearded, not ginger (accepted). The Deepforge outpost is
`map-objects/outpost-dwarves-b#3` (a tall copper boiler house under a
verdigris roof, a stone workshop, brass chimneys and white steam, a round
brass vault door in a cog frame at the front centre, 109x104), registered as
the `dwarves` variant of `faction-outpost`; the first outpost take
(`outpost-dwarves-a#1`) ringed an empty yard and was replaced. Review sheets
(not in git) are in the bead's worktree under `.orchestration/screens/bzc131/`:
`lineup-volcanic.png` (beside the Candy Kingdom on the native ground),
`lineup-grass.png` (beside the Realm, the Horde and the stray Pulp Wars
dwarves), `portraits.png`, `outposts-*.png` and `takes-*.png`.

## Sea guardians (bead `border_marches-bzc.157`)

The eight sea guardians and the summoned Hermit Crab of
[NAVAL.md sections 4 and 10.2](../design/NAVAL.md#10-art), in the new set
`sea-units`: the faction-units endpoint, layers and `@piece` options, facing
south-east, one static sprite each with a 1:1 crop as its 48x48 portrait
(the Hermit Crab's take is 40x40, so its portrait is the whole crab padded
to 48x48). The Drowned Sailor and the Corsair hold weapons and take the
unit class layer; the rest drop it and name the outline and the facing, as
`rock-candy-dragon-b`. A sea palette is written into each subject (sea teal
`#2fa7b8`, deep sea blue `#2a5d9f`, seafoam `#bfeee0`, coral orange
`#f07a3a`, sand `#e8d3a0`), with the pink Jellyfish and purple Kraken that
NAVAL 10.2 names. **No water, splash or ripple is baked in**: NAVAL 3.8
draws the waterline and ripple ring in code, and the code shadow stands
under every unit as before. Registered as neutral units in
`src/assets/v02-units.ts`, `src/assets/unit-art.ts` (`CREATURE_ART`, by the
NAVAL ids) and `src/assets/unit-tops.ts`; sprite keys are `sea-<id>`.

| Id | Sprite key | Take | Canvas |
| --- | --- | --- | --- |
| `jellyfish` | `sea-jellyfish` | `jellyfish-a#0`, generated at 44x60, padded | 56x80 |
| `drowned-sailor` | `sea-drowned-sailor` | `drowned-sailor-a#0` | 56x80 |
| `giant-crab` | `sea-giant-crab` | `giant-crab-a#0`, generated at 56x56, padded | 56x80 |
| `corsair` | `sea-corsair` | `corsair-a-clean#0` (edit) | 56x80 |
| `siren` | `sea-siren` | `siren-a-clean#0` (ground-plate edit) | 56x80 |
| `hammerhead` | `sea-hammerhead` | `hammerhead-a#0` | 56x80 |
| `sea-serpent` | `sea-sea-serpent` | `sea-serpent-a-friendly#0` (face edit) | 72x88 |
| `kraken` | `sea-kraken` | `kraken-a#0` | 88x104 |
| `hermit-crab` | `sea-hermit-crab` | `hermit-crab-a-clean#0` (ground-plate edit), generated at 40x40, padded | 56x80 |

Rejected, each with its reason in `verdicts.json`: a Corsair whose red
cheek and wrist streaks read as blood (fixed by an edit), a Siren sitting
on a grey rock (removed by an edit; her two music notes stayed and read on
water and deck), a Hermit Crab on a puddle plate (removed by an edit), a
Sea Serpent that frowned with small angry eyes (`sea-serpent-a`; the edit
`sea-serpent-a-friendly` gives it big friendly eyes and keeps its
south-east facing), a friendly re-roll facing south-west (`sea-serpent-b`)
and a blobby baby-dragon re-roll (`sea-serpent-c`). The Giant Crab's stalk
eyes came back as round eyes under its helmet shell and the Drowned Sailor
wears a tricorn rather than a cap (both accepted). Review sheets (not in
git) are in the bead's worktree under `.orchestration/screens/bzc157/`:
`lineup-water.png`, `lineup-deep.png` and `lineup-deck.png` (beside
Deepforge, Candy and stray units at 1:1 and x2), `portraits.png` and
`takes-*.png`.

## Hero classes

Every hero rides, as on a Heroes map, on a mount of its own so a hero never
reads as a creature stack (72x88, like the Chieftain):

| Class id | Sprite key | Mount |
| --- | --- | --- |
| `knight-errant` | `hero-knight-errant` | chestnut charger |
| `enchanter` | `hero-enchanter` | white unicorn |
| `revenant` | `hero-revenant` | skeleton horse |
| `mortician` | `hero-mortician` | grey donkey with a funeral plume |
| `warlord` | `hero-warlord` | war boar |
| `weatherwitch` | `hero-weatherwitch` | shaggy goat |
| `nutcracker` | `hero-nutcracker` | candy-striped rocking horse (Candy Kingdom, bead `border_marches-bzc.113`) |
| `confectioner` | `hero-confectioner` | marzipan pig (Candy Kingdom, bead `border_marches-bzc.113`) |
| `thane` | `hero-thane` | clockwork mountain ram (Deepforge, bead `border_marches-bzc.132`) |
| `artificer` | `hero-artificer` | walking copper teakettle on two brass legs (Deepforge, bead `border_marches-bzc.132`) |

Each class has a generated 48x48 bust (`portrait-hero-<class>`).

## Named heroes (bead `border_marches-bzc.29`)

Each of the 24 named heroes (`NAMED_HEROES` in `src/data/classes.ts`) has
its own 48x48 portrait, `portrait-named-<hero id>` at
`assets/portraits/named-<hero id>.png`, from the set `named-heroes`: the
class portraits' endpoint, layers and options, the class costume and
colours kept, and the person made distinct by face, hair, age and one
accessory from the name or specialty (Wat's green hood and longbow,
Aldous's eyepatch and banner, Jeb's shovel, Ignatius's beak nose and hush,
Snagga's three kettles, Pim's bomb). Three came back as small whole
figures and got the LESSONS 4.1 zoom edit (Ysolde, Jeb, Ophelia); Grukk was
re-rolled for a hazard yellow helmet and more teeth.

`namedHeroPortrait(heroId, heroClass?)` in `src/assets/unit-art.ts` returns
the hero's own portrait, else the class portrait (from `heroClass` or the
hero definition), else the placeholder's. It is used by the tavern, the
hero list and hero panel, the hero screen, the level-up dialog and the
battle screen, which now shows the portrait of each side's hero at the left
of its bottom bar (`BattleHero` carries `defId` and `heroClass` for this).

Accepted with small notes in `verdicts.json`: Agatha has a pale vampire
face rather than the class skull (her Vampire specialty), Olga's skin is a
darker lime, Pim's shawl is brown.

## Candy Kingdom heroes (bead `border_marches-bzc.113`)

The two Candy classes of [FACTION_CANDY.md](../design/FACTION_CANDY.md)
sections 7 and 10 were added to `class-heroes` with the same endpoint,
layers, options and sizes as the six v0.2 classes, in the Candy palette of
section 10.1: the Nutcracker, a toy-soldier nutcracker with white whiskers
under a tall black shako with a pink plume, in a candy-cane red coat,
holding a candy cane, on an icing-white rocking horse with red stripes and
candy-cane rockers; the Confectioner, a granny baker in a frilly mob cap,
round spectacles, pink dress and white apron, with a giant wooden spoon
dripping pink frosting, on a pink marzipan pig. Each has its 48x48 bust.

The eight Candy named heroes (section 8) have their own busts in
`named-heroes`, keeping the class costume. Their ids are the distinctive
first word of each name, as for the other factions: `kernel` (Captain Kernel
Crackwell: curled black moustache, peppermint hat band), `brittle` (Dame
Brittle Hazelby: two braids), `walnut` (Major Walnut Thumps: a walnut in his
jaw, monocle), `humbug` (Corporal Humbug: striped humbug cap, a gold coin in
his jaw), `praline` (Madame Praline: praline-brown beehive, gold bell),
`treacle` (Old Mother Treacle: a ladle dripping treacle), `fondant` (Auntie
Fondant: mint curls, egg-timer hourglass) and `gingersnap` (Granny
Gingersnap: big spectacles, gingerbread man). Praline and Fondant got the
LESSONS 4.1 zoom edit; Gingersnap was re-rolled (the first take was a young
girl); the Nutcracker sprite's second take was rejected for a pumpkin-like
head and the third for facing south-west. Registered in
`src/assets/v02-units.ts` (`HERO_ROWS`, `NAMED_HERO_ROWS`, faction `candy`),
`src/assets/unit-art.ts` (`HERO_CLASS_ART`) and `src/assets/unit-tops.ts`.
Review sheets: `.orchestration/screens/bzc113/` in the bead's worktree
(`lineup-snow.png` and `lineup-grass.png` beside the other mounted heroes,
`candy-portraits.png` beside existing busts, `takes-*.png` every take).

## Deepforge heroes (bead `border_marches-bzc.132`)

The two Deepforge classes of [FACTION_DWARVES.md](../design/FACTION_DWARVES.md)
sections 7 and 10 were added to `class-heroes` the same way as the Candy
classes, in the palette of section 10.1 (brass, copper, verdigris, iron,
steam white; no black smoke): the Thane, a white-bearded dwarf lord in a
brass helmet with a verdigris crest and goggles, verdigris pauldrons and a
raised steam hammer puffing steam, on a clockwork mountain ram of brass and
iron plates with curly iron horns; the Artificer, an auburn-bearded dwarf
inventor in an iron-grey top hat with brass goggles, a copper coat and a
crackling brass tuning-fork staff, sitting on a walking copper teakettle
with a porthole eye and a steaming spout, on two brass legs. Each has its
48x48 bust.

The eight Deepforge named heroes (section 8) have their own busts in
`named-heroes`, keeping the class costume (brass helmet and verdigris
pauldrons, or the top hat with goggles and the copper coat); the dwarf
women are beardless (the orchestrator's call for cute and readable at 48):
`brakka` (Thane Brakka Boltbeard: black forked beard with bolts), `gristle`
(Old Gristle Copperpot: a dented copper pot for a helmet, a rivet-gun
barrel), `hilde` (Captain Hilde Ironkettle: ginger braids, ram horns on the
helmet), `dunstan` (Foreman Dunstan Coalbright: coal-smudged cheeks, a
miner's lamp, a pickaxe), `mags` (Mags Sparkwrench: a sparking wrench),
`silas` (Silas Ledgerby: grey beard, a ledger and quill), `valvina` (Auntie
Valvina Steamwright: a grey bun, a sparking valve wheel) and `nell` (Nell
Fusewright: ginger pigtails, a shell with a lit fuse). The first Artificer
take was rejected for reading as a leprechaun on a pot of gold (a spoutless
cauldron on short feet); `artificer-b` asks for a teakettle with a long
spout on brass legs. Gristle was re-rolled for noisy shading, emerald
pauldrons and a purple patch. Registered with the art faction `dwarves` in
`src/assets/v02-units.ts` (`HERO_ROWS`, `NAMED_HERO_ROWS`),
`src/assets/unit-art.ts` (`HERO_CLASS_ART`) and `src/assets/unit-tops.ts`.
Review sheets: `.orchestration/screens/bzc132/` in the bead's worktree
(`lineup-volcanic.png` and `lineup-grass.png` beside the other mounted
heroes, `dwarves-portraits.png` beside existing busts, `takes-*.png` every
take).

## Portraits

- Imports: the Pulp Wars portrait of the same unit.
- Heroes: generated busts (the Knight Errant's after the LESSONS 4.1 zoom
  edit).
- New creatures: a 1:1 head-and-shoulders crop of the sprite's own master
  (`crop` step in `outputs[]`, no scaling), so no extra calls.

## Decisions

| Decision | Why |
| --- | --- |
| Realm units keep the Pulp Wars crimson and gold heraldry; the new Squire, Friar and Dragonslayer match it | The faction docs reuse the crimson Pulp Wars knight, marksman and swordsman as they are; one palette per roster (LESSONS 4.7). The faction colour `#2f6fd0` stays an interface colour; recolouring the Realm to tabard blue is about four edit calls if wanted |
| No faction prompt layer; colours in each subject | The 2000-character description cap, as for the Chieftain |
| Strays avoid the three faction signatures | They belong to nobody; each has its own colours |
| Small creatures generated small and padded | LESSONS 4.1: Pixen fills its canvas; tier 1 strays, the Squire and the summons read smaller |
| The Shade is new rather than a reused zombie or wight | A hovering shadow matches Fade (mist on death); the zombie and wight stay free |
| Ground plates removed by edits, not re-rolls | Edits keep the accepted design (Newsie, Loan Shark, Shade) |

## Review evidence

Bead bzc.29: `.orchestration/screens/bzc29/` in its worktree: `realm.png`,
`restless.png`, `horde.png` (each named hero beside its class portrait,
native and x3, light and dark), `takes-all.png` (every take of the set) and
`battle-heroes.png` (the battle bottom bar with a hero portrait).

Contact sheets and line-ups (git-ignored) in the bead's worktree under
`.orchestration/screens/bzc14/`: `takes-*.png` (every take, native and x2,
light and dark), `outputs-*.png` (game files), `imported-*.png`, and
`lineup-*.png` (each faction beside the Lost World units on its native
ground at 1:1 and x2, built by `art/review/lineup.mjs`). Feet are measured
by `art/review/measure-units.mjs` (the Pulp Wars rule).

## Follow-ups

- Done in bzc.29: the Orc Warboss giant redraw (88x104) and the 24
  named-hero portraits.
- Defender-facing (south-west) takes, per ART_DIRECTION section 7.
