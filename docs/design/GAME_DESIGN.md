# Game design: Border Marches (MVP)

Status: canonical for the MVP (bead `border_marches-xaj.1`, 2026-11-15).
Numbers are starting values from the orchestrator's design brief; every
deliberate change is listed under [Changes from brief](#12-changes-from-brief).

**v0.2 note:** [RULES_V2.md](RULES_V2.md) extends these rules with the
battle grammar, magic, heroes, artifacts and multi-player, and supersedes
parts of sections 3, 4, 6, 7.2, 7.3, 9.2, 9.3, 9.4, 9.6, 9.7, 10 and 11.
Its [section 0.1](RULES_V2.md#01-what-this-supersedes) lists each replaced
rule; everything not listed there still holds.

Related documents:

| Topic                                                   | Document                                           |
| ------------------------------------------------------- | -------------------------------------------------- |
| The Lost World faction: roster, abilities, combos, town | [FACTION_LOST_WORLD.md](FACTION_LOST_WORLD.md)     |
| Resources, income, costs, pickups, economy sanity pass  | [ECONOMY.md](ECONOMY.md)                           |
| Visual direction, adventure-map look, terrain mapping   | [../art/ART_DIRECTION.md](../art/ART_DIRECTION.md) |
| How art is made                                         | [../art/PIPELINE.md](../art/PIPELINE.md)           |

## 1. Vision

A Heroes of Might and Magic-style strategy game: an adventure map, towns
that recruit creatures, four resources, heroes who lead armies and level up,
and turn-based battles on a hex field. Three things set it apart:

1. **Pulp theme.** Factions come from different pulp genres: a Lost World of
   cavemen and dinosaurs, goblins, undead, martians and more. Charming and
   silly, never grim.
2. **Deterministic combat.** No damage ranges, no luck, no morale rolls.
   Every outcome can be computed in advance and the interface shows it
   exactly before the player commits.
3. **High-variance combos.** In the spirit of Slay the Spire, abilities (and
   later spells, artifacts and skills) stack into large power spikes. The
   spikes are bounded, but clearly bigger than in the Heroes series: the
   right combination can let a player roll over an opponent. That is
   accepted, even in multiplayer; the game is mostly single player.

Visual target: Heroes of Might and Magic II-level pixel art. The adventure
map must read as one natural landscape, not a grid (see
[ART_DIRECTION.md](../art/ART_DIRECTION.md)).

## 2. Pillars (how to decide)

| Pillar               | Means                                                                    | Rules out                                       |
| -------------------- | ------------------------------------------------------------------------ | ----------------------------------------------- |
| Readable certainty   | Every number shown is the number used; previews are exact                | Hidden rolls, "about 40-60 damage"              |
| Combos over stats    | New content adds conditions that interact (adjacency, debuffs, movement) | Flat stat creep with no interaction             |
| Bounded spikes       | Each multiplier has a cap; the damage multiplier caps at 4.0             | Unbounded stacking, infinite loops              |
| Landscape, not board | Terrain looks continuous and hand-made                                   | Visible grid, straight borders, repeated stamps |

## 3. MVP scope

In:

- One playable faction, [The Lost World](FACTION_LOST_WORLD.md), 6 creature
  tiers, one town type, one hero class (Chieftain).
- One hero for the player. No other heroes on the map.
- Four resources: gold, wood, ore, essence ([ECONOMY.md](ECONOMY.md)).
- Neutral monster stacks (8 types, [section 8](#8-neutral-monsters)).
- One generated map with a handful of terrains (Grass, Jungle, Steppe,
  Badlands, Wasteland, shallow and deep Water; mountains and forests as
  obstacles).
- Deterministic hex battles with exact previews and auto-combat.

Out (later): spells, artifacts, secondary skills, more factions, AI heroes,
boats, retreat and surrender, siege walls, neutral growth over time,
multiplayer.

## 4. Victory and defeat

| Condition | Rule                                                                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Win       | Capture the **Warlord's Hold**, a neutral goblin town: defeat its garrison ([section 8.4](#84-the-warlords-hold-garrison)) and the hero enters it. The game ends at once. |
| Lose      | The player's hero is defeated in battle. There is no retreat in the MVP, so a lost battle ends the game.                                                                  |

## 5. Calendar

- 1 week = 7 days, 1 month = 4 weeks. The game starts on day 1 of week 1 of
  month 1.
- **Income** is paid at the start of every day from day 2 onward (day 1 is
  covered by the starting resources).
- **Creature growth** is added to every built dwelling on day 1 of each week
  from week 2 onward. At game start every built dwelling already holds one
  week's growth, and a dwelling built during the game is stocked with one
  week's growth at once.
- Movement points refill at the start of every day; unspent points are lost.

## 6. The hero

| Property            | Value                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------- |
| Class               | Chieftain (Lost World)                                                                   |
| Primary stats (MVP) | Attack, Defense only. Added to the Attack and Defense of every stack in the hero's army. |
| Starting stats      | Attack 2, Defense 2                                                                      |
| Movement            | 1500 movement points per day                                                             |
| Army                | Up to 7 stacks; stacks of the same creature merge                                        |
| Starting army       | 18 Cavemen, 6 Spitters                                                                   |

Recruits from the town join the hero's army when the hero is in the town,
otherwise the town's garrison (7 slots); the hero swaps creatures with the
garrison while in the town.

**Starting militia** (v0.2, [RULES_V2 5.5](RULES_V2.md#55-towns-capture-and-defence)):
every player's starting town begins with a garrison of one week's growth
of its tier-1 dwelling plus half a week's growth (rounded down) of its
tier-2 dwelling if built, on top of the dwelling stock (14 Squires, 15
Skeletons, 20 Goblins or 14 Cavemen at the start). A capital is no longer
empty for the first rival hero that finds it in week one, and the hero
may take the militia along instead.

### 6.1 Experience and levels

XP gained in a battle = the total HP of enemy creatures killed (count killed x
creature HP). A treasure chest can also give 750 XP
([ECONOMY.md](ECONOMY.md#5-pickups)).

The total XP needed for each level is the rule of
[RULES_V2.md section 3.2](RULES_V2.md#32-experience-and-levels):
XP(L) = 100 x (L - 1) x (L + 2). It replaces the MVP table that stood here.

On each level gained, the player picks one of two offers: **+1 Attack** or
**+1 Defense**. (Skills add more kinds of offers later.) Several levels at
once are offered one after another.

## 7. Adventure map rules

### 7.1 Grid and movement

- Square grid; the hero moves in **8 directions**.
- A step's cost is the move cost of the cell being entered; a diagonal step
  costs that x 1.414, rounded to the nearest integer. A step along a road
  (both cells have road) costs the Road value.
- A step is allowed only if the hero has at least its cost left.

| Terrain               | Straight step | Diagonal step | Notes                                            |
| --------------------- | ------------: | ------------: | ------------------------------------------------ |
| Road                  |            70 |            99 | both cells on the road (RULES_V2 3.9)            |
| Grass                 |           100 |           141 |                                                  |
| Steppe                |           100 |           141 |                                                  |
| Jungle                |           150 |           212 | 100 / 141 for Lost World natives (the Chieftain) |
| Badlands              |           125 |           177 |                                                  |
| Wasteland             |           150 |           212 |                                                  |
| Sand (desert)         |           125 |           177 | bead bzc.88: as slow as the badlands             |
| Water (shallow, deep) |    impassable |               | no boats in the MVP                              |
| Mountains             |    impassable |               |                                                  |
| Forest                |    impassable |               |                                                  |

A diagonal step between two impassable cells (cutting a corner) is not
allowed.

### 7.2 Interaction

| Object         | What happens                                                                                                                                                                                                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Neutral stack  | **Zone of control** (Heroes III style): a hero that enters any of the 8 cells around a neutral stack ends its move there and the stack attacks. Clicking a stack moves the hero next to it and attacks. Paths never pass through a guarded cell except as their last step. |
| Mine           | Visiting flags it for the player; it pays daily from the next day ([ECONOMY.md](ECONOMY.md#4-mines)). Flags cannot be lost in the MVP.                                                                                                                                     |
| Pickup         | A hero next to it takes it and it leaves the map; until then it blocks its cell (superseded by [RULES_V2 5.6](RULES_V2.md#56-mines-dwellings-and-flags)).                                                                                                                  |
| Treasure chest | A pickup: taking it asks 1000 gold or 750 XP.                                                                                                                                                                                                                              |
| Own town       | Visiting opens the town screen (build, recruit, swap armies).                                                                                                                                                                                                              |
| Warlord's Hold | Visiting starts the battle against its garrison.                                                                                                                                                                                                                           |

Paths go round buildings (bead bzc.107): a planned path stands on the
entrance of a mine, town, dwelling, site, bank or waystone (own ones and
spent ones too) only when that building is the clicked target, or when no
way round exists; then the preview rings that step instead of an arrow.
Pickups are not buildings: one on the only way ends the planned walk with
taking it.

In battles on the adventure map the hero is always the attacking side (left),
whoever started the fight.

### 7.3 Fog of war

- Sight radius: hero 6 cells, own town 5 cells. A cell at offset (dx, dy) is
  seen when dx^2 + dy^2 <= r x (r + 1) (a round disc).
- Explored cells stay revealed; the MVP has nothing that moves on its own, so
  there is no separate "seen but stale" state.

## 8. Neutral monsters

Neutral stacks stand still and guard objects and passes. Their stack size
scales with distance from the player's start. They reuse Pulp Wars sprites
(paths in [ART_DIRECTION.md](../art/ART_DIRECTION.md#6-reused-pulp-wars-sprites)).
There is no weekly neutral growth in the MVP.

### 8.1 Roster

Stats are on the same scale as the [Lost World tiers](FACTION_LOST_WORLD.md#2-roster).
Each has at most one simple, deterministic ability.

| Tier | Creature              |  HP | Atk | Def | Dmg | Speed | Shots | Ability                                                                    |   FV |
| ---: | --------------------- | --: | --: | --: | --: | ----: | ----: | -------------------------------------------------------------------------- | ---: |
|    1 | Goblin                |  10 |   4 |   2 |   2 |     5 |     - | -                                                                          |   58 |
|    1 | Skeleton              |   9 |   5 |   4 |   2 |     4 |     - | **Bony**: ranged attacks deal half damage to it                            |   62 |
|    2 | Bomb Chucker (ranged) |  12 |   6 |   3 |   3 |     4 |     8 | -                                                                          |  109 |
|    2 | Wolf Rider            |  18 |   7 |   5 |   4 |     8 |     - | -                                                                          |  136 |
|    3 | Orc Brute             |  28 |   9 |   6 |   6 |     4 |     - | -                                                                          |  227 |
|    4 | Troll                 |  50 |  11 |   9 |  10 |     5 |     - | **Regenerate**: at the start of its turn its top creature heals to full HP |  447 |
|    5 | Ogre                  |  90 |  14 |  12 |  16 |     4 |     - | -                                                                          |  873 |
|    6 | Orc Warboss           | 140 |  17 |  15 |  30 |     6 |     - | **Warcry**: other friendly stacks adjacent to the Warboss get +2 Defense   | 1685 |

### 8.2 Fight value (for sizing guards only)

FV per creature = round(10 x sqrt(HP x Dmg) x (1 + 0.05 x (Atk + Def)) x
(1.25 if ranged)). A stack's FV is count x creature FV (the square root of a
stack's Lanchester strength, so stacks add up roughly linearly). FV is a
map-generation heuristic. Its one use in battle (v0.2, bead bzc.24): at the
round limit the side with more fight value left wins (RULES_V2 1.12, which
replaces section 9.7's "no limit"; see BALANCE.md).

Lost World reference values: Caveman 60, Spitter 122, Raptor 173, Shaman 387,
Triceratops 849, T-Rex 2504. The starting army (18 Cavemen, 6 Spitters) is
1812; one full week of growth of all six dwellings is 8899.

### 8.3 Guard sizing

Distance is the movement cost of the shortest path from the player's town.

| Ring | Distance           | Target guard FV | Typical guard                                 |
| ---- | ------------------ | --------------: | --------------------------------------------- |
| 0    | up to 1 day (1500) |        600-1200 | 15 Goblins, 5 Orc Brutes                      |
| 1    | 1-2 days           |       1200-3000 | 12 Wolf Riders, 5 Trolls                      |
| 2    | 2-4 days           |       3000-8000 | 25 Orc Brutes, 8 Ogres                        |
| 3    | more than 4 days   |      8000-16000 | 15 Ogres, 7 Warbosses                         |
| Hold | fixed              |     about 30000 | [section 8.4](#84-the-warlords-hold-garrison) |

Valuable objects (essence springs, gold mines, chests) take the upper end of
their ring. Count = max(1, round(target FV / creature FV)); pick a creature
type that gives a count between about 5 and 50. In battle a neutral stack of
count n is deployed as min(n, 3) stacks of sizes as equal as possible (larger
first).

**Guards follow the prize (bead bzc.3, v0.2 generator).** Every object type
has a prize value (gold equivalent) in one shared table,
`src/data/mapObjects.ts`; a new object type is a new row there. An object
worth at least its zone's free value gets a guard (start zones are generous:
a sawmill and a chest near home are free). Target guard FV = value x 0.75 x a
ring factor (0.8, 1.0, 1.2, 1.4 for rings 0-3) x a 12% jitter, so the fight is
roughly in proportion to the prize; the creature choice is as above. A guard
in the only gap of a dead-end room holds every prize inside and is sized from
their sum. A guard in a pass between zones holds the zone it opens (value by
that zone's tier; the Hold's zone highest); a loop between two middle zones of
the same tier is sometimes left open. Neutral towns (and the open starts of
players not in the game) are garrisoned like a 9000-value prize.

### 8.4 The Warlord's Hold garrison

The strongest force on the map: five stacks, defenders of a fortified town
(+2 Defense to every stack, like a Palisade).

| Stack        | Count |        FV |
| ------------ | ----: | --------: |
| Orc Warboss  |     4 |      6740 |
| Ogre         |     8 |      6984 |
| Troll        |    14 |      6258 |
| Orc Brute    |    30 |      6810 |
| Bomb Chucker |    30 |      3270 |
| **Total**    |       | **30062** |

For scale: a Lost World army that recruited everything from the start through
week 4 has an FV of about 33000 before losses
([ECONOMY.md](ECONOMY.md#8-sanity-pass)). Taking the Hold in week 4-5 needs
good combos; later it is comfortable.

## 9. Battle rules (deterministic)

### 9.1 Field and deployment

- Hex field 15 columns x 11 rows, rows offset (odd rows shifted half a hex
  right). 0-6 obstacle hexes, chosen by the battle seed, never in the two
  deployment columns.
- Attacker in column 0 (left), defender in column 14 (right). All units
  occupy 1 hex in the MVP.
- Deployment rows by number of stacks:

| Stacks | Rows                 |
| -----: | -------------------- |
|      1 | 5                    |
|      2 | 2, 8                 |
|      3 | 2, 5, 8              |
|      4 | 0, 4, 6, 10          |
|      5 | 0, 2, 5, 8, 10       |
|      6 | 0, 2, 4, 6, 8, 10    |
|      7 | 0, 2, 4, 5, 6, 8, 10 |

### 9.2 Turn order

- A round: every stack acts once. Order: Speed descending; ties: attacker's
  side first, then army slot order.
- **Wait** (once per round): the stack acts again after every non-waiting
  stack; waiting stacks act slowest first (same tie-break).

### 9.3 Actions

| Action              | Rule                                                                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Move                | Up to Speed hexes, around obstacles and stacks.                                                                                                     |
| Move + melee attack | Move, then attack an adjacent enemy stack.                                                                                                          |
| Shoot               | Ranged units with shots left, only when no enemy stack is adjacent to the shooter. No range penalty and no line of sight in the MVP. Uses one shot. |
| Wait                | See above.                                                                                                                                          |
| Defend              | +30% Defense until the stack's next turn.                                                                                                           |

- **Retaliation**: a stack hit by a melee attack retaliates against the
  attacker once per round, if it survives, with the same damage formula. A
  stack that attacks keeps its retaliation. Shots are never retaliated.
- A ranged unit attacking or retaliating in melee deals half damage.
- A ranged unit with no shots left fights in melee (at half damage).

### 9.4 Damage

Let A = the attacker's Attack and D = the defender's Defense, each including
the hero's stat and every modifier:

```text
A = unit Atk + hero Atk + flat bonuses (Mob, War Drums, ...)
D = max(0, unit Def + hero Def + flat bonuses (Palisade, Warcry) - Venom)
if defending: D = round_half_up(D x 1.3)

if A >= D:  M = min(4.0, 1 + 0.05 x (A - D))
else:       M = max(0.3, 1 / (1 + 0.05 x (D - A)))

damage = floor(count x Dmg x M x (ability multipliers) x (0.5 if ranged in melee))
damage = max(1, damage)
```

- count is the attacking stack's current number of creatures; Dmg is the
  creature's fixed damage.
- Ability multipliers (Pack Hunter, Charge) multiply together; inside one
  ability the per-condition bonuses add (for example Pack Hunter with three
  helpers is x 1.60).
- Neutral stacks have no hero: hero Atk and Def are 0 for them.
- **Compute exactly, then floor.** Use integer or rational arithmetic:
  M = (20 + (A - D)) / 20 or 20 / (20 + (D - A)), ability bonuses as whole
  percentages over 100. Floating point gets floors wrong: 6 x 16 x (1 / 1.2)
  is 79.999... in doubles but exactly 80.

### 9.5 Kills

A stack has count n, full creature HP H and a top creature with h HP left
(1 <= h <= H). Damage X:

```text
if X < h:  kills = 0, h = h - X
else:      r = X - h
           kills = min(n, 1 + floor(r / H))
           h = H - (r mod H)       (if r mod H = 0, the next creature is untouched: h = H)
n = n - kills; the stack dies at n = 0
```

### 9.6 Exact preview and auto-combat

- Before the player commits an attack the interface shows: damage dealt and
  creatures killed, the retaliation's damage and kills (computed on the
  survivors), and the ability bonuses that applied.
- **Auto-combat** plays the player's side with the same AI that controls
  neutrals. Being deterministic, the same battle state always gives the same
  result.

### 9.7 End of battle

- A side with no stacks left loses. No retreat or surrender in the MVP.
- The winner's hero gains XP ([section 6.1](#61-experience-and-levels)).
  Surviving creatures keep their losses; the top creature's damage heals
  after the battle.
- A defeated neutral stack is removed from the map. The player's defeated
  hero dies: game over.

## 10. Combos

Combos come from conditions that reward positioning and order: adjacency
(Mob, Pack Hunter, War Drums), debuffs (Venom), movement (Charge) and denial
(Terror). Worked examples with exact numbers are in
[FACTION_LOST_WORLD.md](FACTION_LOST_WORLD.md#4-combos). Caps that keep the
spikes bounded:

| Effect                      | Cap                                          |
| --------------------------- | -------------------------------------------- |
| Attack/defense multiplier M | 0.3 to 4.0                                   |
| Mob                         | +5 Attack (5 other stacks around the target) |
| Pack Hunter                 | x 2.0 (5 other stacks around the target)     |
| Charge                      | x 1.75 (5 hexes)                             |
| Venom, War Drums            | do not stack with themselves                 |

## 11. Open questions

- Battle facing: defenders stand on the right and should face left, but the
  art rule is "never mirror a sprite" (see
  [ART_DIRECTION.md](../art/ART_DIRECTION.md#7-open-questions)).
- Whether neutral stacks should grow weekly once AI heroes exist.

## 12. Changes from brief

| Change                                                                                                                      | Why                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Added exact timing: no income on day 1; growth on day 1 of weeks 2+; dwellings start (and are built) with one week's growth | The brief said "income every day" and "growth on day 1 of each week" without the edge cases             |
| Step cost = entered cell's cost; road cost needs road on both cells; no corner cutting between impassable cells             | The brief gave costs but not which cell pays                                                            |
| Fog disc rule dx^2 + dy^2 <= r(r+1)                                                                                         | A plain Euclidean disc gives a pointy circle on a grid                                                  |
| Hero is always the attacker (left) against neutrals                                                                         | Zone-of-control fights are started by the stack; keeps the side rules simple                            |
| Proposed the 8-creature neutral roster, its stats and abilities                                                             | The brief named the families but no numbers; Orc Brute Speed 4 so the combo example runs before it acts |
| Fight value, guard rings and neutral split into up to 3 stacks                                                              | "Stack size scales with distance" needed a rule the generator can apply                                 |
| Hold garrison composition, with +2 Defense for the fortified Hold                                                           | "Strongest force on the map" needed numbers; the Palisade bonus applies to town defenders               |
| Venom cannot take Defense below 0; Defend rounds half up after all flat modifiers                                           | Order of operations was unspecified                                                                     |
| Ability multipliers multiply; within one ability bonuses add                                                                | Unspecified; matters for combo size                                                                     |
| Deployment rows, hex offset, obstacles kept out of deployment columns                                                       | Unspecified                                                                                             |
| Ranged retaliation in melee is at half damage; no range penalty or line of sight in the MVP                                 | Unspecified                                                                                             |
| XP levels 14+ round down                                                                                                    | "+20% each" did not say how to round                                                                    |
