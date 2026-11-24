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
| `goblin`, `bomb-chucker`, `wolf-rider`, `ogre`, `orc-warboss` | `goblin-*` | Pulp Wars (imported by xaj.4) |
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

Each class has a generated 48x48 bust (`portrait-hero-<class>`). The 24
named heroes share their class portrait for now.

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

Contact sheets and line-ups (git-ignored) in the bead's worktree under
`.orchestration/screens/bzc14/`: `takes-*.png` (every take, native and x2,
light and dark), `outputs-*.png` (game files), `imported-*.png`, and
`lineup-*.png` (each faction beside the Lost World units on its native
ground at 1:1 and x2, built by `art/review/lineup.mjs`). Feet are measured
by `art/review/measure-units.mjs` (the Pulp Wars rule).

## Follow-ups

- The Orc Warboss (tier 6) is a standard 56x80 Pulp Wars sprite, smaller
  than the other tier 6 units (88x104); a giant redraw would match them.
- Named-hero portraits (24) when the budget allows.
- Defender-facing (south-west) takes, per ART_DIRECTION section 7.
