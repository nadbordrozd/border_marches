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
