# Content: strays and caretakers

Status: content for v0.2 (bead `border_marches-bzc.6`, 2026-11-24).

The neutral roster of v0.2: 21 strays and caretakers, and 2
creatures that exist only as summons. They replace the MVP's neutral
monsters as guards (the goblins and undead of GAME_DESIGN 8.1 become
factions) and are the guests a hero can hire.
[RULES_V2.md](RULES_V2.md) and [GAME_DESIGN.md](GAME_DESIGN.md) section 8
govern. Condition kinds are defined in [CONTENT_SPELLS.md](CONTENT_SPELLS.md). Faction
creatures are not in this document.

## 1. Stats

Stats are on the scale of GAME_DESIGN 8.1. FV is the fight value of
GAME_DESIGN 8.2 and is each creature's value for guard sizing. "Leaves"
is the remains tag; "Cannot bear" lists at most two condition kinds
(RULES_V2 1.2). Every creature occupies one hex. Neutral guards have no
birthright and no hero.

| Creature            | Tier | Kind               | HP  | Atk | Def | Dmg | Speed | Shots | FV   | Leaves  | Cannot bear       |
| ------------------- | ---- | ------------------ | --- | --- | --- | --- | ----- | ----- | ---- | ------- | ----------------- |
| **Bellhop**         | 1    | Stray              | 7   | 3   | 4   | 1   | 6     | -     | 36   | wreck   | Heartened, Shaken |
| **Whipping Boy**    | 1    | Stray              | 14  | 2   | 3   | 1   | 5     | -     | 47   | corpse  | -                 |
| **Gremlin**         | 1    | Stray              | 6   | 5   | 2   | 2   | 7     | -     | 47   | corpse  | -                 |
| **Lamplighter**     | 1    | Stray              | 9   | 4   | 3   | 2   | 4     | -     | 57   | corpse  | -                 |
| **Newsie**          | 1    | Stray              | 6   | 4   | 2   | 2   | 5     | 6     | 56   | corpse  | -                 |
| **Notary**          | 2    | Caretaker (Accord) | 16  | 5   | 6   | 3   | 5     | -     | 107  | nothing | Heartened, Shaken |
| **Crooner**         | 2    | Stray              | 12  | 6   | 3   | 3   | 5     | 8     | 109  | corpse  | -                 |
| **Bog Leech**       | 2    | Stray              | 15  | 7   | 4   | 3   | 6     | -     | 104  | nothing | -                 |
| **Loan Shark**      | 2    | Stray              | 14  | 6   | 5   | 4   | 5     | -     | 116  | corpse  | -                 |
| **Winder**          | 3    | Caretaker (Clock)  | 26  | 8   | 8   | 5   | 5     | -     | 205  | wreck   | Heartened, Shaken |
| **Groundskeeper**   | 3    | Caretaker (Bloom)  | 32  | 7   | 9   | 5   | 4     | -     | 228  | nothing | -                 |
| **Rigger**          | 3    | Caretaker (Storm)  | 22  | 9   | 5   | 5   | 6     | 6     | 223  | corpse  | -                 |
| **Gumshoe**         | 3    | Stray              | 24  | 9   | 6   | 6   | 5     | 8     | 263  | corpse  | -                 |
| **Deep-Sea Diver**  | 3    | Stray              | 34  | 8   | 10  | 6   | 3     | -     | 271  | wreck   | -                 |
| **Sexton**          | 4    | Caretaker (Hush)   | 45  | 10  | 10  | 9   | 5     | -     | 402  | nothing | -                 |
| **Lagoon Lurker**   | 4    | Stray              | 55  | 12  | 8   | 10  | 5     | -     | 469  | corpse  | -                 |
| **Fire-Eater**      | 4    | Stray              | 44  | 11  | 8   | 9   | 5     | -     | 388  | corpse  | Burning           |
| **Rime Walrus**     | 5    | Stray              | 95  | 13  | 13  | 15  | 4     | -     | 868  | corpse  | Frozen            |
| **Tin Titan**       | 5    | Stray              | 100 | 14  | 14  | 14  | 4     | -     | 898  | wreck   | Heartened, Shaken |
| **Prize Pumpkin**   | 5    | Stray              | 85  | 12  | 12  | 14  | 4     | -     | 759  | nothing | -                 |
| **Beanstalk Giant** | 6    | Stray              | 160 | 17  | 14  | 28  | 5     | -     | 1707 | corpse  | -                 |

## 2. Abilities

One ability each, one sentence in the grammar. "Instead of attacking"
means the ability is the stack's action for that turn and it may move
first. Counts are read when the ability is used.

