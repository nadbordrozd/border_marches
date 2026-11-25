# Faction: The Restless (Undead)

Status: canonical for v0.2 (bead `border_marches-bzc.5`, 2026-11-24).
Written in the terms of [RULES_V2.md](RULES_V2.md), which governs. Damage
and kills follow [GAME_DESIGN.md section 9](GAME_DESIGN.md#9-battle-rules-deterministic).
Prices shared by every faction are in
[ECONOMY.md](ECONOMY.md#6-buildings-every-town-shares).

## 1. Identity

**Genre:** graveyard comedy: the creaking-door horror matinee played for
laughs. A whole churchyard county made landfall with its dead still in
residence, and nobody has told them they are finished.

**Tone:** deadpan, punctual and house-proud. The Restless hold committee
meetings, keep visiting hours and take being killed as a minor
inconvenience. Spooky the way a ghost train is spooky, never gory.

**In the Marches:** the Hush engine exists to let finished things end, and
the Restless are its largest unfinished business. The Sextons keep sending
polite reminders. The Restless keep getting up.

| Property       | Value                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Faction id     | `undead`                                                                                                                                         |
| Native terrain | Wasteland (100 per straight step instead of 150)                                                                                                 |
| Faction colour | `#7a4fb5` (shroud violet)                                                                                                                        |
| Hero classes   | Revenant (might), Mortician (magic)                                                                                                              |
| Tags           | Every Restless creature cannot bear Heartened or Shaken (RULES_V2 6). Remains are in the roster                                                  |
| Play style     | Lose the opening on purpose. Skeletons die and leave bones; bones feed Banshees, Ghouls and the King; banes pile up until the Late King collects |

## 2. Magic

| School | Bloom | Accord | Clock | Hush | Storm |
| ------ | ----: | -----: | ----: | ---: | ----: |
| Weight |     0 |      1 |     3 |    4 |     2 |

- **Magic Guild cap: level 5.** The heaviest school is Hush; the level 2
  condition tool is Pass on, Wind, Set off or Share (never Feed).
- **What the wheel gives the Restless.** Hush is opposed to Bloom and
  Accord. The Ghouls' Grave Rot (Venomed, a Bloom bane) is home-made Fuel
  on an enemy stack, and every Sworn link on a Realm stack is Fuel too.
  Clock pages Echo the Shaken and Jinxed the faction hands out.

## 3. Birthright: Not Done Yet

> **Not Done Yet.** When a native stack that is not summoned dies and its
> death leaves remains, an event is scheduled for the start of the next
> round: the stack **gets up**. It keeps its id and reappears on its remains,
> which are consumed (on the nearest free hex if a stack stands there), with
> ceil(`initialCount` / 3) creatures at full HP and no conditions. Once per
> stack per battle. If the remains are used or replaced before the event
> fires, the event is cancelled.

Attachment: on a native's death (RULES_V2 3.8). The rule it bends: RULES_V2
1.10, "a stack that dies is removed at once".

- The event is drawn on the timeline with its count ("Skeletons get up: 4").
- A risen stack joins the queue of the round it returns in. Shots left and
  once-per-battle uses stay as they were when it died.
- **It crumbles when the battle ends** (RULES_V2 1.12). Getting up wins
  fights; it never saves creatures. Its creatures give the enemy no XP a
  second time.
- A stack that leaves `nothing` never gets up. Fire, a Feast or any rule
  that uses or replaces the remains denies the return: this is the counter.

## 4. Roster

| Tier | Unit        |  HP | Atk | Def | Dmg | Speed | Shots | Growth/week | Cost                          |   FV | Remains   | Abilities                             |
| ---: | ----------- | --: | --: | --: | --: | ----: | ----: | ----------: | ----------------------------- | ---: | --------- | ------------------------------------- |
|    1 | Skeleton    |   9 |   5 |   4 |   2 |     4 |     - |          15 | 45 gold                       |   62 | `bones`   | Bony                                  |
|    2 | Ghoul       |  16 |   6 |   5 |   3 |     6 |     - |           9 | 115 gold                      |  107 | `corpse`  | Feast                                 |
|    3 | Banshee     |  20 |   7 |   5 |   5 |     5 |     6 |           6 | 260 gold                      |  200 | `nothing` | Wail, Keen                            |
|    4 | Gravecaller |  32 |   8 |   7 |   6 |     4 |     - |           4 | 420 gold + 1 essence          |  242 | `corpse`  | Caster: Second Shift, Pass on         |
|    5 | Vampire     |  70 |  14 |  13 |  14 |     8 |     - |           2 | 1200 gold + 1 essence         |  736 | `corpse`  | Drain, Mist                           |
|    6 | Late King   | 170 |  19 |  18 |  34 |     6 |     - |           1 | 3000 gold + 2 ore + 3 essence | 2167 | `bones`   | Long Live the King, Royal Displeasure |

One week of all six dwellings: 10,750 gold (prices tuned by the balance
bead, [BALANCE.md](BALANCE.md) section 5), 2 ore, 9 essence; fight value
7700, the lowest of the three on purpose (Not Done Yet returns a third of
each lost stack inside the fight). The slowest creature has Speed 4, so a
full army moves 1500 a day.

## 5. Abilities

"Remains" means a `corpse` or `bones` feature of any owner. Gates are fixed
when the condition is made, from the maker's count at that moment.

| Unit        | Ability                | Exact rule                                                                                                                                                                                                                                                                                                                                    |
| ----------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skeleton    | **Bony**               | Shot Strikes against the Skeletons are x 50% (the MVP rule).                                                                                                                                                                                                                                                                                  |
| Ghoul       | **Feast**              | When the Ghouls end a walk on a hex with remains, the remains are consumed and the Ghouls are healed 6 x their count, reviving. They may still attack.                                                                                                                                                                                        |
| Banshee     | **Wail**               | A stack hit by the Banshees' shot gains Shaken with clock 2 and gate `{ hp, max: 12 x the Banshees' count }`.                                                                                                                                                                                                                                 |
| Banshee     | **Keen**               | The Banshees' shots get +10% damage for each remains feature on the field (max +50%).                                                                                                                                                                                                                                                         |
| Gravecaller | **Caster**             | Pages: **Second Shift** and **Pass on**. `castPower` 1, `castDivisor` 2, `castCap` 8.                                                                                                                                                                                                                                                         |
| Vampire     | **Drain**              | After the Vampires' melee attack (not a retaliation), they are healed half the damage it dealt, rounded down, reviving.                                                                                                                                                                                                                       |
| Vampire     | **Mist**               | The Vampires' walk is a teleport to any free hex within their Speed; stacks, features and hazards between do not affect it.                                                                                                                                                                                                                   |
| Late King   | **Long Live the King** | When the Late Kings die and will not get up by Not Done Yet (already used, or the stack is a guest): if any other remains are on the field, the nearest to the Kings' own is consumed and the Kings get up exactly as by Not Done Yet. No limit per battle; each return consumes one remains. Bends the once-per-stack limit of RULES_V2 3.8. |
| Late King   | **Royal Displeasure**  | +25% Strike damage for each bane the target bears (max +100%). Applies to attacks and retaliations.                                                                                                                                                                                                                                           |

- **Second Shift** is the Hush tier 2 raise at the RULES_V2 2.4 summon
  budget: it consumes one remains and summons Skeletons worth 30 + 15 P HP
  on that hex (4 Gravecallers, Power 3: 75 HP, 8 Skeletons). **Pass on** is
  the Hush tool (RULES_V2 2.7). If the spell list names the raise
  differently, the Gravecaller lists that page.
- Summoned Skeletons leave nothing and do not get up.
- Banshees leave `nothing`: a ghost has nothing to get up from. They are
  the one Restless stack whose loss is final at once.

### 5.1 Drills

A Drill is bought once per player and then applies to all of that player's
stacks of the creature (ECONOMY 6.3).

| Drill building | Unit     | Ability         | Exact rule                                                                                                                                                                           |
| -------------- | -------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bone Yard      | Skeleton | **Spare Parts** | When the Skeletons get up, their bones are not consumed: the feature stays under them for Keen, Feast, Last Rites and the King.                                                      |
| Rot Cellar     | Ghoul    | **Grave Rot**   | A stack struck by the Ghouls in melee (attack or retaliation) gains Venomed, size 3, clock 2 (the MVP Venom).                                                                        |
| Drawing Room   | Vampire  | **Mesmerise**   | Activated, once per battle, in place of an attack (the Vampires may move first): an adjacent enemy stack gains Asleep with clock 2 and gate `{ hp, max: 30 x the Vampires' count }`. |

## 6. Combos

### 6.1 The wake (bones pay three times)

Hero: a Revenant with Attack 3 and Defense 1. Army: Skeletons A (12),
Skeletons B (18), Ghouls (12), Banshees (10). Enemy: a guard of 18 Orc
Brutes (HP 28, Atk 9, Def 6, Dmg 6) deployed as three stacks of 6.

| Step                                                                 | Calculation                                                      | Result                                                         |
| -------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| Round 1. Banshees shoot the first Brute stack; no remains yet        | A 10, D 6, M 1.20; 10 x 5 x 1.20 = 60                            | 60: 2 kills. **Brutes 4, top 24**                              |
| Wail                                                                 | Gate 12 x 10 = 120; the stack has 3 x 28 + 24 = 108              | Shaken: it acts last this round and next                       |
| Rounds 1-2. Skeletons A hold the other two stacks and are wiped out  | Each Brute stack: A 9, D 5, M 1.20; 6 x 6 x 1.20 = 43.2, 4 kills | Bones on the field; "Skeletons get up: 4" on the timeline      |
| Round 2. Ghouls and Skeletons B finish the Shaken stack              | -                                                                | A corpse: two remains                                          |
| Round 2. Banshees shoot with Keen +20%                               | 10 x 5 x 1.20 x 1.20 = 72                                        | 72: 2 kills, top 12 (60 would leave top 24)                    |
| Round 3 start. Skeletons A get up                                    | ceil(12 / 3) = 4                                                 | 4 Skeletons on their bones (which stay, with Spare Parts)      |
| Round 3. Ghouls (8 left of 12) end a walk on the Brute corpse: Feast | Heal 6 x 8 = 48, reviving; a Ghoul has 16 HP                     | **Ghouls 11.** The corpse is gone, the revived Ghouls are kept |

One dead Skeleton stack (540 gold) bought two rounds of blocking, a
standing +10% for the Banshees, and a second blocking stack.
With five remains down the Banshees shoot for 90.

### 6.2 Last Rites for an Ogre (banes, then the King)

Hero: a Mortician with Attack 1 and Defense 1 (level 1, so C = 1). Enemy: 8
Ogres (HP 90, Atk 14, Def 12, Dmg 16). A Skeleton stack has died beside
them. Army: 2 Late Kings, 12 Ghouls with Grave Rot, 10 Banshees.

| Case                                                              | Calculation                                                                        | Damage                | Ogre retaliation on the Kings                       |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------- | --------------------------------------------------- |
| No combo: the Kings attack                                        | A 20, D 12, M 1.40; 2 x 34 x 1.40 = 95.2                                           | 95 (1 kill, top 85)   | 7 Ogres: A 14, D 19, M 0.8; 7 x 16 x 0.8 = 89.6, 89 |
| Banshees try Wail first                                           | Gate 120 against 720 HP                                                            | refused               | -                                                   |
| Last Rites on the bones: the Ogres are Shaken and Jinxed (25)     | Displeasure +50% for two banes, Jinxed x 125%; 2 x 34 x 1.40 x 1.50 x 1.25 = 178.5 | 178 (1 kill, top 2)   | none: a Jinxed stack cannot retaliate               |
| Ghouls strike first (Venomed, D 9), then Last Rites and the Kings | Three banes, +75%; M 1.55; 2 x 34 x 1.55 x 1.75 x 1.25 = 230.56                    | 230 (2 kills, top 40) | none                                                |

The percentage product is 2.19, well inside the cap of 4. Jinxed lasts two
rounds, so every Restless stack attacks the Ogres free until then.

### 6.3 Cross-faction: professional mourners (guest Goblins)

A Revenant buys five Goblins at a Horde outpost (35 gold each,
[FACTION_GOBLINS.md](FACTION_GOBLINS.md#4-roster)) and puts each in its own
slot beside one Late King and 10 Banshees. Goblins are guests: they do not
get up, and they leave a `corpse`.

- Each Goblin that dies is one remains: Keen climbs to the full +50%
  (Banshee shots of 60 become 90).
- The King gets up once by Not Done Yet and then once more per corpse by
  Long Live the King: up to seven lives of 170 HP for 175 gold of mourners.
  Each return eats a corpse, so Keen falls 10% a time.
- If the guard will not kill the Goblins, the Banshees may (law 5: anything
  can target anything).

The price: five of seven slots, and a King that has died at all crumbles
when the battle ends. It is a way to win one fight that could not be won,
not a routine, unless the player holds the Hall of Ancestors (section 9).

Note the reverse case: the Realm's Squires cannot help here. Attend makes
Heartened, which no Restless creature can bear.

## 7. Hero classes

Skill names are the kinds of [CONTENT_TAXONOMY.md](CONTENT_TAXONOMY.md)
section 3.2; the content bead fixes the final names.

| Property        | Revenant (might)                     | Mortician (magic)                                                                      |
| --------------- | ------------------------------------ | -------------------------------------------------------------------------------------- |
| Starting stats  | Attack 3, Defense 1, Power 1, Lore 1 | Attack 1, Defense 1, Power 2, Lore 2                                                   |
| Stat pattern    | A, D, A, P, A, D, L, A, D, P         | P, L, P, A, L, P, D, P, L, A                                                           |
| Starting skills | Offence 1, Riposte 1                 | Hush 1, Wellspring 1; page: Last Breath (the Hush tier 1 single-stack Harm, 20 + 10 P) |
| Starting army   | 20 Skeletons, 5 Ghouls (FV 1775)     | 14 Skeletons, 4 Ghouls, 2 Gravecallers (FV 1780)                                       |
| Native terrain  | Wasteland                            | Wasteland                                                                              |
| Command         | One More Time                        | Last Rites                                                                             |

**One More Time** (Revenant). Choose up to C friendly stacks that are not
summoned. Each gains the visible badge _gets up_: the next time it dies and
leaves remains, it gets up exactly as by Not Done Yet, even if it is a
guest or has already got up. The badge is a per-battle flag, not a
condition.

**Last Rites** (Mortician). Choose one remains feature. It is consumed, and
every enemy stack within C hexes of it gains Shaken (clock 2) and Jinxed
(size 25, clock 2).

| Skill      | Revenant | Mortician |     | Skill       | Revenant | Mortician |
| ---------- | -------: | --------: | --- | ----------- | -------: | --------: |
| Bloom      |        0 |         0 |     | Fortune     |        3 |         2 |
| Accord     |        1 |         2 |     | Captaincy   |        7 |         5 |
| Clock      |        2 |         6 |     | Omens       |        6 |         8 |
| Hush       |        4 |        10 |     | Logistics   |        6 |         4 |
| Storm      |        2 |         4 |     | Pathfinding |        6 |         4 |
| Offence    |        8 |         2 |     | Scouting    |        4 |         5 |
| Armour     |        5 |         3 |     | Wellspring  |        2 |         8 |
| Archery    |        3 |         4 |     | Learning    |        4 |         6 |
| Riposte    |        8 |         3 |     | Estates     |        3 |         3 |
| Standards  |        3 |         3 |     | Mustering   |        5 |         3 |
| Tactics    |        5 |         3 |     | Parley      |        1 |         1 |
| Leadership |        0 |         0 |     | Scrollcraft |        2 |         6 |

Leadership is 0 because natives cannot bear Heartened; Bloom is 0 because
it is the faction's opposed school with no weight in its guild.

## 8. Named heroes

| Hero                        | Class     | Specialty                                  |
| --------------------------- | --------- | ------------------------------------------ |
| Sir Mortimer Stillstanding  | Revenant  | Creature: Skeletons                        |
| The Dowager Countess Agatha | Revenant  | Creature: Vampires                         |
| Colonel Bartholomew Dust    | Revenant  | Command: One More Time counts C one higher |
| Old Jeb the Gravedigger     | Revenant  | Resource: 1 essence every second day       |
| Mr Graves, Funeral Director | Mortician | Spell: Pass on                             |
| Madame Ophelia Veil         | Mortician | Spell: Second Shift                        |
| Doctor Ignatius Crane       | Mortician | Skill: Hush at rank 2 (in place of Hush 1) |
| Widow Hester Blackwood      | Mortician | Creature: Banshees                         |

## 9. Town: the Churchyard

Starts with the Village Hall, the Potter's Field, and a Tavern. One
building per day. Costs marked "common" are in
[ECONOMY.md](ECONOMY.md#6-buildings-every-town-shares).

| Building                          | Cost                                 | Requires               | Effect                                                                                                                      |
| --------------------------------- | ------------------------------------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Village, Town, City Hall          | common                               | common                 | Income 500, 1000, 2000 gold a day                                                                                           |
| Iron Railings                     | common (Fort 1)                      | -                      | Fort level 1; needed for the Wailing Tower                                                                                  |
| Lych Wall                         | common (Fort 2)                      | Iron Railings          | Fort level 2                                                                                                                |
| Black Gate                        | common (Fort 3)                      | Lych Wall, City Hall   | Fort level 3 with its tower                                                                                                 |
| Marketplace, Resource Silo        | common                               | common                 | Trade; +1 wood and +1 ore a day                                                                                             |
| Magic Guild 1 to 5                | common                               | common                 | All five levels                                                                                                             |
| Tavern                            | (start)                              | -                      | Hire heroes                                                                                                                 |
| Potter's Field (T1)               | (start)                              | -                      | Skeletons                                                                                                                   |
| Charnel Pit (T2)                  | 800 gold, 2 wood, 5 ore              | Potter's Field         | Ghouls                                                                                                                      |
| Wailing Tower (T3)                | 1200 gold, 5 wood, 5 ore             | Iron Railings          | Banshees                                                                                                                    |
| Funeral Parlour (T4)              | 2000 gold, 5 ore, 3 essence          | Charnel Pit            | Gravecallers                                                                                                                |
| Manor (T5)                        | 4000 gold, 5 wood, 10 ore, 2 essence | Wailing Tower          | Vampires                                                                                                                    |
| Royal Mausoleum (T6)              | 8000 gold, 5 wood, 10 ore, 6 essence | Manor, Funeral Parlour | Late Kings                                                                                                                  |
| Bone Yard (Drill)                 | 1000 gold, 5 ore                     | Iron Railings          | Skeletons gain Spare Parts                                                                                                  |
| Rot Cellar (Drill)                | 1000 gold, 5 wood, 1 essence         | Charnel Pit            | Ghouls gain Grave Rot                                                                                                       |
| Drawing Room (Drill)              | 2500 gold, 5 ore, 2 essence          | Manor                  | Vampires gain Mesmerise                                                                                                     |
| Essence Still (special)           | 2000 gold, 5 wood, 5 ore             | Marketplace            | +1 essence on every even day                                                                                                |
| Family Crypt (special)            | 3000 gold, 10 ore, 2 essence         | Funeral Parlour        | While its owner holds it, that player's native stacks get up with half their `initialCount`, rounded up, instead of a third |
| Hall of Ancestors (Keystone Hall) | the Keystone                         | City Hall              | Common Keystone effects, and its owner's stacks that got up do not crumble after a battle won: they keep their count        |

Every building: 56,000 gold, 117 wood, 132 ore, 34 essence (26 buildings
with the three the town starts with and the Hall of Ancestors). The tier 6
chain (Charnel Pit, Iron Railings, Wailing Tower, Funeral Parlour, Manor,
Royal Mausoleum) costs 18,000 gold, 32 wood, 35 ore and 11 essence.

## 10. Art

| Unit        | Sprite                                                         |
| ----------- | -------------------------------------------------------------- |
| Skeleton    | Pulp Wars `skeleton`                                           |
| Ghoul       | Pulp Wars `ghoul`                                              |
| Banshee     | Pulp Wars `banshee`                                            |
| Gravecaller | Pulp Wars `necromancer`                                        |
| Vampire     | Pulp Wars `vampire`                                            |
| Late King   | New (a crowned skeleton carried on a litter, mid-proclamation) |

`zombie`, `wight`, `lich` and `abomination` are free for strays and guards.
A risen stack needs a small "risen" badge; the timeline needs a get-up
event icon.

## 11. Notable calls

| Call                                                                                         | Why                                                                                                                   |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| A stack gets up with a third of its starting count, rounded up, at full HP                   | Readable from the stack's own number; a lone creature returns whole, which is safe because it crumbles afterwards     |
| The weekly fight value is about 8% below the Realm's                                         | Not Done Yet is worth roughly that inside a fight; the balance bead should test this number first                     |
| Banshees leave nothing and never get up                                                      | Law 6 does the work; the faction's only shooter is its one fragile piece                                              |
| The Late King's bent rule is repeated returns paid in remains                                | A finite price (ground), so it is legal under RULES_V2 1.11; it makes every death on the field matter to both sides   |
| Royal Displeasure counts the target's banes; the Dragonslayer's Paragon counts its own boons | The two tier 6 units cash in opposite halves of the condition game                                                    |
| One More Time is a badge, not a condition                                                    | Condition kinds have no on-death hook (RULES_V2 1.3)                                                                  |
| Second Shift and Last Breath are named here before the spell list exists                     | The Gravecaller and the Mortician need pages; both are defined by their RULES_V2 2.4 budget                           |
| The Hall of Ancestors lets risen stacks survive                                              | The concept's decision 10 keeps necromancy out of normal play; the Keystone is where a faction may break its own rule |
| No zombie, lich or abomination in the roster                                                 | Six slots; the Ghoul's Feast and the Late King earn theirs. The others suit strays                                    |

**Engine asks** (no new noun or verb): the get-up event of RULES_V2 3.8
with a count rule set by data and modifiers (Family Crypt, Spare Parts); a
settable per-stack "gets up" flag; XP that never counts a creature twice; a
modifier that reads the number of remains on the field; an ability hook
"on ending a walk on a feature".
