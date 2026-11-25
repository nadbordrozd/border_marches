# Content: adventure-map objects

Status: content for v0.2 (bead `border_marches-bzc.6`, 2026-11-24).

62 object types for v0.2 (53 core, 9 stretch), grouped as in
CONTENT_TAXONOMY section 6. [RULES_V2.md](RULES_V2.md) section 5,
[GAME_DESIGN.md](GAME_DESIGN.md) sections 7 and 8 and
[ECONOMY.md](ECONOMY.md) govern. The map generator places objects from
this table by value. Strays and caretakers are in [CONTENT_CREATURES.md](CONTENT_CREATURES.md);
artifacts in [CONTENT_ARTIFACTS.md](CONTENT_ARTIFACTS.md).

## 1. Conventions

- **Footprint** is width x height in cells. The entrance is the bottom
  centre cell (bottom left for an even width); the other cells are
  impassable. A 1x1 object is entered or collected by stepping onto it.
  "Blocks a passage" means the generator puts it in a one-cell gap.
- **Visit rule**: what happens when a hero enters. Everything a visit
  would give is shown on hover first, except a Sealed Box.
- **Reset**: "once per hero" and "once per player" are remembered and
  shown on hover ("already visited").
- **Terrain** is where the generator prefers to put it; "Any" has no
  preference.
- **Weight** is the relative frequency in the generator's fill pass, 1 to 10. "rule" means placed by a rule (ECONOMY 4 for mines, a count per
  map, or a map's own design) and not by weight.
- Every seeded content (which skill, spell, artifact, schedule, size) is
  fixed at generation from the map seed.

## 2. Values and guards

Value is in gold-equivalents, on one scale with artifact values: 1 gold
is 1, a wood 100, an ore 150, an essence 500, 1 XP 1.3, a +1 primary stat 1500. A site that gives something to every hero is valued for about two
heroes.

| Value                            | Guard                                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| Below 1500                       | None: free for the taking                                                                     |
| 1500 or more                     | One neutral stack on its approach with target FV = 60% of the value, sized as GAME_DESIGN 8.3 |
| A bank or the vault              | No map guard; the fight inside is 60% of the prize                                            |
| A buried thing                   | Never guarded; it is hidden                                                                   |
| A passage with nothing behind it | By ring, GAME_DESIGN 8.3                                                                      |

Placement by ring, so that guards match what a hero of that distance can
beat:

| Ring (GAME_DESIGN 8.3) | Object values placed there | Resulting guard FV |
| ---------------------- | -------------------------- | ------------------ |
| 0, up to 1 day         | Up to 2000                 | 0 to 1200          |
| 1, 1-2 days            | 2000 to 5000               | 1200 to 3000       |
| 2, 2-4 days            | 5000 to 13000              | 3000 to 8000       |
| 3, beyond 4 days       | Above 13000                | 8000 and up        |

ECONOMY 4's start-region guarantees override this table (one unguarded
Sawmill, a lightly guarded Ore Pit, one Essence Spring within two days).
The map bead owns the final sizing; this table is the data it reads.

## 3. The objects

### 3.1 Mines and producers (8)

| Object                     | Footprint | Visit rule                                                       | Reset                                 | Reward                                                                               | Value         | Terrain           | Weight |
| -------------------------- | --------- | ---------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------ | ------------- | ----------------- | ------ |
| **Sawmill**                | 2x2       | Visiting flags it for the player (RULES_V2 5.6).                 | Flag held until another player visits | +3 wood each day                                                                     | 1200          | Jungle, Grass     | rule   |
| **Ore Pit**                | 2x2       | Visiting flags it.                                               | Flag                                  | +2 ore each day                                                                      | 1500          | Badlands, Steppe  | rule   |
| **Essence Spring**         | 2x2       | Visiting flags it.                                               | Flag                                  | +1 essence each day                                                                  | 5000          | Wasteland, Jungle | rule   |
| **Gold Mine**              | 2x2       | Visiting flags it.                                               | Flag                                  | +750 gold each day                                                                   | 6000          | Badlands, Steppe  | rule   |
| **Haunted Mine** (stretch) | 2x2       | Visiting flags it; Sextons stand beside it as an ordinary guard. | Flag                                  | Double the daily yield of a seeded mine kind (6 wood, 4 ore, 2 essence or 1500 gold) | 2 x that mine | Wasteland         | 1      |
| **Windmill**               | 2x2       | The first hero to visit each week collects.                      | Weekly, day 1                         | This week's entry of a seeded schedule: 3-6 wood or 2-4 ore                          | 600           | Grass, Steppe     | 4      |
| **Water Wheel**            | 2x2       | The first hero to visit each week collects.                      | Weekly, day 1                         | 1000 gold                                                                            | 1000          | Grass, Jungle     | 3      |
| **Orchard**                | 2x2       | The first hero to visit each week collects.                      | Weekly, day 1                         | This week's entry of a seeded schedule: 1-2 essence or 500 gold                      | 800           | Jungle, Grass     | 3      |