| Creature            | Ability             | Rule                                                                                                                                                                                                                                 | Kinds                         |
| ------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| **Bellhop**         | **Carry**           | Once per battle, instead of attacking, it moves one condition from a stack adjacent to it to another stack adjacent to it (landing rules apply; a refused condition stays).                                                          | -                             |
| **Whipping Boy**    | **Takes the Blame** | Once per battle, instead of attacking, an adjacent friendly stack gains a Scapegoat link to the Whipping Boys, clock 3.                                                                                                              | makes Scapegoat               |
| **Gremlin**         | **Sabotage**        | Its melee Strike adds Hushed, clock 2.                                                                                                                                                                                               | makes Hushed                  |
| **Lamplighter**     | **Light Up**        | Its Strikes are x 150% against a stack that bears Burning or stands in fire.                                                                                                                                                         | uses Burning, fire            |
| **Newsie**          | **Extra!**          | Once per battle, instead of attacking, every friendly stack adjacent to it gains Quickened 2, clock 2.                                                                                                                               | makes Quickened               |
| **Notary**          | **Stamp**           | Once per battle, instead of attacking, an adjacent enemy stack gains Turned, clock 1, gate 15 x the Notaries' count in HP, doubled against a Mollified stack.                                                                        | makes Turned; uses Mollified  |
| **Crooner**         | **Croon**           | Its shot adds Mollified 30, clock 2.                                                                                                                                                                                                 | makes Mollified               |
| **Bog Leech**       | **Latch**           | Its melee Strike adds a Leeched link from the target to the Bog Leeches, size equal to their count (at most 40), clock 2.                                                                                                            | makes Leeched                 |
| **Loan Shark**      | **Advance**         | Once per battle, instead of attacking, an adjacent stack gains Fired Up 4, clock 3, and a Reckoning of 5 x the Loan Sharks' count (at most 150), clock 3.                                                                            | makes Fired Up, Reckoning     |
| **Winder**          | **Wind Up**         | Once per battle, instead of attacking, either a stack within 3 hexes (6 if the Winders are Quickened) gains Delayed, clock 2, or one condition on an adjacent stack has its clock changed by 2 either way, exactly as the Wind tool. | makes Delayed; uses Quickened |
| **Groundskeeper**   | **Tend**            | Once per battle, instead of attacking, an adjacent stack gains Mending of size 2 x the Groundskeepers' count (at most 60) and Thorned of size equal to their count (at most 30), both clock 3.                                       | makes Mending, Thorned        |
| **Rigger**          | **Tow**             | Once per battle, instead of attacking, it pulls a stack within 6 hexes 3 hexes toward itself, or 5 if that stack is Slowed (hazards on the way apply).                                                                               | uses Slowed, fire, brambles   |
| **Gumshoe**         | **Dead to Rights**  | Its shots ignore Shielded and are x 150% against a Hushed stack.                                                                                                                                                                     | uses Shielded, Hushed         |
| **Deep-Sea Diver**  | **Pressure Suit**   | It starts each battle bearing Warded 50, clockless.                                                                                                                                                                                  | makes Warded                  |
| **Sexton**          | **Night Shift**     | Creature caster (RULES_V2 2.6): one page, Second Shift, with castPower 1, castDivisor 3 and castCap 8.                                                                                                                               | uses remains                  |
| **Lagoon Lurker**   | **Drag Under**      | Its melee Strike adds Drenched 50, clock 2.                                                                                                                                                                                          | makes Drenched                |
| **Fire-Eater**      | **Breath**          | Instead of attacking, it places fire of size equal to its count (at most 30), clock 2, on the three hexes in a straight line from it.                                                                                                | makes fire                    |
| **Rime Walrus**     | **Cold Front**      | Once per battle, instead of attacking, every enemy stack adjacent to it gains Frozen, clock 1, gate 15 x the Walruses' count in HP, doubled against a Drenched stack.                                                                | makes Frozen; uses Drenched   |
| **Tin Titan**       | **Stand Behind Me** | At its turn start every friendly stack adjacent to it gains Shielded 3, clock 2.                                                                                                                                                     | makes Shielded                |
| **Prize Pumpkin**   | **Late Bloomer**    | It starts each battle bearing Ripening 10 (maximum 90), clockless.                                                                                                                                                                   | makes Ripening                |
| **Beanstalk Giant** | **Stomp**           | After its melee Strike, every other stack adjacent to the target takes Harm equal to a quarter of that Strike's damage.                                                                                                              | -                             |

## 3. Where they live

"Ring" is the guard ring of GAME_DESIGN 8.3 in which the generator uses
the creature as a guard. A **hut** is a Stray Hut and a **lodge** a
Caretaker Lodge (CONTENT_MAP_OBJECTS 3.2); **wild** creatures only guard,
or join from a Landfall Wreck. Stock is refilled to the weekly number on
day 1 of each week and does not pile up. Hire cost is FV x 1.5, rounded
to 5 gold.

