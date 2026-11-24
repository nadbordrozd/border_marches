# Content taxonomy: what the Heroes series has, and what v0.2 ships

Status: research and targets for v0.2 (bead `border_marches-bzc.1`,
2026-11-24). Feeds the faction design (`border_marches-bzc.5`) and the content
catalogue (`border_marches-bzc.6`), which write the actual content at the
counts set here.

This document lists the **kinds** of things in Heroes of Might and Magic 1-4
and their main expansions, with counts where a source gives them, and sets our
**v0.2 target** for each kind. It names only a few short examples per
category; it is not a copy of any game's content. Our own content follows the
approved concept, [MAGIC_AND_FACTIONS_CONCEPT.md](MAGIC_AND_FACTIONS_CONCEPT.md)
(option B: shared grammar and spellbook, one birthright per faction), and the
MVP rules in [GAME_DESIGN.md](GAME_DESIGN.md).

**[RULES_V2.md](RULES_V2.md) governs wherever the two documents differ.**
This taxonomy was reconciled with it on 2026-11-24.

**Abbreviations.** H1: _Heroes of Might and Magic_ (1995). H2: _Heroes II_
(1996) with _The Price of Loyalty_ (PoL, 1997). H3: _Heroes III_, _The
Restoration of Erathia_ (RoE, 1999), _Armageddon's Blade_ (AB, 1999), _The
Shadow of Death_ (SoD, 2000) and the fan expansion _Horn of the Abyss_ (HotA).
H4: _Heroes IV_ (2002) with _The Gathering Storm_ (TGS, 2002) and _Winds of
War_ (WoW, 2003). "~" marks an approximate count; "n/s" marks a figure no
source confirmed (see [section 11](#11-sources)).

**Reading the targets.** A target is a count of distinct content kinds for
v0.2: solid, buildable by a handful of workers, and generous, because the user
asked for "lots". "Core" items are needed for dense maze maps; "stretch" items
are cut first if a wave runs long.

## 1. Checklist

| #   | Category                         | Heroes (range across H1-H4)                         | v0.2 target                                                                            | Section                                                                  |
| --- | -------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | Primary stats                    | 4 (H1-H3); skill-derived in H4                      | 4: Attack, Defense, Power, Lore                                                        | [3.1](#31-primary-stats)                                                 |
| 2   | Secondary skills                 | 0 / 14 / 28-30 / 36                                 | 24 skills, 3 ranks, 6 slots                                                            | [3.2](#32-secondary-skills)                                              |
| 3   | Feats and vows                   | none (closest: H4 class abilities)                  | 40 (28 feats, 12 vows)                                                                 | [3.3](#33-feats-and-vows-ours)                                           |
| 4   | Hero classes                     | 4 / 6 / 16-22 / 40+ advanced                        | 6 (2 per faction), each with a Command                                                 | [3.4](#34-hero-classes)                                                  |
| 5   | Named heroes with specialties    | none / none / ~150 / none in standard play          | 24 heroes (8 per faction), 5 specialty forms (RULES_V2 3.7)                            | [3.5](#35-specialties)                                                   |
| 6   | Experience sources               | ~9 in H3                                            | 8                                                                                      | [3.6](#36-levelling-and-experience)                                      |
| 7   | Spell schools                    | 0 / 0 / 4 / 5                                       | 5 (Bloom, Accord, Clock, Hush, Storm)                                                  | [4.1](#41-schools-and-tiers)                                             |
| 8   | Combat spells                    | ~50 (H2) / 60 (H3), 5 levels                        | 50 (10 per school over 5 tiers); no seam spells                                        | [4.1](#41-schools-and-tiers)                                             |
| 9   | Mage guild                       | 5 levels, 15 spells (H3)                            | 5 levels, 13 spells per town, seeded and visible                                       | [4.2](#42-mage-guilds)                                                   |
| 10  | Adventure spells                 | ~13 (H2) / 10 (H3)                                  | 10 (2 per school)                                                                      | [4.3](#43-adventure-spells)                                              |
| 11  | Consumables                      | scrolls (H2 PoL, H3), potions (H4)                  | scrolls of any spell (case of 8) + 12 map-use consumable kinds                         | [4.4](#44-scrolls-and-other-consumables)                                 |
| 12  | Artifacts                        | ~97 (H2) / 141-156 (H3)                             | 80 kinds (incl. 12 consumables, 12 Marvel pieces)                                      | [5](#5-artifacts)                                                        |
| 13  | Artifact slots                   | 14 worn + 5 machine slots + 64 pack (H3)            | 11 worn (incl. 2 pockets), backpack 12, scroll case 8                                  | [5.1](#51-slots)                                                         |
| 14  | Sets and combinations            | 1 set (H2 PoL) / 12-16 combinations (H3)            | 4 Marvels in 3 pieces                                                                  | [5.3](#53-sets-and-combinations)                                         |
| 15  | Cursed artifacts                 | ~7 curse types (H2); double-edged items (H3)        | 6 cursed Wonders                                                                       | [5.4](#54-cursed-and-double-edged-artifacts)                             |
| 16  | Mines and producers              | 7 mines + abandoned mine; weekly producers          | 5 mine kinds, 3 weekly producers                                                       | [6.1](#61-mines-and-producers)                                           |
| 17  | External dwellings               | ~7 per town type + multi-stack + random (H3)        | 3 object types, 20 variants                                                            | [6.2](#62-external-dwellings)                                            |
| 18  | Visitable buildings              | ~60 in H3 incl. HotA                                | 18 object types by reset kind                                                          | [6.3](#63-visitable-buildings-by-reset-type)                             |
| 19  | Creature banks                   | ~10 (SoD), 24 (HotA)                                | 6 bank kinds x 3 sizes + 1 drafting vault; normal deployment                           | [6.4](#64-creature-banks-and-vaults)                                     |
| 20  | One-time treasure                | ~10-15 pickup kinds                                 | 6 kinds                                                                                | [6.5](#65-one-time-treasure)                                             |
| 21  | Hidden treasure, grail, obelisks | 1 buried prize per map, obelisk puzzle (H1-H3)      | buried caches + obelisks + 1 buried Keystone                                           | [6.6](#66-hidden-treasure-the-grail-and-obelisks)                        |
| 22  | Quests, gates, prisons           | seer huts, quest guards, 8 key colours, prisons     | 5 object types, 6 quest kinds, 8 reward kinds, 4 key colours                           | [6.7](#67-quests-gates-and-prisons)                                      |
| 23  | Services on the map              | taverns, markets, hill fort, factories, altars      | 6 object types                                                                         | [6.8](#68-services-on-the-map)                                           |
| 24  | Teleports                        | monoliths, gates, whirlpools                        | 2 (two-way and one-way waystones)                                                      | [6.9](#69-teleports)                                                     |
| 25  | Events and sealed boxes          | event tiles, Pandora's boxes, signs                 | 3 object types                                                                         | [6.10](#610-events-sealed-boxes-and-signs)                               |
| 26  | Water objects                    | boats, shipyards, lighthouses, whirlpools, flotsam  | deferred (no boats in v0.2)                                                            | [6.11](#611-water-deferred)                                              |
| 27  | Map object types in all          | ~150+ in H3 with HotA                               | about 60: 52 core + 9 stretch                                                          | [6.12](#612-object-budget)                                               |
| 28  | Town buildings                   | ~20-30 per town                                     | ~25 per faction (the tavern is free)                                                   | [7.1](#71-building-tree)                                                 |
| 29  | Creature upgrades                | 7 per town (H3); none (H4)                          | 3 Drills per faction (ability upgrades, no new sprite)                                 | [7.2](#72-dwellings-and-upgrades)                                        |
| 30  | Town specials and grail building | 1-3 specials + 1 grail building per town (H3)       | 2 specials + 1 Keystone Hall per faction                                               | [7.3](#73-town-specials-and-the-grail-building)                          |
| 31  | Fortifications and siege         | fort, citadel, castle; walls, towers, catapult      | 3 fort levels: +2/+4/+6 Defense, a scheduled tower shot at level 3; no walls           | [7.4](#74-fort-citadel-castle-and-siege)                                 |
| 32  | War machines                     | 4-5 (H3)                                            | deferred (none in RULES_V2)                                                            | [7.5](#75-war-machines)                                                  |
| 33  | Morale and luck                  | random extra turn or freeze; random double damage   | Army Morale and Luck -3 to +3, placed as Heartened, Shaken, Lucky, Jinxed (RULES_V2 6) | [2](#2-randomness-and-our-deterministic-rules), [8](#8-battle-mechanics) |
| 34  | Battle mechanics                 | retaliation, flying, ranged penalties, terrain      | 13 adopted rules, ~30 ability keywords; terrain laws deferred                          | [8](#8-battle-mechanics)                                                 |
| 35  | Victory and loss conditions      | 13 victory, 3 loss (H3 with HotA)                   | elimination + 2 scenario victories; elimination loss                                   | [9.1](#91-victory-and-loss-conditions)                                   |
| 36  | Map sizes and underground        | 36-144 (H2-H3), to 252 (HotA); underground (H3, H4) | S 36, M 48, L 72; two named maps; no underground                                       | [9.2](#92-map-sizes-and-the-underground)                                 |
| 37  | Weekly events                    | random "week of" creature and plague events         | none in v0.2                                                                           | [2](#2-randomness-and-our-deterministic-rules)                           |

## 2. Randomness and our deterministic rules

Our battles are exact ([GAME_DESIGN.md section 9](GAME_DESIGN.md#9-battle-rules-deterministic)):
every number shown is the number used. The Heroes series uses chance in many
places. Three rules cover all of them:

1. **Inside a battle, nothing is rolled.** A chance becomes a threshold, a
   count, a period or a player choice, or it is dropped.
2. **On the map, chance is fixed at map generation** by the map seed and
   shown on hover, as the MVP already does for pickups
   ([ECONOMY.md section 5](ECONOMY.md#5-pickups)). A few objects are
   deliberately _sealed_: their contents are fixed by the seed but hidden until
   opened (section 6.10). Hidden is allowed; random at the moment of play is
   not.
3. **Offers stay seeded and visible.** Level-up offers, feat drafts, vault
   drafts and tavern heroes are drawn from the seed and shown before the player
   commits. They are choices, not rolls.

| Heroes mechanic                                                    | What it does in Heroes                                                                                                                                       | Our rule                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Morale** (H1-H4)                                                 | -3 to +3. In H3 good morale gives a stack an extra action with chance 1/24, 1/12 or 1/8; bad morale freezes it, 1/12 to 1/4. Undead and golems are always 0. | RULES_V2 6: the army's Morale is the sum of visible sources, clamped to -3 to +3. At battle start, Morale +n makes the n strongest eligible stacks **Heartened** (Accord boon: the side may end it after the bearer's turn for an extra turn); -n makes them **Shaken** (Hush bane, clock 2: acts last and cannot Wait). Creature tags keep undead and constructs from bearing either. |
| **Luck** (H1-H4)                                                   | -3 to +3. In H3 good luck doubles a strike with chance 1/24 to 1/8; HotA adds bad luck that halves damage.                                                   | RULES_V2 6: Luck +n makes the n strongest eligible stacks **Lucky** (Bloom boon: the next melee attack or shot is x150%, then it ends); -n makes them **Jinxed** (Hush bane, clock 3: cannot retaliate, Strikes against it x125%). All four are ordinary conditions that can be moved, shared or burnt.                                                                                |
| Damage ranges (H1-H3)                                              | A creature deals, for example, 2-7 damage                                                                                                                    | Already fixed damage (MVP).                                                                                                                                                                                                                                                                                                                                                            |
| Magic resistance, spell immunity chances                           | A stack ignores a spell with some chance                                                                                                                     | A **gate** (concept appendix): a visible threshold, such as "only stacks of fewer than 20 creatures". At most two named-condition immunities per creature tag.                                                                                                                                                                                                                         |
| Chance-based creature abilities (death blow, curse, blind, dispel) | A strike has a percentage chance to do something extra                                                                                                       | Periodic or first-time: "the first Strike each battle", "every third Strike", or "Strikes against a stack below the gate".                                                                                                                                                                                                                                                             |
| Creature bank guards (H3)                                          | Each bank rolls one of several guard and reward tiers                                                                                                        | Size fixed by the seed, shown on hover with its reward.                                                                                                                                                                                                                                                                                                                                |
| Treasure contents, random artifacts, random dwellings              | Rolled at map start or when visited                                                                                                                          | Fixed by the seed; shown on hover, except sealed objects.                                                                                                                                                                                                                                                                                                                              |
| Windmill and similar weekly producers                              | A random resource each week                                                                                                                                  | A seeded weekly schedule, shown on hover ("this week: 4 ore; next: 3 essence").                                                                                                                                                                                                                                                                                                        |
| Mage guild spells, tavern heroes, black-market stock               | Random per town and per week                                                                                                                                 | Seeded; visible from day 1 (guild, RULES_V2 2.9) or for the current week (tavern offers, RULES_V2 5.4; Tollhouse stock).                                                                                                                                                                                                                                                               |
| Week and month events (H2, H3)                                     | A random creature gets bonus growth; rarely a plague halves growth                                                                                           | None in v0.2 (RULES_V2 5.1 has no week events). If added later: announced a week ahead, never destructive.                                                                                                                                                                                                                                                                             |
| Neutral stacks that join or flee (H3)                              | Depends on Diplomacy, army strength and chance                                                                                                               | Neutrals never join or flee in v0.2 (RULES_V2 5.7). Strays are hired at huts; the Parley spell and a journey skill stand a guard aside.                                                                                                                                                                                                                                                |
| First Aid Tent, catapult targeting (H3)                            | Random heal amount; random wall section                                                                                                                      | No war machines or walls in v0.2 (sections 7.4, 7.5).                                                                                                                                                                                                                                                                                                                                  |
| Battlefield obstacles                                              | Random per battle                                                                                                                                            | Already chosen by the battle seed and visible before the first move (MVP).                                                                                                                                                                                                                                                                                                             |
| Level-up skill offers (H2-H4)                                      | Weighted random                                                                                                                                              | Kept: one of three, seeded per hero and level, weighted by class and the wheel (RULES_V2 3.3). Steering sites (the Hermit) let a player shape them.                                                                                                                                                                                                                                    |

Morale and luck are thus kept rather than dropped, because many Heroes kinds
of content (temples, rally sites, lucky items, Leadership, cursed items that
cost morale) depend on them. Under RULES_V2 section 6 they become four ordinary
conditions placed at the start of battle, so they obey every law of the
grammar and can be moved, shared or burnt as Fuel.

## 3. Heroes

### 3.1 Primary stats

| Game  | Primary stats                                                                                                                                                         |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1-H3 | 4: Attack, Defense, Spell Power, Knowledge. Might classes gain Attack and Defense more often, magic classes Power and Knowledge (H1 already works this way).          |
| H4    | The four-stat model is gone; heroes fight on the field, and their combat values come from level and skills such as Combat (n/s beyond the Combat skill page snippet). |

**Ours.** 4: Attack, Defense, Power (spell size), Lore (mana and page
capacity). The MVP has Attack and Defense; v0.2 adds Power and Lore. Each level
raises one stat by the class pattern (concept 6.1). Target: **4**.

### 3.2 Secondary skills

| Game | Skills                                                                                                                                                      | Ranks                                            | Slots   |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------- |
| H1   | none (one fixed class ability each)                                                                                                                         | -                                                | -       |
| H2   | 14                                                                                                                                                          | 3 (Basic, Advanced, Expert)                      | 8       |
| H3   | 28 (SoD), 30 (HotA): four magic-school skills, army skills (offence, archery, armour), journey skills (logistics, pathfinding, scouting), economy (estates) | 3                                                | 8       |
| H4   | 9 skill trees (Combat, Tactics, Scouting, Nobility and the five magic schools), each with 3 secondary skills: 36 in all                                     | 5 (Basic, Advanced, Expert, Master, Grandmaster) | 5 trees |

Examples of kinds: a skill that unlocks higher spell tiers (Wisdom), a
movement skill (Logistics), a daily gold skill (Estates), a morale skill
(Leadership), a raise-the-dead skill (Necromancy).

**Ours** (concept 6.1, RULES_V2 3.4): 24 skills, 3 ranks, a hero holds 6.
Target: **24**, in RULES_V2's three families:

| Family  | Count | Kinds (H3 analogue in brackets)                                                                                                                                                                                                       |
| ------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| School  |     5 | One per school: learnable tiers and a Power bonus, nothing else (RULES_V2 2.2; Wisdom and the four magic schools merged)                                                                                                              |
| Army    |  9-10 | Strike and Defense bonuses, shooter bonus, retaliation, aura reach, deployment (Tactics), Morale (Leadership), Luck, Command strength, start-of-battle conditions                                                                     |
| Journey |  9-10 | Movement (Logistics), rough terrain (Pathfinding), sight (Scouting), mana and its return (Intelligence, Mysticism), XP (Learning), income (Estates), hiring, guard parley (Diplomacy), scroll and artifact handling, adventure spells |

Necromancy is left out (concept decision 10: no army growth from the dead).
Each rank is one sentence in the grammar.

### 3.3 Feats and vows (ours)

The Heroes series has no draft of rule-breaking perks; the nearest are H4's
advanced-class abilities and H3's specialties. The concept adds **feats**
every third level, drawn as one of three, and **vows**, feats that narrow in
exchange for breaking a rule. Target: **40** (28 feats, 12 vows), so that a
hero who sees six or seven drafts of three meets about half the pool.

### 3.4 Hero classes

| Game | Classes                                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------- |
| H1   | 4, one per faction (Knight, Barbarian, Sorceress, Warlock), two might and two magic                                 |
| H2   | 6, one per faction                                                                                                  |
| H3   | 2 per town, might and magic: 16 (RoE), 18 (AB, SoD), more in HotA; the class sets stat odds and skill offer weights |
| H4   | A base class from the starting skill tree; combinations of skill trees promote heroes into over 40 advanced classes |

**Ours.** 2 per faction (concept 6.1), each with a stat pattern, offer
weights, the birthright and a **Command** (a once-per-battle act that is not a
spell). Target: **6 classes, 6 Commands**. H4-style promotion is deferred;
it could return as title feats.

### 3.5 Specialties

| Game | Specialties                                                                                                                                                     |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1   | none; the class ability is fixed                                                                                                                                |
| H2   | none                                                                                                                                                            |
| H3   | every hero has one, of five main types: secondary skill, spell, creature, war machine, resource (some special ones such as army speed); about 150 heroes in SoD |
| H4   | none for ordinary heroes; TGS adds a specialty hero per campaign                                                                                                |

**Ours.** 8 named heroes per faction (RULES_V2 5.4 needs at least four per
class), each with one specialty. Target: **24 heroes**, using the **5
specialty forms** of RULES_V2 3.7: creature, spell, skill, resource and
Command.

### 3.6 Levelling and experience

- **H3.** Each level raises one primary stat by the class's odds and offers
  two secondary skills (one new, one held). Wisdom and a magic school are
  guaranteed to be offered at fixed intervals if absent (n/s beyond memory).
  Experience comes from battles (the hit points of creatures killed),
  treasure chests, the Learning Stone, the Tree of Knowledge (one level),
  creature banks, Pandora's boxes, seer-hut rewards, events, the Altar of
  Sacrifice and Sirens (sacrifice part of the army).
- **H4.** Levels raise the hero's own combat values and offer skills from the
  five held trees.

**Ours.** The MVP already gives the hit points killed and a chest's 750 XP.
v0.2 offers one of three per level (a new skill or a rank) and a feat draft
every third level, about 6 or 7 per game; no hard level cap. Target: **8 XP
sources**: battles, treasure chests, the Learning Stone, the Tree of
Knowledge, creature banks and vaults, seer-hut rewards, sealed boxes and
events, and the Altar of Sacrifice (stretch).

## 4. Magic

### 4.1 Schools and tiers

| Game | Schools                                                                    | Spells                                                                                                                                        |
| ---- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| H1   | none                                                                       | Spells are memorised as charges (n/s: counts)                                                                                                 |
| H2   | none; spells cost spell points from Knowledge                              | 65 book spells in the fheroes2 source, about 13 of them adventure spells; 5 levels (one fan list shows 50 spells by level: 10, 10, 11, 11, 8) |
| H3   | 4 elements (Air, Earth, Fire, Water); 2 spells belong to all schools       | 70: 15 combat damage, 45 combat utility, 10 adventure; 15 at each of levels 1-4 and 10 at level 5; Air 18, Earth 17, Fire 16, Water 17        |
| H4   | 5 (Life, Order, Death, Chaos, Nature), each tied to a town; Might has none | Life alone lists 34 across 5 levels on one fan page (n/s: other schools)                                                                      |

Examples of kinds: direct damage, area damage, blessings and curses on a
stack, summoning, healing and resurrection, dispelling, mass versions of a
blessing, battlefield control (a wall of fire, quicksand).

**Ours.** Five schools on a wheel (concept 4.2): Bloom, Accord, Clock, Hush,
Storm. Tiers 1-5; a page is spent until the battle ends; mana is an
expedition budget. The concept's full book is about 25 per school; v0.2
ships two fifths of it. Target: **50 combat spells, 10 per school**, split by
tier 3, 3, 2, 1, 1. Each school's second-tier set includes its condition tool
(Feed, Share, Wind, Pass on, Set off; RULES_V2 2.7). Seam spells are not in
v0.2 (RULES_V2 8.3).

### 4.2 Mage guilds

- **H3.** Five guild levels; each adds spells of one tier: 5, 4, 3, 2 and 1
  spells (15 in all). Some towns stop at level 3 or 4. A guild refills the
  hero's mana overnight; a spell book costs 500 gold. Spells are drawn at
  random per town.
- **H2** has a similar five-level guild (n/s: per-level counts). **H4** guilds
  teach the town's own school.

**Ours** (RULES_V2 2.9). Five levels with 4, 3, 3, 2 and 1 spells: **13 per
town**, drawn by the seed with the faction's school weights and visible from
day 1; level 2 always holds one condition tool. A faction may cap its guild
below 5. A hero starting the day in its own guild town has full mana. A spell
a hero cannot learn gives nothing at a guild and a scroll at a shrine.

### 4.3 Adventure spells

- **H2.** About 13 (fheroes2 source): views of mines, artifacts, towns and
  heroes; summon a boat; teleport by dimension door, town gate or town portal;
  haunt a mine; set a guardian on a mine.
- **H3.** 10: two visions spells, two map views, disguise, dimension door,
  fly, town portal, summon and scuttle boat, water walk.
- **H4.** Travel spells weakened or removed (Wikipedia).

**Ours.** Target: **10, two per school**. RULES_V2 2.8 fixes the first of
each: Green Road (Bloom, forest passage), Parley (Accord, a guard stands
aside for the day), Borrowed Day (Clock, movement now, repaid tomorrow), Ask
the Dead (Hush, reveals a disc of the map) and Tow Line (Storm, travel
between visited pylons). Each is cast at most once per day per hero. The
second of each school is chosen by the catalogue bead.

### 4.4 Scrolls and other consumables

- **H2 PoL** adds a spell scroll artifact. **H3**: a spell scroll lets the
  bearer cast its spell **while carried**; it is not used up. **H4** adds
  potions, a separate consumable category drunk by heroes.

**Ours.** A scroll is a one-use page anyone can cast, with no school rank
and no mana, held in a **scroll case of 8** (RULES_V2 2.5); any book spell,
adventure spells and condition tools included, can appear as one. Target:
scrolls of **any spell** plus **12 consumable kinds**, carried in the backpack
and used on the adventure map, since nothing is worn or swapped in battle
(RULES_V2 4.1): 8 potions (for example +1 Morale or Luck until the next
battle ends, mana above the maximum once, extra movement today) and 4 other
one-use items (for example a map that names a vault's contents, a charm that
makes one guard stand aside, a lantern that reveals a disc). Consumables
count inside the artifact total. RULES_V2 does not yet define using an item
from the backpack; the content and engine beads must add that action.

## 5. Artifacts

Counts:

| Game | Artifacts                                                                                                                                                       |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1   | n/s; an ultimate artifact is found through obelisks                                                                                                             |
| H2   | 81 in the base game (8 ultimate, 73 regular), plus the spell book; PoL adds 16 and the spell scroll (fheroes2 source). Grades: treasure, minor, major, ultimate |
| H3   | 156 with HotA: treasure 40, minor 25, major 47, relic 28, combination 16 (SoD alone: 37, 21, 39, 25 and 12; relics include 2 from AB)                           |
| H4   | grades treasure, minor, major, relic, plus potions as their own category; TGS adds 16 (n/s: total)                                                              |

### 5.1 Slots

- **H3.** 14 worn slots in SoD (13 earlier: 4 miscellaneous slots instead of
  5): helmet, cape, necklace, two hands, torso, two rings, feet, 5
  miscellaneous. Five more slots hold the spell book and war machines; the
  backpack holds 64.
- **H2.** Heroes carry artifacts in a set of slots with no body positions
  (n/s: count).

**Ours** (RULES_V2 4.1): **11 worn slots** (head, neck, torso, cloak,
weapon, shield, two rings, feet and two pockets for things that are not
clothing), a **backpack of 12** (no effect while there) and a **scroll case
of 8**. Only worn artifacts act; at most one Marvel is worn.

### 5.2 Grades

| Heroes grade                | Our grade (concept 6.2)                                              |   v0.2 target |
| --------------------------- | -------------------------------------------------------------------- | ------------: |
| Treasure, minor             | **Trinket**: stat modifiers only (RULES_V2 4.2)                      |            30 |
| Major, relic                | **Wonder**: makes or uses a condition or ground, or a trigger        |            20 |
| (double-edged, cursed)      | **Cursed Wonder**: the drawback is a condition                       |             6 |
| Combination, ultimate/grail | **Marvel**: breaks one core rule; arrives in three pieces            | 4 (12 pieces) |
| Potions                     | **Consumable**, used on the map (scrolls are separate, RULES_V2 2.5) |            12 |
| **Total kinds**             |                                                                      |        **80** |

Examples of Heroes kinds: a flat +stat item, an item that adds income, one
that boosts a school's spells, one that negates a battle mechanic for both
sides, one that blocks a spell level.

### 5.3 Sets and combinations

- **H2 PoL.** The fheroes2 list holds three pieces of one hero's arms and a
  garb they combine into: the series' first assembled set.
- **H3 SoD.** 12 combination artifacts (16 in HotA), each assembled from
  three to six named pieces; the whole blocks the slots of its parts.

**Ours.** Broken **Marvels**: each arrives in three pieces spread across a
map, each piece useful alone or an awkward curse, and rumours point to the
rest (concept 3 and 6.2; RULES_V2 4.5). Target: **4 Marvels, 12 pieces**.
Trinket set bonuses are not one of the five artifact rule forms of RULES_V2
4.6, so there are no sets beyond Marvels.

### 5.4 Cursed and double-edged artifacts

- **H2.** True cursed artifacts. The fheroes2 source lists curse effects:
  a daily gold penalty, a spell-power penalty, a morale penalty, extra fire or
  cold damage taken, and refusing creatures that would join.
- **H3.** Double-edged items that switch off morale or luck for both sides;
  HotA adds items that lower the enemy's luck.

**Ours.** Cursed Wonders whose drawback is a condition the right build
turns over (the concept's Albatross and Coat of Embers). They are labelled,
worn by choice, then stuck until lifted at a site or a guild town (RULES_V2
4.3). Target: **6**.

## 6. The adventure map

### 6.1 Mines and producers

- **H2, H3.** Seven resources (gold, wood, ore, and four rare ones); one mine
  kind per resource; an abandoned mine guarded by monsters. In H3 mines and
  lighthouses share a map limit of 144. HotA adds weekly warehouses of each
  resource. Weekly producers: windmill (a resource), water wheel (gold),
  mystical garden (gems or gold).
- **H4.** The same seven resources (n/s: mine details).

**Ours.** Four resources (gold, wood, ore, essence;
[ECONOMY.md](ECONOMY.md)). Target: **5 mine kinds**: sawmill, ore pit,
essence spring, gold mine, and the haunted mine (any resource, guarded by
Hush caretakers, who stand beside it as an ordinary guard, since mines have
no garrisons in v0.2; stretch). Any player takes a flag by visiting (RULES_V2
5.6). **3 weekly
producers** (windmill, water wheel, orchard), each with a seeded schedule
shown on hover.

### 6.2 External dwellings

- **H3.** About 7 external dwellings per town type, one per tier. A hero
  recruits there (tier 1 is free); flagging a dwelling adds +1 growth to that
  creature in every owned town of its type. Tier 5-7 dwellings are guarded by
  three times their weekly growth, renewed weekly. The Golem Factory holds four
  creature types; the editor has random dwellings by level or town. HotA makes
  external stock accumulate.
- **H2.** About 12 neutral dwelling kinds in the fheroes2 object list, for
  example huts of archers, goblins, dwarves and peasants, a graveyard, a dragon
  city.
- **H4.** Caravans carry creatures from external dwellings to a town.

**Ours.** Three object types: the **faction outpost** (a native tier 1-4
creature; the flag-holder recruits its one stock with a hero on its cell,
RULES_V2 5.6), the **stray hut** (one
stray, the concept's guests near home) and the **caretaker lodge** (a
school's caretakers, recruitable after an errand). Target: **20 variants**:
12 faction outposts (tiers 1-4 of three factions) and 8 stray and caretaker
huts, plus a random-dwelling marker resolved at generation. Tier 5-6 outposts
do not exist; those creatures stay town-only. Caravans are deferred.

### 6.3 Visitable buildings by reset type

H3 with HotA has roughly 20 once-per-hero sites, about 14 weekly ones, about
25 daily or until-next-battle ones, and about 40 kinds of one-time pickup and
bank (a classification of the H3 wiki's object list; boundaries are fuzzy). H2
has about 20 per-hero sites and a handful of weekly and daily ones (fheroes2
object list).

| Reset             | Heroes kinds and examples                                                                                                                                            | Our object (target)                                                                                                                                                        | Status  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Once per hero     | **Stat shrines**: four sites, each +1 to one primary stat (H3)                                                                                                       | Stat shrine, 4 variants (Attack, Defense, Power, Lore)                                                                                                                     | core    |
| Once per hero     | **Learning Stone**: +1000 XP (H3)                                                                                                                                    | Learning stone                                                                                                                                                             | core    |
| Once per hero     | **Arena**: choose +2 Attack or +2 Defense                                                                                                                            | Arena (choose +2 of one)                                                                                                                                                   | core    |
| Once per hero     | **Library**: +2 to every stat, needs a level (H3)                                                                                                                    | Library (+1 to all four, needs level 8)                                                                                                                                    | stretch |
| Once per hero     | **Tree of Knowledge**: one level, sometimes for a price                                                                                                              | Tree of knowledge (one level; the seed sets the price)                                                                                                                     | core    |
| Once per hero     | **Schools** of war and of magic: pay for +1 stat                                                                                                                     | Academy (pay gold for +1 of a stat pair)                                                                                                                                   | stretch |
| Once per hero     | **Witch hut**: teaches one secondary skill; **University**: buy skills                                                                                               | Tutor's hut (teaches one skill, shown on hover)                                                                                                                            | core    |
| Once per hero     | **Spell shrines** of three levels teach one spell                                                                                                                    | School shrine, 3 tiers; teaches every visitor; off-school becomes a scroll (concept 3)                                                                                     | core    |
| Once per hero     | (no analogue)                                                                                                                                                        | Hermit: unteaches a skill or rerolls the next offer (concept steering)                                                                                                     | core    |
| Weekly            | **Windmill**, **water wheel**, **mystical garden**, HotA warehouses; **refugee camp** (weekly random recruit)                                                        | See 6.1 (producers); stray huts restock with the weekly growth                                                                                                             | core    |
| Until next battle | **Temple**, **oasis**, **watering hole**, **rally flag** (+morale, some +movement); **faerie ring**, **swan pond**, **mermaids** (+luck); a warrior's tomb (-morale) | Rally camp (+1 Morale), wishing well (+1 Luck), oasis (+1 Morale and +movement today), school temple (+1 Power); each lasts until the hero's next battle ends (RULES_V2 6) | core    |
| Daily             | **Magic well** (mana), **fountain of youth**, **stables** (+movement for the week, upgrades cavalry in H3)                                                           | Mana well, stables                                                                                                                                                         | core    |
| Each visit        | **Sanctuary** (heroes inside cannot be attacked)                                                                                                                     | Sanctuary                                                                                                                                                                  | stretch |
| Each visit        | **Redwood observatory**, pillar of fire (reveal an area), **cartographer** (buy the map)                                                                             | Observatory                                                                                                                                                                | stretch |
| One-time          | **Scholar** (one spell, stat or skill)                                                                                                                               | Scholar (fixed by seed, shown)                                                                                                                                             | core    |

Target: **18 visitable object types** (14 core, 4 stretch), with 4 stat
shrine and 3 shrine-tier variants. "Once per hero" is remembered per hero; a
hover says "already visited" for heroes who have been.

### 6.4 Creature banks and vaults

- **H3.** About 10 banks in SoD and 24 with HotA. Guards surround the hero's
  army in the middle of the field; each bank rolls one of several guard and
  reward tiers (larger guard, larger reward): gold, resources, artifacts,
  creatures. One-time; guards killed stay dead if the hero loses.
  Examples: a dwarven treasury, a crypt, a dragon utopia.

**Ours.** Target: **6 bank kinds** (one guarded by each school's caretakers
and one landfall wreck guarded by strays), each in **3 fixed sizes** with
guard and prize shown on hover; plus **1 drafting vault**, the deepest site,
which shows three treasures and lets the hero carry one out (concept 3).
Banks use the normal deployment of RULES_V2; H3's surrounded deployment is
not in v0.2. Guard strength follows the guard table
([GAME_DESIGN.md 8.3](GAME_DESIGN.md#83-guard-sizing)) in proportion to the
prize.

### 6.5 One-time treasure

- **H2, H3.** Treasure chest (gold or XP, rarely an artifact), campfire (gold
  and a resource), resource piles, loose artifacts and spell scrolls, a lean-to
  or wagon, a warrior's tomb (an artifact for a morale penalty), and on water
  flotsam, sea chests and shipwreck survivors.

**Ours.** Target: **6 kinds**: resource pile (4 resources), treasure chest
(gold or XP, or at the top of its ring an artifact), campfire (gold plus a
resource), loose artifact, loose scroll, and the fallen adventurer (a Wonder
for -2 Morale until the next battle ends). Water treasure is deferred with boats.

### 6.6 Hidden treasure, the grail and obelisks

- **H1.** The ultimate artifact is buried; obelisks reveal where.
- **H3.** Each obelisk visited uncovers part of a puzzle map; the completed
  puzzle shows where the Grail lies. Digging uses all of a hero's movement
  and needs a free pack slot. The Grail is built in a town as a grail
  building: +5000 gold a day, +50% growth and one town-specific power.
- **H2.** Eight ultimate artifacts exist (fheroes2 source); one is buried per
  map.

**Ours.** Target: **3 object types**: obelisks (4-8 per map, each uncovering
a part of the puzzle map), the buried **Keystone** (one per map, built into
the faction's Keystone Hall, section 7.3), and **buried caches** (3-6 per
map; a rumour from an inn or Tollhouse marks the
area; a dig costs the day's movement). Digging is a hero action available
everywhere and finds nothing where nothing lies, with no penalty beyond the
movement.

### 6.7 Quests, gates and prisons

- **H2 PoL** adds barriers and traveller's tents (the fheroes2 list); a
  sphinx asks a riddle.
- **H3 SoD.** Keymaster's tents in 8 colours open border guards (and border
  gates). A seer's hut sets a quest: bring an artifact, creatures or
  resources, reach a level or primary stats, defeat a hero or monster, belong
  to a colour (HotA adds a class quest); and pays XP, mana, morale, luck,
  resources, stats, a skill, an artifact, a spell or creatures. A quest guard
  blocks a path until its quest is done. A prison holds a hero who joins the
  player who frees it.

**Ours.** Target: **5 object types**: keymaster's tent, border gate, seer
hut, quest gate, prison. **4 key colours** are enough for a maze map.
**6 quest kinds** (bring an artifact, bring creatures, bring resources, reach
a level, defeat a named guard, visit a site) and **8 reward kinds** (XP,
gold, a resource, a stat, a skill rank, an artifact, a spell or scroll,
creatures). The caretakers' errands (concept 3) are seer-hut quests.

### 6.8 Services on the map

| Heroes service                                                                    | Ours                                                                                              | Status  |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------- |
| Tavern: hire heroes, hear rumours, the thieves' guild (H2-H3; map tavern in HotA) | Roadside inn: sells a rumour (hiring stays in towns, RULES_V2 5.4)                                | stretch |
| Trading post (resource trade, rates as a marketplace)                             | Trading post                                                                                      | core    |
| Black market (H3: seeded artifacts for sale); freelancer's guild (sell creatures) | **Tollhouse** (concept): buy one of 3 seeded artifacts or scrolls, trade a scroll, sell creatures | core    |
| Hill fort: upgrade creatures for a price (H3)                                     | Drill yard: applies a faction Drill (section 7.2) for gold                                        | core    |
| (no direct Heroes analogue)                                                       | Curse-lifter's shrine: lifts a worn cursed artifact for 1000 gold and 2 essence (RULES_V2 4.3)    | core    |
| Altar of sacrifice: artifacts or creatures for XP (H3)                            | Altar of sacrifice                                                                                | stretch |
| Lighthouse, shipyard (H2-H3)                                                      | deferred (section 6.11)                                                                           | -       |

Target: **6 object types** (4 core, 2 stretch; the observatory is counted in
6.3). The curse-lifter replaces the war machine factory, since war machines
are deferred.

### 6.9 Teleports

- **H2.** Stone liths and whirlpools. **H3.** One-way and two-way monoliths,
  subterranean gates between surface and underground, whirlpools at sea
  (which cost the hero creatures); HotA adds two-way portals and town gates.

**Ours.** Target: **2**: two-way waystones in coloured pairs and one-way
waystones (stretch). Subterranean gates wait for the underground, whirlpools
for boats. The Storm adventure spell rides between visited pylons, a third
kind of travel.

### 6.10 Events, sealed boxes and signs

- **H3.** An event tile fires once (or for each player, or for AI too) and
  can grant or take anything; Pandora's box holds editor-set contents, often
  guarded; signs carry text. H2 has signs, bottles and events.

**Ours.** Target: **3**: event tile (map-authored), **sealed box** (contents
fixed by the seed, hidden until opened; a guard inside is shown as "a
fight", its size hidden; the battle itself is exact and fully shown once it
starts) and sign (stretch).

### 6.11 Water (deferred)

H2 and H3 have boats, shipyards, lighthouses (faster sailing), whirlpools,
sea treasure (flotsam, sea chests, barrels, survivors) and sea banks. v0.2
maps are land mazes, where water is impassable scenery; all water objects
wait for a later version. This keeps pathing, the AI and two maps buildable.

### 6.12 Object budget

| Group                        |   Core | Stretch |
| ---------------------------- | -----: | ------: |
| Mines and weekly producers   |      7 |       1 |
| External dwellings           |      3 |       0 |
| Visitable buildings (6.3)    |     14 |       4 |
| Banks and the drafting vault |      7 |       0 |
| One-time treasure            |      6 |       0 |
| Hidden treasure and obelisks |      3 |       0 |
| Quests, gates, prisons       |      5 |       0 |
| Services                     |      4 |       2 |
| Teleports                    |      1 |       1 |
| Events, sealed boxes, signs  |      2 |       1 |
| **Total**                    | **52** |   **9** |

About 60 object types (61), 52 of them core. This is above the "about 45" the
catalogue bead estimated, because the user asked for "lots" and a maze map
needs many reasons to turn each corner; the 9 stretch types are cut first.
Every object needs a value for the guard table.

## 7. Towns

### 7.1 Building tree

| Game | Towns                                                                                                                                                                                                                                                |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1   | 4 town types                                                                                                                                                                                                                                         |
| H2   | 6; six creature dwellings each, some upgradable, a five-level guild, a castle, tavern, marketplace, shipyard and faction specials                                                                                                                    |
| H3   | 8 (RoE), 9 (AB, SoD), more in HotA. Hall chain (village hall to capitol), fort chain, tavern, marketplace, resource silo, blacksmith, guild, shipyard, 7 dwellings with upgrades, horde buildings, specials, the grail building. One building a day. |
| H4   | 6; four creature tiers; above tier 1 each tier has two dwellings and building one excludes the other; growth is daily; no upgrades                                                                                                                   |

**Ours.** Target: **about 25 buildings per faction**: hall chain 3, fort
chain 3 (mapped to fort levels 1-3), marketplace, resource silo, guild 5 (or
capped lower), dwellings 6, Drills 3, specials 2, Keystone Hall 1. Every town
has a Tavern from the start without building (RULES_V2 5.4). One building a
day. H4's
either-or dwelling choice is a good idea for later, not v0.2.

### 7.2 Dwellings and upgrades

- **H3.** Every tier has an upgraded form with better stats and often a new
  ability, bought in town or at a hill fort; horde buildings add growth.
- **H4.** No upgrades; a choice between two dwellings per tier.

**Ours.** Six native tiers per faction (bzc.5). Upgrades would double unit
art, so v0.2 uses **Drills**: a town building that gives one native tier a
second ability, with no new sprite (an insignia or tint at most). Target:
**3 Drills per faction, 9 in all**, also sold at the drill yard on the map.

### 7.3 Town specials and the grail building

- **H3.** Each town has 1-3 special buildings (extra income, a mana vortex, a
  creature-trading post, defence bonuses) and a grail building with general
  bonuses plus one town-specific power (for example +2 morale for its owner,
  the whole map revealed, +20 Attack for the defending hero).

**Ours.** Target: **2 specials per faction** (one economic, one that
expresses the birthright) and **1 Keystone Hall** per faction, built from
the Keystone: +gold, +growth and one faction power. The concept's five
engines and their capstones are not in v0.2 (RULES_V2 8.3).

### 7.4 Fort, citadel, castle and siege

- **H3.** A fort gives walls and a moat; a citadel adds a keep tower and +50%
  growth; a castle adds two more towers and another +50% (growth doubled). A
  catapult, which every hero has, breaks walls; only a town with a fort is
  besieged. Neutral towns with a fort are reinforced more often.

**Ours** (RULES_V2 5.5). **3 fort levels**, mapped from faction buildings:
+2, +4 and +6 Defense for every defending stack, and at level 3 a **tower**,
a scheduled event at each round start that deals Harm 20 + 10 x (dwellings
built) to the strongest attacking stack. There are no walls, gates or siege
engines in v0.2. A hero in the town is fought first, then the garrison. Fort
levels do not change growth.

### 7.5 War machines

- **H3.** Ballista (a shooter), ammo cart (unlimited shots), first aid tent
  (heals), catapult (sieges; every hero has one) and in HotA a cannon. Bought
  at a town blacksmith or a war machine factory; boosted by the Artillery,
  First Aid and Ballistics skills.

**Ours.** Deferred. RULES_V2 has no war machines and no siege engines, so
v0.2 has none, no forge building and no factory site. If they return, the
natural form is a stack that does not move (a battery, an aid wagon).

## 8. Battle mechanics

| Mechanic              | In Heroes                                                                                                                                           | Ours in v0.2                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Morale                | See section 2                                                                                                                                       | RULES_V2 6: Heartened and Shaken. Sources: an army skill, Trinkets (+1), map sites (until the next battle ends), creature abilities.    |
| Luck                  | See section 2                                                                                                                                       | RULES_V2 6: Lucky and Jinxed. Sources: an army skill, Trinkets (+1), map sites, creature abilities.                                     |
| Retaliation           | Once per round (H3); some creatures retaliate without limit or strike without retaliation; H4 retaliation is simultaneous and shooters answer shots | Kept (MVP): once per round. Ability keywords: Unanswered (no retaliation against it), Tireless (unlimited retaliation).                 |
| Flying                | Ignores obstacles and stacks while moving                                                                                                           | Not in RULES_V2. A creature may get a similar move through the teleport verb (RULES_V2 1.7) within its Speed; plain flying is deferred. |
| Ranged penalties      | H3: half damage beyond 10 hexes and in melee; a shooter next to an enemy cannot shoot; H4: line of sight                                            | As RULES_V2 1.8 and the MVP: half damage in melee, no shooting when adjacent. No distance penalty and no line of sight in v0.2.         |
| Obstacles             | Terrain-themed, random per battle                                                                                                                   | Seeded per battle (MVP). Ground features from the grammar (fire, ice, corpses) sit on hexes alongside.                                  |
| Native terrain        | H3: +1 Attack, +1 Defense, +1 Speed on native terrain; natives ignore its movement penalty on the map                                               | Map movement only: the class's native terrain costs 100 per step (RULES_V2 3.6, 3.9). No battle bonus in v0.2.                          |
| Special battlefields  | H3: grounds that change rules (cursed ground cancels morale and luck)                                                                               | **Terrain laws** (concept 3): deferred; RULES_V2 1.12 ships none in v0.2 but keeps an empty list for later maps.                        |
| Large creatures       | Two-hex creatures (H2, H3)                                                                                                                          | Deferred: all units occupy one hex (MVP).                                                                                               |
| Creature spellcasters | Some creatures cast spells                                                                                                                          | Creature casters cast pages from the book once per battle (concept 4.3).                                                                |
| Tactics phase         | The Tactics skill lets a side rearrange before battle                                                                                               | Kept as an army skill: rearrange within the first 2-3 columns.                                                                          |
| Retreat and surrender | Retreat loses the army and keeps the hero; surrender pays gold                                                                                      | Retreat as RULES_V2 1.12; no surrender in v0.2.                                                                                         |
| Siege                 | Walls, towers, gate, catapult                                                                                                                       | Fort bonus and tower shot only (section 7.4).                                                                                           |
| Hero casting          | One spell per round (H3); heroes on the field (H4)                                                                                                  | One page per round, off the field (concept 4.3).                                                                                        |
| Auto-combat           | Available                                                                                                                                           | Kept, exact (MVP).                                                                                                                      |
| Battle length         | No limit in H3                                                                                                                                      | 30 rounds, then the defender wins (RULES_V2 1.12).                                                                                      |

Target: **13 adopted rules** (morale, luck, retaliation, ranged in melee,
obstacles, native terrain on the map, creature casters, deployment through a
skill, retreat, fort, hero casting, auto-combat, the round limit), all exactly
as RULES_V2 states them, and about **30 creature ability keywords** shared
across the 18 native creatures and about 20 strays and caretakers. Flying,
large creatures, distance penalties, terrain laws and surrender are
deferred.

## 9. Scenarios

### 9.1 Victory and loss conditions

- **H3** (with HotA). Standard: take every enemy town and defeat every enemy
  hero; a player who holds no town for seven days, or loses the last hero
  without a town, loses. Special victories: acquire an artifact, accumulate
  creatures, accumulate a resource, upgrade a town's hall and fort, build the
  grail, defeat a hero, capture a town, defeat a monster, flag all
  dwellings, flag all mines, carry an artifact to a town; HotA adds defeat all
  monsters and survive until a date. Special losses: lose a hero, lose a town,
  time runs out.
- **H1** already has special victories such as gathering gold or finding an
  artifact.

**Ours** (RULES_V2 5.9). Victory: the human is the only player not
eliminated; a map may add **one** extra victory from a fixed list of two:
capture a named town (the MVP's Warlord's Hold) or hold a named artifact.
Loss: the human is eliminated (no town and no hero, or seven days without a
town). The default maps use only elimination. Other Heroes conditions (defeat
a hero, gather gold, build the grail building, time limits, losing a named
hero) are deferred.

### 9.2 Map sizes and the underground

- **H2, H3.** Small 36, medium 72, large 108, extra large 144 tiles a side;
  HotA adds 180, 216 and 252. H3 and H4 maps may have an underground level
  joined by gates.
- Ours today: S 36, M 48, L 72 (`src/core/map/gen/config.ts`).

**Ours.** Sizes stay S 36, M 48 and L 72; no new size. The two v0.2 maps are
dense and maze-like and use these sizes (L for the larger). **No
underground** in v0.2: it doubles the map work and the AI's pathing for
little gain on maps this size.

## 10. Decisions made here

One line each, for the orchestrator to confirm or overrule:

1. Morale and luck are kept as RULES_V2 section 6 conditions (Heartened,
   Shaken, Lucky, Jinxed), not dropped.
2. Map-time chance is fixed by the seed and shown; only sealed boxes hide it.
3. No week events in v0.2.
4. No boats, water objects or underground in v0.2.
5. Creature upgrades become Drills (an ability, no new sprite).
6. War machines and siege walls are deferred (RULES_V2 5.5).
7. Spell scrolls are one use (unlike H3's carried scrolls), as RULES_V2 2.5.
8. Map object target is about 60 types (52 core), above the catalogue bead's
   estimate of 45.
9. Necromancy and H4-style class promotion are left out of v0.2.
10. Tier 5-6 creatures have no external dwellings.

## 11. Sources

Fetched or searched on 2026-11-24.

- Heroes 3 wiki (heroes.thelazy.net):
  [Secondary skill](https://heroes.thelazy.net/index.php/Secondary_skill),
  [Artifact](https://heroes.thelazy.net/index.php/Artifact),
  [Spells](https://heroes.thelazy.net/index.php/Spells),
  [Mage Guild](https://heroes.thelazy.net/index.php/Mage_Guild),
  [Creature bank](https://heroes.thelazy.net/index.php/Creature_bank),
  [List of adventure map objects](https://heroes.thelazy.net/index.php/List_of_adventure_map_objects),
  [Morale](https://heroes.thelazy.net/index.php/Morale),
  [Luck](https://heroes.thelazy.net/index.php/Luck),
  [Victory conditions](https://heroes.thelazy.net/index.php/Victory_conditions),
  [Grail](https://heroes.thelazy.net/index.php/Grail),
  [Town](https://heroes.thelazy.net/index.php/Town),
  [Creature dwelling](https://heroes.thelazy.net/index.php/Creature_dwelling),
  [Specialty](https://heroes.thelazy.net/index.php/Specialty),
  [War machine](https://heroes.thelazy.net/index.php/War_machine),
  [Native terrain](https://heroes.thelazy.net/index.php/Native_terrain),
  [Ranged attack](https://heroes.thelazy.net/index.php/Ranged_attack).
- Wikipedia:
  [Heroes of Might and Magic (1995)](https://en.wikipedia.org/wiki/Heroes_of_Might_and_Magic:_A_Strategic_Quest),
  [Heroes of Might and Magic II](https://en.wikipedia.org/wiki/Heroes_of_Might_and_Magic_II),
  [Heroes of Might and Magic IV](https://en.wikipedia.org/wiki/Heroes_of_Might_and_Magic_IV).
- fheroes2, the open-source Heroes II engine (counts taken from its
  definitions):
  [artifact.h](https://github.com/ihhub/fheroes2/blob/master/src/fheroes2/resource/artifact.h),
  [artifact_info.h](https://github.com/ihhub/fheroes2/blob/master/src/fheroes2/resource/artifact_info.h),
  [spell.h](https://github.com/ihhub/fheroes2/blob/master/src/fheroes2/spell/spell.h),
  [mp2.h](https://github.com/ihhub/fheroes2/blob/master/src/fheroes2/maps/mp2.h).
- Heroes II spells by level:
  [RPGClassics HoMM2 spells](https://tartarus.rpgclassics.com/hmm2/spells.php).
- Heroes II secondary skills (14, eight slots), from search results citing the
  [Heroes II manual](https://manualmachine.com/gamespc/heroesofmightandmagicii/1118154-user-manual)
  and the [Might and Magic wiki](https://mightandmagic.fandom.com/wiki/Heroes_of_Might_and_Magic_II:_The_Succession_Wars).
- Heroes IV: five skill ranks and skill trees from search results citing the
  [Might and Magic wiki, Combat skill](<https://mightandmagic.fandom.com/wiki/Combat_(skill)>);
  Life magic counts from [Celestial Heavens](https://celestialheavens.com/378);
  potions as an artifact category from Celestial Heavens via search.

**Not sourced** (written from general knowledge, marked n/s above, or left
without a count): H1 spell counts, artifact count, slots and map sizes; H2
artifact slot layout and guild per-level counts; H4 total artifacts and
potions, spells per school other than Life, base class count, mines and war
machines; H3 levelling details (guaranteed Wisdom and school offers) and the
exact once-per-hero and weekly counts, which are a classification of the
object list rather than a figure the wiki states.