### 3.2 External dwellings (3)

| Object              | Footprint | Visit rule                                                                                                     | Reset                                                     | Reward                                                                      | Value                             | Terrain                      | Weight |
| ------------------- | --------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------- | ---------------------------- | ------ |
| **Faction Outpost** | 2x2       | Visiting flags it; the flag-holder recruits with a hero on its cell at the creature's normal cost.             | Stock refilled to one week's growth on day 1 of each week | One native creature of tier 1-4 (12 variants, set by the faction documents) | 1500 / 2000 / 3000 / 4500 by tier | The faction's native terrain | 5      |
| **Stray Hut**       | 1x1       | Visiting flags it; the flag-holder hires with a hero on its cell.                                              | Stock refilled on day 1 of each week                      | One stray (8 variants, CONTENT_CREATURES)                                   | 1500 / 2000 / 3000 / 4500 by tier | The stray's terrain          | 6      |
| **Caretaker Lodge** | 2x2       | Locked until the visiting player completes its errand (a seer-hut quest, below); then it works as a stray hut. | Stock refilled on day 1 of each week                      | One caretaker (5 variants, one per school)                                  | 2000 / 3000 / 4500 by tier        | The caretaker's terrain      | 3      |

### 3.3 Visitable buildings (18)

| Object                    | Footprint | Visit rule                                                                                                                                       | Reset                                  | Reward                   | Value             | Terrain                     | Weight |
| ------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- | ------------------------ | ----------------- | --------------------------- | ------ |
| **Stat Shrine**           | 1x1       | Each hero once: +1 to its stat (4 variants: Attack, Defense, Power, Lore).                                                                       | Once per hero                          | +1 primary stat          | 1500              | Any                         | 6      |
| **Learning Stone**        | 1x1       | Each hero once: +1000 XP.                                                                                                                        | Once per hero                          | 1000 XP                  | 1000              | Any                         | 5      |
| **Arena**                 | 2x2       | Each hero once: choose +2 Attack or +2 Defense.                                                                                                  | Once per hero                          | +2 to one stat           | 3000              | Steppe, Badlands            | 2      |
| **Library** (stretch)     | 2x2       | Each hero of level 8 or more once: +1 to all four stats.                                                                                         | Once per hero                          | +4 stat points           | 6000              | Any                         | 1      |
| **Tree of Knowledge**     | 1x1       | Each hero once: gains XP to its next level, for a seeded price (free, 2000 gold or 4 essence).                                                   | Once per hero                          | One level                | 3000              | Jungle, Grass               | 2      |
| **Academy** (stretch)     | 2x2       | Each hero once: pay 2000 gold for +1 to either stat of a seeded pair (Attack and Defense, or Power and Lore).                                    | Once per hero                          | +1 stat for gold         | 1000              | Any                         | 2      |
| **Tutor's Hut**           | 1x1       | Each hero once: learns its seeded skill at rank 1, if it has fewer than six skills, lacks that skill and no vow bars it.                         | Once per hero                          | One skill                | 2000              | Any                         | 4      |
| **School Shrine**         | 1x1       | Each hero once: learns its seeded spell as a page if it can, otherwise receives it as a scroll (3 variants: tier 1, 2 or 3).                     | Once per hero                          | One spell                | 800 / 1500 / 2500 | Any                         | 8      |
| **Hermit**                | 1x1       | Each hero once: either forgets one skill of its choice (the slot is freed and its ranks are lost) or has its next skill offer redrawn.           | Once per hero                          | Steering                 | 1000              | Wasteland, Jungle           | 2      |
| **Rally Camp**            | 1x1       | +1 Morale until the hero's next battle ends.                                                                                                     | Each visit; does not stack with itself | +1 Morale                | 300               | Any                         | 5      |
| **Wishing Well**          | 1x1       | +1 Luck until the hero's next battle ends.                                                                                                       | Each visit; does not stack with itself | +1 Luck                  | 300               | Any                         | 5      |
| **Oasis**                 | 2x2       | +1 Morale until the hero's next battle ends and +400 movement points today.                                                                      | Once per day per hero                  | +1 Morale, +400 movement | 500               | Wasteland, Badlands, Steppe | 3      |
| **School Temple**         | 2x2       | +2 Power for pages of its school until the hero's next battle ends (5 variants).                                                                 | Each visit; does not stack with itself | +2 Power for one school  | 500               | Any                         | 4      |
| **Mana Well**             | 1x1       | Sets the hero's mana to its maximum.                                                                                                             | Once per day per hero                  | Full mana                | 800               | Any                         | 4      |
| **Stables**               | 2x2       | +300 movement points on each remaining day of this week, starting today.                                                                         | Once per week per hero                 | +300 movement a day      | 1000              | Grass, Steppe               | 3      |
| **Sanctuary** (stretch)   | 2x2       | One hero may stand inside; a hero inside cannot be attacked and cannot attack from it.                                                           | Each visit                             | Safety                   | 300               | Any                         | 1      |
| **Observatory** (stretch) | 1x1       | Reveals the cells in a disc of radius 12 around it.                                                                                              | Each visit                             | Sight                    | 800               | Badlands, Steppe            | 2      |
| **Scholar**               | 1x1       | The first hero to visit receives one seeded gift: a spell (page or scroll), +1 to a stat, or rank 1 of a skill; the scholar then leaves the map. | One-time                               | One gift                 | 1500              | Any                         | 4      |