| Creature            | Terrain             | Ring | Dwelling | Weekly stock | Hire cost (gold) |
| ------------------- | ------------------- | ---- | -------- | ------------ | ---------------- |
| **Bellhop**         | Grass, Steppe       | 0-1  | hut      | 8            | 55               |
| **Whipping Boy**    | Grass, Badlands     | 0-1  | hut      | 8            | 70               |
| **Gremlin**         | Badlands, Wasteland | 0-1  | hut      | 8            | 70               |
| **Lamplighter**     | Steppe, Wasteland   | 0-1  | wild     | -            | -                |
| **Newsie**          | Grass, Steppe       | 0-1  | hut      | 8            | 85               |
| **Notary**          | Grass, Steppe       | 0-2  | lodge    | 5            | 160              |
| **Crooner**         | Grass, Jungle       | 0-2  | hut      | 5            | 165              |
| **Bog Leech**       | Jungle, Wasteland   | 0-2  | wild     | -            | -                |
| **Loan Shark**      | Steppe, Badlands    | 0-2  | hut      | 5            | 175              |
| **Winder**          | Steppe, Badlands    | 1-2  | lodge    | 3            | 310              |
| **Groundskeeper**   | Jungle, Grass       | 1-2  | lodge    | 3            | 340              |
| **Rigger**          | Badlands, Steppe    | 1-2  | lodge    | 3            | 335              |
| **Gumshoe**         | Grass, Badlands     | 1-2  | hut      | 3            | 395              |
| **Deep-Sea Diver**  | Jungle, Wasteland   | 1-2  | wild     | -            | -                |
| **Sexton**          | Wasteland, Badlands | 1-3  | lodge    | 2            | 605              |
| **Lagoon Lurker**   | Jungle, Wasteland   | 1-3  | wild     | -            | -                |
| **Fire-Eater**      | Steppe, Badlands    | 1-3  | hut      | 2            | 580              |
| **Rime Walrus**     | Steppe, Wasteland   | 2-3  | wild     | -            | -                |
| **Tin Titan**       | Badlands, Steppe    | 2-3  | wild     | -            | -                |
| **Prize Pumpkin**   | Grass, Jungle       | 2-3  | wild     | -            | -                |
| **Beanstalk Giant** | Grass, Jungle       | 3    | wild     | -            | -                |

Guards are picked from the creatures of the cell's terrain and ring, by
the count rule of GAME_DESIGN 8.3 (a count between about 5 and 50). A
caretaker guards its own school's sites wherever they stand.

**Sea.** The Bog Leech, the Deep-Sea Diver and the Lagoon Lurker are
**Swimmers** (NAVAL.md 3.1) and also guard the cells of a sea, in the
rings above (NAVAL.md 4.4). The eight sea guardians (Jellyfish to Kraken)
are in [NAVAL.md](NAVAL.md) section 4 and `src/data/sea.ts`, not in this
roster: the land fill never draws them, only the sea fill of a naval map.

## 4. Summoned creatures

Made only by spells and abilities. They are `summoned`: they leave no
remains, give no XP and vanish when the battle ends (RULES_V2 1.7).

| Creature     | Made by          | HP  | Atk | Def | Dmg | Speed | FV  | Cannot bear       | Ability                                                                      |
| ------------ | ---------------- | --- | --- | --- | --- | ----- | --- | ----------------- | ---------------------------------------------------------------------------- |
| **Seedling** | Summoned (Bloom) | 6   | 3   | 3   | 2   | 4     | 45  | -                 | **Gone to Seed**: When it dies its hex receives brambles of size 4, clock 3. |
| **Shade**    | Raised (Hush)    | 8   | 5   | 3   | 3   | 6     | 69  | Heartened, Shaken | **Fade**: When it dies its hex receives mist, clock 2.                       |

Seedlings come from Sprout; Shades from Second Shift, Everybody Up and
the Sexton. The Hermit Crab (Conch of the Deep, a Swimmer with Carapace)
is NAVAL.md 4.3's.

## 5. Decisions made here

| Decision                                                                                           | Why                                                                                          |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 21 neutral creatures: 5 of tier 1, 4 of tier 2, 5 of tier 3, 3 of tier 4, 3 of tier 5, 1 of tier 6 | Guards for every ring, with the strong verbs at low tiers as the concept asks                |
| The Notary's gate is 15 HP per Notary, and its Turned lasts the round                              | A week-one hut of 10 turns a stack of 150 HP; the gate travels with the stamp                |
| The Bellhop carries any condition, Holds included                                                  | RULES_V2 1.9 lets a Hold be moved; its gate is tested on the receiver                        |
| The Sexton is the one creature caster                                                              | Shows RULES_V2 2.6 with a single page                                                        |
| Wild strays cannot be hired from huts                                                              | Tier 5 and 6 guests come only from a Landfall Wreck, so they stay rare                       |
| Wind-up and tin creatures cannot bear Heartened or Shaken                                          | The constructs' tags of RULES_V2 6                                                           |
| The Mirror Carp of the concept is left out                                                         | "Returns the first spell cast on it" needs a redirect verb for spells that the grammar lacks |
