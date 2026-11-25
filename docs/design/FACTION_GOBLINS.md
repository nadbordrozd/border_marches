# Faction: The Goblin Horde

Status: canonical for v0.2 (bead `border_marches-bzc.5`, 2026-11-24).
Written in the terms of [RULES_V2.md](RULES_V2.md), which governs. Damage
and kills follow [GAME_DESIGN.md section 9](GAME_DESIGN.md#9-battle-rules-deterministic).
Prices shared by every faction are in
[ECONOMY.md](ECONOMY.md#6-buildings-every-town-shares).

## 1. Identity

**Genre:** sword-and-sorcery rabble: the horde that pours over the ridge on
a paperback cover, played as slapstick. Their world was a wasteland of
ruined empires and they looted it on the way out.

**Tone:** gleeful, greedy and loud. A plan is whatever the biggest one
shouted last. Friendly fire is how goblins travel. Nobody holds a grudge
for longer than it takes to land.

**In the Marches:** the Horde treats every landfall as salvage that has not
been collected yet. Goblins stop being the MVP's neutral guards and become
a faction; strays and caretakers take over guard duty (concept section 7).

| Property       | Value                                                                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Faction id     | `goblins`                                                                                                                                          |
| Native terrain | Badlands (100 per straight step instead of 125)                                                                                                    |
| Faction colour | `#5fa52a` (goblin green)                                                                                                                           |
| Hero classes   | Warlord (might), Weatherwitch (magic)                                                                                                              |
| Remains, tags  | Every Horde creature leaves `corpse`; none has an excluded condition                                                                               |
| Play style     | Throw things, mostly each other. Bombs and stomps hit everyone; natives fly clear and land on someone. The cheapest, fastest and most fragile town |

## 2. Magic

| School | Bloom | Accord | Clock | Hush | Storm |
| ------ | ----: | -----: | ----: | ---: | ----: |
| Weight |     3 |      0 |     1 |    2 |     4 |

- **Magic Guild cap: level 3.** The Horde learns tier 4 and 5 pages only in
  captured towns and at shrines, and leans on scrolls. The heaviest school
  is Storm; the level 2 condition tool is Set off, Feed, Pass on or Wind
  (never Share).
- **What the wheel gives the Horde.** Storm owns area Harm, and Launched
  turns every area page into one a goblin army can cast into its own melee.
  Storm is opposed to Accord and Clock: a Sworn link, a Challenged or a
  Delayed on the target is Fuel for a doubled blast. Bloom is allied, so a
  Storm page can Echo the Wolf Riders' Venomed.

## 3. Birthright: Launched

> **Launched.** When a native stack is caught in an area effect made by the
> side it currently fights for, it takes no damage and no condition from
> that effect and is pushed 3 hexes directly away from the effect's centre
> hex. A native standing on the centre hex is pushed 3 hexes along its row
> toward the enemy's deployment column instead.

Attachment: on Harm from its own side (RULES_V2 3.8). The rule it bends:
RULES_V2 1.10, "area effects apply to their targets".

- An **area effect** is any Strike or Harm whose rule names more than one
  hex: a Bomb, a Stomp, an area page, the Weatherwitch's Command. Every
  such rule names its centre hex.
- The push follows RULES_V2 1.7: it stops before a blocking feature, a
  stack or the edge, and hazards on the way apply.
- Sides are read live (law 4): a Turned goblin stack is Launched by the
  blasts of the side it is fighting for.
- Guests in a Horde army are not Launched. They take the blast.

## 4. Roster

| Tier | Unit         |  HP | Atk | Def | Dmg | Speed | Shots | Growth/week | Cost                       |   FV | Abilities                    |
| ---: | ------------ | --: | --: | --: | --: | ----: | ----: | ----------: | -------------------------- | ---: | ---------------------------- |
|    1 | Goblin       |   8 |   4 |   2 |   2 |     5 |     - |          20 | 40 gold                    |   52 | Cannonball                   |
|    2 | Bomb Chucker |  12 |   6 |   3 |   3 |     4 |     8 |          10 | 110 gold                   |  109 | Bomb                         |
|    3 | Wolf Rider   |  18 |   7 |   5 |   4 |     8 |     - |           8 | 190 gold                   |  136 | Worry                        |
|    4 | Boomshaman   |  28 |   7 |   6 |   6 |     5 |     - |           4 | 380 gold + 1 essence       |  214 | Caster: Thunderclap, Set off |
|    5 | Ogre         |  90 |  14 |  12 |  16 |     4 |     - |           2 | 950 gold + 3 wood          |  873 | Hurl                         |
|    6 | Orc Warboss  | 160 |  18 |  15 |  32 |     6 |     - |           1 | 2500 gold + 5 wood + 3 ore | 1896 | Stomp                        |

One week of all six dwellings: 9340 gold (prices tuned by the balance bead,
[BALANCE.md](BALANCE.md) section 5), 11 wood, 3 ore, 4 essence; fight
value 7716 on paper, before area damage, which the fight value formula does
not see. The slowest creature has Speed 4, so a full army moves 1500 a day.

Goblin, Bomb Chucker, Wolf Rider and Ogre keep their MVP neutral stats
(GAME_DESIGN 8.1); the Warboss gains 20 HP and 1 Attack and trades Warcry
for Stomp.

## 5. Abilities

| Unit         | Ability        | Exact rule                                                                                                                                                                                                                                                                                                        |
| ------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goblin       | **Cannonball** | Reaction: after the Goblins are pushed or pulled 1 or more hexes and stop adjacent to an enemy stack, they make a special Strike on the stack that stopped them, or else on the nearest adjacent enemy, at +25% for each hex they were moved (max +150%). It is not retaliated.                                   |
| Bomb Chucker | **Bomb**       | The Bomb Chuckers' shot may target any hex and is an area effect centred there: a shot Strike on the stack in that hex and a shot Strike at x 50% on every stack adjacent to it, friend or foe.                                                                                                                   |
| Wolf Rider   | **Worry**      | A stack struck by the Wolf Riders (attack or retaliation) gains Venomed, size 3, clock 2 (the MVP Venom).                                                                                                                                                                                                         |
| Boomshaman   | **Caster**     | Pages: **Thunderclap** and **Set off**. `castPower` 1, `castDivisor` 2, `castCap` 8.                                                                                                                                                                                                                              |
| Ogre         | **Hurl**       | Activated, usable every turn, in place of an attack (the Ogres may walk first): choose an adjacent stack of any side whose total HP is at most 40 x the Ogres' count. It is pushed 6 hexes directly away from the Ogres.                                                                                          |
| Orc Warboss  | **Stomp**      | The Warbosses' melee attack is an area effect centred on their own hex: the Strike on the target, and a special Strike at x 50% on every other stack adjacent to the Warbosses, friend or foe. Only the target retaliates. Bends GAME_DESIGN 9.3 (a melee attack strikes one stack). Retaliations are not Stomps. |

- **Thunderclap** is the Storm tier 1 area page at the RULES_V2 2.4 budget:
  Harm 12 + 6 P to every stack on the chosen hex and adjacent to it (4
  Boomshamans, Power 3: 30 each). **Set off** is the Storm tool (RULES_V2
  2.7). If the spell list names the tier 1 area page differently, the
  Boomshaman lists that page.
- A Bomb on a friendly Goblin stack is a legal order (law 5): it flies
  three hexes toward the enemy, unhurt.
- Hurl is a push, so a hurled stack stops before the first stack, blocking
  feature or edge in its way. Any push or pull sets off Cannonball: an
  enemy Knight's Follow Through included.

### 5.1 Drills

A Drill is bought once per player and then applies to all of that player's
stacks of the creature (ECONOMY 6.3).

| Drill building | Unit         | Ability         | Exact rule                                                                                                                       |
| -------------- | ------------ | --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Mosh Pit       | Goblin       | **Mob**         | The MVP rule: +1 Attack for each other friendly stack adjacent to the target (max +5). Applies to every Strike the Goblins make. |
| Pitch Vats     | Bomb Chucker | **Fire Pots**   | The stack on a Bomb's centre hex gains Burning with size 2 x the Bomb Chuckers' count and clock 3.                               |
| Racing Track   | Wolf Rider   | **Hit and Run** | After the Wolf Riders' melee attack and its retaliation, they may walk up to 3 hexes.                                            |

## 6. Combos

Hero: a Warlord with Attack 3 and Defense 1. Enemies are MVP neutrals: Orc
Brutes (HP 28, Atk 9, Def 6, Dmg 6) and neutral Bomb Chuckers (HP 12, Def
3).

### 6.1 Bomb the pile (Bomb, Launched, Cannonball)

Goblins A and Goblins B (12 each) stand on opposite sides of a stack of 10
Orc Brutes. Twelve enemy Bomb Chuckers stand five hexes behind the Brutes.
The Horde's own 15 Bomb Chuckers shoot the Brutes' hex.

| Step                                                      | Calculation                                         | Result                                                              |
| --------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------- |
| Bomb, centre hex                                          | A 9, D 6, M 1.15; 15 x 3 x 1.15 = 51.75             | 51: 1 kill. **Brutes 9, top 5**                                     |
| Goblins A and B are adjacent to the centre                | Launched                                            | 0 damage; each is pushed 3 hexes away from the Brutes               |
| Goblins A land beside the enemy Bomb Chuckers: Cannonball | A 7, D 3, M 1.20, +75%; 12 x 2 x 1.20 x 1.75 = 50.4 | 50: 4 kills, no retaliation. The enemy shooters can no longer shoot |
| Goblins B land three hexes back toward their own lines    | -                                                   | Out of the Brutes' reach this round                                 |

Without the combo, Goblins A attack the Brutes for 25 and the retaliation
(10 x 6 x 1.30 = 78) kills nine of them. With it, one shot deals 101 damage
to two stacks, silences the shooters and nobody is retaliated against.

### 6.2 Fastball, then the boss (Hurl, Cannonball, Stomp)

| Step                                                                                             | Calculation                                               | Result                                                        |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------- |
| Round 1. Three Ogres hurl 15 Goblins at 14 enemy Bomb Chuckers across the field                  | Limit 40 x 3 = 120 HP; the Goblins have 120               | The Goblins fly 6 hexes and stop beside the shooters          |
| Cannonball at +150%                                                                              | A 7, D 3, M 1.20; 15 x 2 x 1.20 x 2.50 = 90               | 90: **7 of 14 Bomb Chuckers die**, no retaliation, in round 1 |
| The same Goblins walking there instead                                                           | Two rounds under fire; 15 x 2 x 1.20 = 36, retaliation 18 | 3 kills for 2 dead Goblins, a round later                     |
| Round 2. Two Warbosses attack 20 Orc Brutes with a second Brute stack and 14 Goblins beside them | A 21, D 6, M 1.75; 2 x 32 x 1.75 = 112, and half that     | 112 on the target (4 kills), 56 on the other stack (2 kills)  |
| The 14 Goblins are Launched off the Warbosses into a third enemy stack of Brutes                 | A 7, D 6, M 1.05, +75%; 14 x 2 x 1.05 x 1.75 = 51.45      | 51 more, no retaliation                                       |

### 6.3 Cross-faction: a favour for the boss (guest Squires)

A Warlord hires 16 Squires at a Realm outpost (55 gold each,
[FACTION_HUMANS.md](FACTION_HUMANS.md#5-abilities): **Attend** makes an
adjacent stack Heartened, gate 20 HP per Squire).

- Gate 20 x 16 = 320; two Warbosses have exactly 320 HP. The Warbosses are
  Heartened.
- The Warbosses Stomp (112 and 56, as above), end Heartened and Stomp
  again in the same round: 224 on the target and 112 on each other stack
  beside them, for one retaliation.
- The Squires are guests: standing beside the Warbosses they would take the
  Stomp at half strength. They Attend in round 1 and then stay out of it.

The price is 880 gold of Squires and a slot. A third Warboss (480 HP)
would need 24 Squires.

## 7. Hero classes

Skill names are the kinds of [CONTENT_TAXONOMY.md](CONTENT_TAXONOMY.md)
section 3.2; the content bead fixes the final names.

| Property        | Warlord (might)                       | Weatherwitch (magic)                                 |
| --------------- | ------------------------------------- | ---------------------------------------------------- |
| Starting stats  | Attack 3, Defense 1, Power 1, Lore 1  | Attack 1, Defense 0, Power 3, Lore 2                 |
| Stat pattern    | A, D, A, P, A, D, A, L, A, P          | P, L, P, A, P, L, A, P, L, D                         |
| Starting skills | Offence 1, Logistics 1                | Storm 1, Scrollcraft 1; page: Thunderclap            |
| Starting army   | 22 Goblins, 6 Bomb Chuckers (FV 1798) | 18 Goblins, 4 Bomb Chuckers, 2 Boomshamans (FV 1800) |
| Native terrain  | Badlands                              | Badlands                                             |
| Command         | Heave-Ho                              | Kaboom                                               |

**Heave-Ho** (Warlord). Up to C + 1 times: choose a friendly stack and a
hex in a straight hex line from it; the stack is pushed 4 hexes toward that
hex. Goblins that stop beside an enemy make their Cannonball (+100% after
4 hexes).

**Kaboom** (Weatherwitch). Choose a hex. Every stack on it or adjacent to
it takes Harm 30 x C. This is an area effect centred on that hex, so
natives are Launched.

| Skill      | Warlord | Weatherwitch |     | Skill       | Warlord | Weatherwitch |
| ---------- | ------: | -----------: | --- | ----------- | ------: | -----------: |
| Bloom      |       2 |            6 |     | Fortune     |       7 |            7 |
| Accord     |       0 |            0 |     | Captaincy   |       8 |            4 |
| Clock      |       1 |            2 |     | Omens       |       3 |            6 |
| Hush       |       1 |            4 |     | Logistics   |       8 |            5 |
| Storm      |       3 |           10 |     | Pathfinding |       6 |            5 |
| Offence    |      10 |            4 |     | Scouting    |       5 |            5 |
| Armour     |       3 |            1 |     | Wellspring  |       1 |            7 |
| Archery    |       6 |            6 |     | Learning    |       2 |            4 |
| Riposte    |       3 |            1 |     | Estates     |       5 |            4 |
| Standards  |       3 |            2 |     | Mustering   |       7 |            4 |
| Tactics    |       7 |            4 |     | Parley      |       2 |            1 |
| Leadership |       4 |            2 |     | Scrollcraft |       3 |            9 |

## 8. Named heroes

| Hero                 | Class        | Specialty                                    |
| -------------------- | ------------ | -------------------------------------------- |
| Grukk Manyteeth      | Warlord      | Creature: Goblins                            |
| Big Olga Anvilfist   | Warlord      | Creature: Ogres                              |
| Skarn the Loud       | Warlord      | Command: Heave-Ho counts C one higher        |
| Nix Fingers          | Warlord      | Resource: 250 gold each day                  |
| Old Mother Squall    | Weatherwitch | Spell: Thunderclap                           |
| Zizzik Sparkwhisker  | Weatherwitch | Spell: Set off                               |
| Snagga Three-Kettles | Weatherwitch | Skill: Storm at rank 2 (in place of Storm 1) |
| Pim Powderkeg        | Weatherwitch | Creature: Bomb Chuckers                      |

## 9. Town: the Warcamp

Starts with the Village Hall, the Goblin Holes, and a Tavern. One building
per day. Costs marked "common" are in
[ECONOMY.md](ECONOMY.md#6-buildings-every-town-shares).

| Building                          | Cost                                  | Requires              | Effect                                                                                                                                |
| --------------------------------- | ------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Village, Town, City Hall          | common                                | common                | Income 500, 1000, 2000 gold a day                                                                                                     |
| Stakes                            | common (Fort 1)                       | -                     | Fort level 1; needed for the Wolf Kennels                                                                                             |
| Scrap Wall                        | common (Fort 2)                       | Stakes                | Fort level 2                                                                                                                          |
| Skull Tower                       | common (Fort 3)                       | Scrap Wall, City Hall | Fort level 3 with its tower                                                                                                           |
| Marketplace, Resource Silo        | common                                | common                | Trade; +1 wood and +1 ore a day                                                                                                       |
| Magic Guild 1 to 3                | common                                | common                | Capped at level 3                                                                                                                     |
| Tavern                            | (start)                               | -                     | Hire heroes                                                                                                                           |
| Goblin Holes (T1)                 | (start)                               | -                     | Goblins                                                                                                                               |
| Powder Shed (T2)                  | 700 gold, 8 wood                      | Goblin Holes          | Bomb Chuckers                                                                                                                         |
| Wolf Kennels (T3)                 | 1000 gold, 8 wood                     | Stakes                | Wolf Riders                                                                                                                           |
| Hex Hut (T4)                      | 1800 gold, 10 wood, 2 essence         | Powder Shed           | Boomshamans                                                                                                                           |
| Ogre Pit (T5)                     | 3500 gold, 15 wood, 5 ore             | Wolf Kennels          | Ogres                                                                                                                                 |
| Boss Tent (T6)                    | 7000 gold, 20 wood, 10 ore, 3 essence | Ogre Pit, Hex Hut     | Orc Warbosses                                                                                                                         |
| Mosh Pit (Drill)                  | 800 gold, 5 wood                      | Stakes                | Goblins gain Mob                                                                                                                      |
| Pitch Vats (Drill)                | 1000 gold, 8 wood                     | Powder Shed           | Bomb Chuckers gain Fire Pots                                                                                                          |
| Racing Track (Drill)              | 1500 gold, 10 wood                    | Wolf Kennels          | Wolf Riders gain Hit and Run                                                                                                          |
| Loot Pile (special)               | 1500 gold, 10 wood                    | Marketplace           | After each battle won by a hero of its owner, that player gains gold equal to the XP the battle gave. One Loot Pile counts per player |
| Launch Ramp (special)             | 2500 gold, 15 wood, 5 ore             | Ogre Pit              | While its owner holds it, in that player's battles a native that is Launched gains Lucky                                              |
| The Great Flinger (Keystone Hall) | the Keystone                          | City Hall             | Common Keystone effects, and every native stack in its owner's armies has Cannonball                                                  |

Every building: 45,800 gold, 179 wood, 72 ore, 13 essence (24 buildings
with the three the town starts with and the Great Flinger). The tier 6
chain (Powder Shed, Stakes, Wolf Kennels, Hex Hut, Ogre Pit, Boss Tent)
costs 16,000 gold, 76 wood, 15 ore and 5 essence: the cheapest in gold and
the hungriest for wood.

## 10. Art

| Unit         | Sprite                                             |
| ------------ | -------------------------------------------------- |
| Goblin       | Pulp Wars `goblin`                                 |
| Bomb Chucker | Pulp Wars `bomb-chucker`                           |
| Wolf Rider   | Pulp Wars `wolf-rider`                             |
| Boomshaman   | New (a goblin with a lightning rod and a bad idea) |
| Ogre         | Pulp Wars `ogre`                                   |
| Orc Warboss  | Pulp Wars `orc-warboss`                            |

`orc-brute`, `troll`, `rocket-cart` and `scrap-buggy` stay available as
neutral guards and strays. Launched and Hurl need a tumbling flight
animation; it is the faction's signature and worth the frames.

## 11. Notable calls

| Call                                                                                       | Why                                                                                                                            |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Launched also blocks conditions, and a native on the centre hex is thrown toward the enemy | "Unharmed" should mean it; bombing your own goblins forward is the first trick a player should find                            |
| Cannonball is on the tier 1 unit and scales with distance moved                            | It turns the birthright from a safety net into an attack, and gives Hurl, Heave-Ho and enemy pushes one shared payoff          |
| The Bomb always hits friend and foe                                                        | The faction's joke and its puzzle; guests in a Horde army pay for it                                                           |
| The Ogre, not the Troll, is tier 5, and it throws things                                   | Hurl works on any stack of any side under its limit, so it is also the faction's way to remove an enemy from a fight           |
| The Warboss's bent rule is an area melee attack                                            | A third source of Launched that needs no shots or mana; the Warcry aura it replaces worked against it                          |
| Guild capped at 3; Accord weight 0                                                         | The might faction of the three; its magic is creature casters, Commands and scrolls (the Weatherwitch starts with Scrollcraft) |
| The cheapest roster and tier 6 chain, with the lowest fight value on paper                 | Area damage and free Strikes are not in the fight value formula; the balance bead should watch bombs against split stacks      |
| The Loot Pile pays gold equal to battle XP                                                 | An income that rewards fighting instead of waiting; about 1100 gold in week 1 and 5000 in week 4 for one busy hero             |
| Thunderclap is named here before the spell list exists                                     | The Boomshaman and the Weatherwitch need a page; it is defined by its RULES_V2 2.4 budget                                      |

**Engine asks** (no new noun or verb): an "area effect" flag with a centre
hex on Strikes and Harm; shots that may target any hex; a reaction trigger
"after being pushed or pulled" (not in the examples of RULES_V2 1.10); a
battle-setup flag per side for Drills and town specials.