### 3.4 Banks and the vault (7)

| Object                       | Footprint | Visit rule                                                                                                | Reset                                               | Reward                                                                                                                                        | Value               | Terrain             | Weight                  |
| ---------------------------- | --------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------- | ----------------------- |
| **Overgrown Greenhouse**     | 2x2       | A battle against Groundskeepers (Bloom); the winner takes the prize.                                      | One-time; guards killed stay dead if the hero loses | Small: 15 wood, 1000 gold. Medium: 20 wood, 5 essence, 2000 gold. Large: a Wonder, 30 wood, 8 essence, 3000 gold                              | 2500 / 6500 / 15000 | Jungle, Grass       | 3                       |
| **Sealed Registry**          | 2x2       | A battle against Notaries (Accord).                                                                       | One-time                                            | Small: a tier 2 scroll, 1900 gold. Medium: a tier 3 scroll, a Trinket, 3500 gold. Large: a Wonder, a tier 5 scroll, a Trinket, 5500 gold      | 2500 / 6500 / 15000 | Grass, Steppe       | 3                       |
| **Stopped Belfry**           | 2x2       | A battle against Winders (Clock).                                                                         | One-time                                            | Small: 1500 XP, 500 gold. Medium: 3000 XP, 2500 gold. Large: a Wonder, 6000 XP, 2000 gold                                                     | 2500 / 6500 / 15000 | Steppe, Badlands    | 3                       |
| **Quiet Yard**               | 2x2       | A battle against Sextons (Hush), who raise Shades.                                                        | One-time                                            | Small: 5 essence. Medium: 8 essence, 2500 gold. Large: a cursed Wonder, 12 essence, 5000 gold                                                 | 2500 / 6500 / 15000 | Wasteland, Badlands | 3                       |
| **Thunderstruck Pylon Yard** | 2x2       | A battle against Riggers (Storm).                                                                         | One-time                                            | Small: 10 ore, 1000 gold. Medium: 20 ore, 3500 gold. Large: a Wonder, 30 ore, 5500 gold                                                       | 2500 / 6500 / 15000 | Badlands, Steppe    | 3                       |
| **Landfall Wreck**           | 2x2       | A battle against the strays of its terrain.                                                               | One-time                                            | Small: strays worth FV 1200 join, 700 gold. Medium: strays worth FV 3000 join, 2000 gold. Large: strays worth FV 6000 join and a Marvel piece | 2500 / 6500 / 15000 | Any                 | 4                       |
| **Keepers' Vault**           | 3x2       | A battle against a mixed caretaker guard; the winner is shown three seeded treasures and carries out one. | One-time                                            | Each treasure: a Marvel piece, a Wonder and 5000 gold                                                                                         | 16000               | Any                 | rule: at most 1 per map |

### 3.5 One-time treasure (6)

| Object                | Footprint | Visit rule                                                                        | Reset    | Reward                                                  | Value                                            | Terrain             | Weight |
| --------------------- | --------- | --------------------------------------------------------------------------------- | -------- | ------------------------------------------------------- | ------------------------------------------------ | ------------------- | ------ |
| **Resource Pile**     | 1x1       | Taken from a next cell by the first hero to reach it (4 variants).                | One-time | 5-10 wood, 3-6 ore, 2-4 essence, or 300-800 gold        | 100 a wood, 150 an ore, 500 an essence, 1 a gold | Any                 | 10     |
| **Treasure Chest**    | 1x1       | The hero chooses gold or XP; the rich chest of rings 2-3 holds a Trinket instead. | One-time | 1000 gold or 750 XP; 2000 gold or 1500 XP; or a Trinket | 1000 / 2000 / 2000                               | Any                 | 7      |
| **Campfire**          | 1x1       | Taken from a next cell (bead bzc.49).                                             | One-time | 400-600 gold and 4-6 wood or ore                        | 1000                                             | Any                 | 4      |
| **Loose Artifact**    | 1x1       | Picked up into the backpack; a cursed one is labelled before pickup.              | One-time | One artifact or consumable                              | The artifact's value                             | Any                 | 5      |
| **Loose Scroll**      | 1x1       | Picked up into the scroll case.                                                   | One-time | One scroll                                              | 300 / 600 / 1000 / 1500 / 2500 by tier           | Any                 | 5      |
| **Fallen Adventurer** | 1x1       | The hero takes a seeded Wonder and has -2 Morale until its next battle ends.      | One-time | A Wonder                                                | 4500                                             | Wasteland, Badlands | 2      |

### 3.6 Hidden treasure (3)

| Object              | Footprint   | Visit rule                                                                                                 | Reset           | Reward                                   | Value                | Terrain | Weight            |
| ------------------- | ----------- | ---------------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------- | -------------------- | ------- | ----------------- |
| **Obelisk**         | 1x1         | Each player once: uncovers one more share of that player's puzzle map (shares = obelisks on the map, 4-8). | Once per player | A share of the puzzle                    | 500                  | Any     | rule: 4-8 per map |
| **Buried Keystone** | 1x1, hidden | Dug up by any hero on its cell (digging, section 4); goes to the backpack.                                 | One-time        | The Keystone, built into a Keystone Hall | 30000, never guarded | Any     | rule: 1 per map   |
| **Buried Cache**    | 1x1, hidden | Dug up by any hero on its cell.                                                                            | One-time        | 2000 gold and a Trinket                  | 4000, never guarded  | Any     | rule: 3-6 per map |

### 3.7 Quests, gates, prisons (5)

| Object               | Footprint             | Visit rule                                                                                                                                                   | Reset           | Reward                | Value                             | Terrain | Weight |
| -------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | --------------------- | --------------------------------- | ------- | ------ |
| **Keymaster's Tent** | 1x1                   | The visiting player holds the key of its colour from then on (4 colours).                                                                                    | Once per player | A key                 | 0                                 | Any     | rule   |
| **Border Gate**      | 1x1, blocks a passage | Passable only to heroes of a player who holds its colour's key.                                                                                              | Permanent       | Passage               | 0                                 | Any     | rule   |
| **Seer Hut**         | 1x1                   | Shows a quest (6 kinds, section 5) and its reward; the first player to complete it and return is paid.                                                       | One-time        | One of 8 reward kinds | The reward's value; never guarded | Any     | 4      |
| **Quest Gate**       | 1x1, blocks a passage | Shows a quest; passable to a player once that player has completed it.                                                                                       | Once per player | Passage               | 0                                 | Any     | rule   |
| **Prison**           | 1x1                   | Frees a seeded named hero of level 3, 5 or 7 (by ring), who joins the visiting player with its class's starting army if that player has fewer than 8 heroes. | One-time        | A hero                | 4500 / 5500 / 6500                | Any     | 1      |

### 3.8 Services (6)

| Object                           | Footprint | Visit rule                                                                                                                                        | Reset                               | Reward         | Value | Terrain   | Weight                                                |
| -------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | -------------- | ----- | --------- | ----------------------------------------------------- |
| **Trading Post**                 | 2x2       | Trades resources at the marketplace rates of ECONOMY 7.                                                                                           | Each visit                          | Trade          | 0     | Any       | 2                                                     |
| **Tollhouse**                    | 2x2       | Sells 3 seeded artifacts, consumables or scrolls at value; buys artifacts and scrolls at half value and creatures at half their hire cost.        | Stock redrawn on day 1 of each week | Trade          | 0     | Any       | 3                                                     |
| **Drill Yard**                   | 2x2       | Sells the Drill of a creature in the hero's army, as its player's flag, for twice the Drill building's gold (ECONOMY 6.3).                        | Each visit                          | Drills         | 0     | Any       | 3 in middle and town zones; 1 per map (S, M), 1-2 (L) |
| **Curse-Lifter's Shrine**        | 1x1       | Lifts one worn cursed artifact for 1000 gold and 2 essence (RULES_V2 4.3).                                                                        | Each visit                          | A curse lifted | 0     | Any       | 2                                                     |
| **Roadside Inn** (stretch)       | 2x2       | Sells one seeded rumour for 250 gold: the 5x5 area of a buried cache, the contents of a named sealed box or vault, or the cell of a Marvel piece. | A new rumour on day 1 of each week  | A rumour       | 0     | Any       | 2                                                     |
| **Altar of Sacrifice** (stretch) | 1x1       | The hero gives up creatures for XP equal to their total HP, or an artifact for XP equal to half its value.                                        | Each visit                          | XP             | 0     | Wasteland | 1                                                     |

### 3.9 Teleports (3)

| Object                         | Footprint | Visit rule                                                                                                    | Reset           | Reward          | Value | Terrain | Weight              |
| ------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------- | --------------- | --------------- | ----- | ------- | ------------------- |
| **Two-Way Waystone**           | 1x1       | A hero that steps on it appears on its twin of the same colour, if that cell is free; no extra movement cost. | Each visit      | Travel          | 0     | Any     | rule: in pairs      |
| **One-Way Waystone** (stretch) | 1x1       | A hero that steps on the entrance appears on the exit; the exit is an ordinary cell.                          | Each visit      | Travel          | 0     | Any     | rule: 1/2/3 (S/M/L) |
| **Pylon**                      | 1x1       | Visiting marks it for the player; Tow Line travels between marked pylons.                                     | Once per player | A Tow Line stop | 500   | Any     | rule: 3-5 per map   |

### 3.10 Events and signs (3)

| Object             | Footprint               | Visit rule                                                                                                                                                                                       | Reset                                           | Reward         | Value                                         | Terrain | Weight       |
| ------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- | -------------- | --------------------------------------------- | ------- | ------------ |
| **Event Tile**     | 1x1, shown as a shimmer | Fires its map-authored effect on the first hero to enter: gives or takes resources, XP, an artifact or creatures, or starts a fight.                                                             | One-time, or once per player if the map says so | Authored       | Its gift's value                              | Any     | map-authored |
| **Sealed Box**     | 1x1                     | Opened from a next cell by the first hero to reach it; contents are fixed by the seed and hidden: gold 2000-5000, 1500-4000 XP, a Trinket or Wonder, creatures, or "a fight" for a larger prize. | One-time                                        | Seeded, hidden | 2000-6000; a fight inside is 60% of its prize | Any     | 3            |
| **Sign** (stretch) | 1x1                     | Shows its text.                                                                                                                                                                                  | Each visit                                      | Text           | 0                                             | Any     | map-authored |

## 4. Banks, digging and the Keystone

**Bank sizes.** A bank's size is fixed by the seed and shown on hover with
its guard and prize. Guards deploy normally, as up to three stacks
(GAME_DESIGN 8.3).

| Size           | Prize value | Guard FV | Usual ring |
| -------------- | ----------- | -------- | ---------- |
| Small          | 2500        | 1500     | 0-1        |
| Medium         | 6500        | 4000     | 1-2        |
| Large          | 15000       | 9000     | 2-3        |
| Keepers' Vault | 16000       | 9600     | 3          |

A Quiet Yard's Sextons cast Second Shift on their own dead; a Landfall
Wreck's guard is the strays of its terrain
([CONTENT_CREATURES.md](CONTENT_CREATURES.md#3-where-they-live)).

**Digging.** Any hero may dig on a passable cell that holds no object. It
needs the hero's full movement points for the day and sets them to 0. It
finds whatever is buried on that cell, or nothing. The Keystone needs a
free backpack slot. A Collapsible Shovel digs for 300 movement points
instead.

**Obelisks and the puzzle.** Each player has its own puzzle map: the 7x7
area around the Keystone's cell, cut into as many shares as the map has
obelisks. Each obelisk a player visits uncovers that player's next share
in a seeded order, the Keystone's own cell last.

**The Keystone.** One per map. It is carried in the backpack, has no slot
and no effect, cannot be sold or destroyed, and passes to the winner like
any artifact (RULES_V2 4.4). A hero that brings it to a town of its
player may build the faction's Keystone Hall (faction documents). It is
the "named artifact" of the scenario victory in RULES_V2 5.9.

**Buried caches** are found by a rumour (Roadside Inn, Tollhouse), a
Dog-Eared Map or the Dowse spell.

## 5. Quests and rewards

Seer Huts, Quest Gates and Caretaker Lodges share these.

| Quest kind           | Done when                                                           |
| -------------------- | ------------------------------------------------------------------- |
| Bring an artifact    | Arrive carrying the named artifact; it is taken.                    |
| Bring creatures      | Arrive with at least the named count of a creature; they are taken. |
| Bring resources      | Pay the named resources.                                            |
| Reach a level        | Arrive with a hero of at least the named level.                     |
| Defeat a named guard | Defeat the marked neutral stack shown on the map.                   |
| Visit a site         | Visit the named site with any hero, then return.                    |

| Reward kind       | Range                                                               |
| ----------------- | ------------------------------------------------------------------- |
| XP                | 1000-5000                                                           |
| Gold              | 1000-5000                                                           |
| A resource        | 5-20 wood or ore, or 3-10 essence                                   |
| A stat            | +1 or +2 to one primary stat                                        |
| A skill rank      | +1 rank in a named skill the hero can take                          |
| An artifact       | A Trinket, Wonder or Marvel piece                                   |
| A spell or scroll | A page if the hero can learn it, otherwise a scroll                 |
| Creatures         | Strays or caretakers that join, including a Caretaker Lodge opening |

A quest's cost and its reward are both shown, and the generator keeps the
reward's value within a quarter of the cost's value (a guard's FV counts
as value / 60%). A Caretaker Lodge's errand is always "bring resources",
"defeat a named guard" or "visit a site".

## 6. Decisions made here

| Decision                                                                                                                                                                                                                                                                                                                             | Why                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| 62 types: the taxonomy's 61 plus the Pylon                                                                                                                                                                                                                                                                                           | Tow Line (RULES_V2 2.8) needs pylons on the map                                                                                |
| One value scale shared with artifacts; guard FV = 60% of value; free below 1500                                                                                                                                                                                                                                                      | "Some resources free for the taking, better ones behind a guardian in proportion"                                              |
| Weekly producers are first come, first served                                                                                                                                                                                                                                                                                        | A reason to route past them and to deny them                                                                                   |
| Stables give +300 a day for the rest of the week                                                                                                                                                                                                                                                                                     | Inside the flat modifier range of RULES_V2 3.9; a daily +400 next to a town would be free                                      |
| Digging needs the full day's movement                                                                                                                                                                                                                                                                                                | A dig is a day, as in Heroes; the shovel is the exception                                                                      |
| School shrines stop at tier 3                                                                                                                                                                                                                                                                                                        | Tiers 4 and 5 come from guilds, scrolls and banks                                                                              |
| The Event Tile is drawn as a shimmer                                                                                                                                                                                                                                                                                                 | Nothing on the map is invisible; its effect is the surprise                                                                    |
| Stray huts have 8 variants and lodges 5                                                                                                                                                                                                                                                                                              | Five above the taxonomy's 8 in all, so that every caretaker has a lodge and eight strays can still be hired                    |
| A Drill Yard offers only the Drills of creatures in the visiting hero's army                                                                                                                                                                                                                                                         | The doc's "applies to the visiting hero's stacks"; the flag it sells still covers every army of the player                     |
| The generator places Drill Yards from the fill (weight 3, middle and town zones, one per zone, never in a pocket), capped per map and topped up to one; value 0, so unguarded like the other services; the named maps have them since bead bzc.50                                                                                    | A paid service, not treasure: one or two per map are enough; the named maps were re-authored on the denser generator with them |
| One-way waystones: both ends in different middle or neutral-town zones, the exit no deeper (tier) than the entrance, both at least a day's movement from every start, off pockets, guards' zones and (entrance) roads and one-cell ways; next to no other object where the zone has room; the named maps have them since bead bzc.50 | A shortcut that never skips a guard into richer land and is never a fairness hazard near a home                                |
| Second Helping needs the dwelling under the hero to fly the caster's flag                                                                                                                                                                                                                                                            | Stepping on an outpost or hut flags it anyway; a locked lodge stays locked                                                     |

## 7. Density (bead bzc.50)

"The map was too empty": the generator's fill was doubled and the named
maps re-authored on it. Visitable objects (everything but towns, hero
starts and neutral stacks) per 100 passable cells, generated maps with the
default players per size, seeds 1-8 (`src/core/map/density.ts`):

| Map                          | Before: visitable | Before: all | Before: objects | After: visitable | After: all | After: objects |
| ---------------------------- | ----------------- | ----------- | --------------- | ---------------- | ---------- | -------------- |
| S (36x36, 2 players)         | 11.1              | 15.3        | 103             | 21.5             | 26.9       | 181            |
| M (48x48, 3 players)         | 10.9              | 14.9        | 176             | 20.8             | 26.5       | 313            |
| L (72x72, 4 players)         | 9.9               | 13.4        | 349             | 21.4             | 27.4       | 712            |
| The Keepers' Toll (M, 2)     | 11.2              | 15.6        | 190             | 23.0             | 29.5       | 356            |
| The Hourglass Marches (L, 3) | 10.3              | 14.2        | 375             | 20.7             | 27.4       | 721            |

"All" counts neutral stacks too. Catalogue types on the named maps: 48 and
56 of 62 before, 57 and 59 after.

| Decision                                                                                                                                                                                                                                                                                                                                                                                                                                             | Why                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Fill density per 100 open cells: start 26, middle 20, neutral-town 22, Hold 24 (was 9, 10, 9, 10); pockets hold 3-5 prizes (was 2-3)                                                                                                                                                                                                                                                                                                                 | About twice the things to do in every zone; start zones most, since they are what a player sees first       |
| A 2x2 or larger fill object with no room left gets a seeded single-cell stand-in from the same zone's weights                                                                                                                                                                                                                                                                                                                                        | Narrow valleys hold few big footprints; the zone still gets its share                                       |
| Pickups, by the game's own rule (`isPickup` in src/core/game/site-state.ts: resource piles, chests, campfires, loose artifacts and scrolls, fallen adventurers, scholars, prisons, sealed boxes; not event tiles or buried treasure), are placed as if they block their cell: never on a road, never where they would cut a way or wall in another pickup, preferring nooks and side pockets; a pocket's pickup is taken only from inside the pocket | Pickups are taken from a cell beside them (the user's request); a blocking pickup must never seal a passage |
| A guarded pickup's guard holds every open cell beside it in its zone of control                                                                                                                                                                                                                                                                                                                                                                      | Taking it from beside must still mean the fight                                                             |
| A single-cell prize's guard keeps itself and its zone of control off the roads; roads between towns go round the zones of control of the big sites' guards where they can                                                                                                                                                                                                                                                                            | Denser maps put many prizes beside the roads; a side prize's guard must not stand across the road           |
| A Haunted Mine keeps at least as far from every start as the plain mine of its resource                                                                                                                                                                                                                                                                                                                                                              | ECONOMY 4: one Essence Spring near home, not three                                                          |
| With few open loops between zones (small maps), one-cell room-wall gaps in wild zones that a gate can close without cutting anything off take gates; a map with a single gate site has a seeded border or quest gate                                                                                                                                                                                                                                 | Every map size has its gates                                                                                |
| The Keepers' Vault, when its zone is short of room at the full ring distance, tries again at half the distance                                                                                                                                                                                                                                                                                                                                       | Medium maps had no vault on most seeds                                                                      |
| Coverage: every placeable type appears on S seeds 1-14, M 1-6 and L 1-4 (`tests/core/map/density.test.ts`); event tiles and signs are map-authored and the vault is a rule of M and L                                                                                                                                                                                                                                                                | "Everything in the gallery should be on the map"                                                            |
| The decoration bead places on what is left: about half of passable ground has no object and no road (two thirds before; seeds 1-6 of each size)                                                                                                                                                                                                                                                                                                      | Room for butterflies and logs                                                                               |
