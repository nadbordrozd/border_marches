# Economy

Status: canonical for v0.2 (bead `border_marches-bzc.5`, 2026-11-24;
first written for the MVP in bead `border_marches-xaj.1`). It covers the
three v0.2 factions: [the Realm](FACTION_HUMANS.md),
[the Restless](FACTION_UNDEAD.md) and [the Goblin Horde](FACTION_GOBLINS.md).
The Lost World stays in the code and is not playable in v0.2; its numbers
are kept in [section 8.6](#86-the-lost-world-mvp-reference).

One place per number: faction dwellings, Drills, specials and creature
costs live in the faction documents; this document has the resources,
income, mines, pickups, the buildings every town shares, the marketplace,
the sanity pass and the experience curve. Calendar rules are in
[GAME_DESIGN.md](GAME_DESIGN.md#5-calendar); hiring, capture and flags in
[RULES_V2.md section 5](RULES_V2.md#5-players-and-the-adventure-layer).

## 1. Resources

| Resource | Role                                                          | Rarity on the map                                    |
| -------- | ------------------------------------------------------------- | ---------------------------------------------------- |
| Gold     | Pays for most things: every building, creature and hired hero | Income from halls and gold mines, gold piles, chests |
| Wood     | The staple building material                                  | Common: most mines are sawmills, many wood piles     |
| Ore      | Forts, advanced dwellings, the heaviest creatures             | Less common                                          |
| Essence  | Magic: guilds, casters, tier 6 creatures, lifting curses      | Rare: few springs                                    |

Each faction leans on one resource, so a start region binds differently:

| Faction  | Leans on        | All buildings (gold / wood / ore / essence) | One week of creatures                |
| -------- | --------------- | ------------------------------------------- | ------------------------------------ |
| Realm    | Gold and wood   | 52,500 / 155 / 104 / 22                     | 11,059 gold, 7 ore, 6 essence        |
| Restless | Ore and essence | 56,000 / 117 / 132 / 34                     | 10,625 gold, 2 ore, 9 essence        |
| Horde    | Wood            | 45,800 / 179 / 72 / 13                      | 9340 gold, 11 wood, 3 ore, 4 essence |
| Candy    | Essence, gold   | 50,050 / 150 / 70 / 32                      | 10,880 gold, 1 ore, 9 essence        |

## 2. Starting resources

The same for every player (RULES_V2 5.8).

| Gold | Wood | Ore | Essence |
| ---: | ---: | --: | ------: |
| 7500 |   20 |  10 |       4 |

## 3. Income

Paid at the start of every day from day 2. A mine flagged today pays from
tomorrow, to whoever holds the flag (RULES_V2 5.6).

| Source                           | Daily income                                             |
| -------------------------------- | -------------------------------------------------------- |
| Village Hall (start)             | 500 gold                                                 |
| Town Hall                        | 1000 gold (replaces the Village Hall)                    |
| City Hall                        | 2000 gold (replaces the Town Hall)                       |
| Resource Silo                    | +1 wood, +1 ore                                          |
| Sawmill                          | +3 wood                                                  |
| Ore Pit                          | +2 ore                                                   |
| Essence Spring                   | +1 essence                                               |
| Gold Mine                        | +750 gold                                                |
| Keystone Hall                    | +2000 gold                                               |
| Tithe Barn (Realm special)       | +250 gold                                                |
| Essence Still (Restless special) | +1 essence on every even day                             |
| Loot Pile (Horde special)        | No daily income: gold equal to the XP of each battle won |
| Bakery (Candy special)           | No income: +8 Gingerbread Men a week in its town         |
| A hero with a Resource specialty | RULES_V2 3.7                                             |

## 4. Mines

Flagged by visiting; a flag is taken by the next visitor (RULES_V2 5.6). A
map has more sawmills than ore pits and few essence springs. Generator
targets (per player start region, adjusted to map size):

| Mine           | Count | Placement                                                                      |
| -------------- | ----- | ------------------------------------------------------------------------------ |
| Sawmill        | 3-4   | At least 1 unguarded within 1 day of the town                                  |
| Ore Pit        | 2     | At least 1 within 1 day, guarded lightly (ring 0)                              |
| Essence Spring | 1-2   | **Exactly 1 within 2 days**, guarded at the top of its ring; any other far out |
| Gold Mine      | 1-2   | Ring 1 or further, guarded at the top of its ring                              |

Guard rings are defined in
[GAME_DESIGN.md section 8.3](GAME_DESIGN.md#83-guard-sizing). Start regions
are the same for every faction: the lean in section 1 is the player's
problem to solve, by trade or by reaching further.

## 5. Pickups

Taken from a next cell (the pile blocks its own cell until then;
[RULES_V2 5.6](RULES_V2.md#56-mines-dwellings-and-flags)). Every amount is
fixed by the map seed when the map is generated (shown before pickup on
hover).

| Pickup           | Amount                                  | Start region target              |
| ---------------- | --------------------------------------- | -------------------------------- |
| Wood pile        | 5-10 wood                               | 3-4 within 1 day of the town     |
| Ore pile         | 3-6 ore                                 | 1-2 within 1 day                 |
| Essence crystals | 2-4 essence                             | 1 within 1 day, more further out |
| Gold pile        | 300-800 gold, in steps of 100           | 2-3 within 1 day                 |
| Treasure chest   | The player chooses: 1000 gold or 750 XP | 1 within 1 day                   |

## 6. Buildings every town shares

Names differ by faction (the faction documents list them); costs,
requirements and effects do not. One building per town per day.

### 6.1 Costs

| Building      | Cost                                  | Requires                       | Effect                                                      |
| ------------- | ------------------------------------- | ------------------------------ | ----------------------------------------------------------- |
| Village Hall  | (start)                               | -                              | Income 500 gold a day                                       |
| Town Hall     | 2500 gold, 5 wood, 2 ore              | -                              | Income 1000 gold a day                                      |
| City Hall     | 5000 gold, 10 wood, 5 ore, 3 essence  | Town Hall, Fort 1, Marketplace | Income 2000 gold a day                                      |
| Fort 1        | 2000 gold, 15 wood                    | -                              | Fort level 1 (RULES_V2 5.5); needed for the tier 3 dwelling |
| Fort 2        | 3000 gold, 10 wood, 10 ore            | Fort 1                         | Fort level 2                                                |
| Fort 3        | 5000 gold, 10 wood, 15 ore, 2 essence | Fort 2, City Hall              | Fort level 3 and its tower                                  |
| Marketplace   | 500 gold, 5 wood                      | -                              | Trade ([section 7](#7-marketplace))                         |
| Resource Silo | 1500 gold, 5 ore                      | Marketplace                    | +1 wood and +1 ore a day                                    |
| Magic Guild 1 | 1500 gold, 5 wood, 5 ore              | -                              | Four tier 1 spells; heroes here start the day at full mana  |
| Magic Guild 2 | 1500 gold, 5 wood, 5 ore, 1 essence   | Magic Guild 1                  | Three tier 2 spells, one a condition tool                   |
| Magic Guild 3 | 2000 gold, 5 wood, 5 ore, 2 essence   | Magic Guild 2                  | Three tier 3 spells; lifts curses for 2000 gold             |
| Magic Guild 4 | 2500 gold, 10 wood, 10 ore, 4 essence | Magic Guild 3, City Hall       | Two tier 4 spells (not the Horde)                           |
| Magic Guild 5 | 3500 gold, 10 wood, 10 ore, 6 essence | Magic Guild 4                  | One tier 5 spell (the Restless only)                        |
| Tavern        | (start)                               | -                              | Hire a hero for 2500 gold (RULES_V2 5.4)                    |

Fort levels do not change creature growth
([CONTENT_TAXONOMY.md](CONTENT_TAXONOMY.md) section 7.4). The MVP's
Stockade is a Lost World building only.

### 6.2 The Keystone Hall

Built with the map's buried Keystone, which a hero must carry into the
town; it needs a City Hall, costs nothing else and takes the day's build.
Every Keystone Hall gives **+2000 gold a day** and **+50% creature growth in
its town**, by the remainder rule of
[FACTION_LOST_WORLD.md section 6](FACTION_LOST_WORLD.md#6-town), plus one
faction power:

| Faction  | Keystone Hall     | Power                                                                         |
| -------- | ----------------- | ----------------------------------------------------------------------------- |
| Realm    | Round Table       | Every army of its owner has Morale +2                                         |
| Restless | Hall of Ancestors | Its owner's stacks that got up do not crumble after a battle won              |
| Horde    | The Great Flinger | Every native stack in its owner's armies has Cannonball                       |
| Candy    | The Four O'Clock  | Every native stack in its owner's armies starts each battle Hastened, clock 1 |

### 6.3 Drills

A Drill is a town building that gives one creature a second ability, with
no new sprite. Each faction has three, listed in its document.

- Building a Drill sets a permanent flag for the player: from then on
  **every stack of that creature in that player's armies and garrisons has
  the ability**, wherever it was recruited and whoever leads it. The flag
  survives the loss of the town.
- A battle reads each side's Drill flags at setup. Neutral stacks have
  none.
- A map **drill yard** sells the same flag to its visitor's player for
  twice the building's gold cost and no other resource (the Butts: 2000
  gold; the Tiltyard: 5000 gold).

## 7. Marketplace

Rates are fixed; more marketplaces do not change them. Trades between two
resources go through gold at these rates (10 wood buys 1 ore).

| Resource | Buy 1 for | Sell 1 for |
| -------- | --------: | ---------: |
| Wood     |  250 gold |    25 gold |
| Ore      |  250 gold |    25 gold |
| Essence  |  600 gold |    60 gold |

Other fixed prices, set in RULES_V2: a hero costs 2500 gold (5.4); lifting
a curse costs 2000 gold at a Magic Guild 3 or 1000 gold and 2 essence at a
map site (4.3); artifacts trade at their grade value (4.2).

## 8. Sanity pass

Hand calculations and a spreadsheet-style day ledger; no simulations of the
game. Assumptions for a normal start region, the same for every faction:
sawmill flagged day 2, ore pit day 4, essence spring day 5, second sawmill
day 8, gold mine day 9; week 1 pickups as in the tables below; from week 2
each week brings 2 gold piles (500 each), a chest taken as gold, a wood
pile (7), an ore pile (4) and essence crystals (3).

### 8.1 Creature costs across factions

Fight value (FV) is GAME_DESIGN 8.2. Gold per FV is the gold price alone.

| Tier | Realm                                | Restless                          | Horde                               | Candy                                     | Lost World (reference)        |
| ---: | ------------------------------------ | --------------------------------- | ----------------------------------- | ----------------------------------------- | ----------------------------- |
|    1 | Squire 46 (0.71)                     | Skeleton 42 (0.68)                | Goblin 40 (0.69)                    | Gingerbread Man 40 (0.70)                 | Caveman 50 (0.83)             |
|    2 | Longbowman 115 (1.06)                | Ghoul 115 (1.07)                  | Bomb Chucker 110 (1.01)             | Peppermint Archer 120 (1.11)              | Spitter 110 (0.90)            |
|    3 | Man-at-Arms 240 (1.14)               | Banshee 260 (1.30)                | Wolf Rider 190 (1.40)               | Taffy Wrangler 240 (1.29)                 | Raptor 220 (1.27)             |
|    4 | Friar 400 + 1 e (1.70)               | Gravecaller 500 + 1 e (2.07)      | Boomshaman 380 + 1 e (1.78)         | Sugarplum 430 + 1 e (1.89)                | Shaman 450 + 1 e (1.16)       |
|    5 | Knight 1050 + 2 o (1.20)             | Vampire 1200 + 1 e (1.63)         | Ogre 950 + 3 w (1.09)               | Gummy Bear 1100 + 1 e (1.28)              | Triceratops 1100 + 2 o (1.30) |
|    6 | Dragonslayer 4000 + 3 o + 2 e (1.76) | Late King 3000 + 2 o + 3 e (1.38) | Orc Warboss 2500 + 5 w + 3 o (1.32) | Rock Candy Dragon 3600 + 1 o + 3 e (2.06) | T-Rex 3000 + 4 o + 2 e (1.20) |

| Per week, all six dwellings |  Realm | Restless |  Horde |  Candy | Lost World |
| --------------------------- | -----: | -------: | -----: | -----: | ---------: |
| Fight value                 |   8335 |     7700 |   7836 |   7505 |       8899 |
| Gold                        | 11,059 |   10,625 |   9340 | 10,880 |     10,230 |
| Gold-equivalent of the rest |   5350 |     5900 |   5900 |   5650 |       5600 |
| Tier 6 chain, gold          | 18,000 |   18,000 | 16,000 | 17,750 |     18,000 |

- **The Candy Kingdom (bzc.111, playable since bzc.117)** is priced by hand
  to these scales ([FACTION_CANDY.md](FACTION_CANDY.md#4-roster)) and not
  yet through the balance runs; the Rock Candy Dragon (2.06 gold per FV)
  pays for Afters, a second attack each round that the FV formula does not
  count. Its balance bead (bzc.118) measures it first.

- **Prices tuned by the balance bead (bzc.24).** Simulated equal-cost
  battles ([BALANCE.md](BALANCE.md)) moved eight prices: Squire 55 to 45,
  Goblin 35 to 40, Banshee 240 to 260, Knight 1200 to 1050, Ogre 1050 to
  950, Dragonslayer 3000 to 3500, Late King 2900 to 3600, Orc Warboss 2800
  to 2500.
- **Round 2 (bzc.36)** moved four more: Goblin 40 to 38, Vampire 1100 to
  1200, Late King 3600 to 3000, Dragonslayer 3500 to 4000 (BALANCE.md
  section 8). **Round 3 (bzc.38)** moved four: Squire 45 to 46, Skeleton
  45 to 42, Goblin 38 to 37, Gravecaller 420 to 500 (BALANCE.md section
  9). **Round 4 (bzc.40)** moved the Goblin: 37 to 40 gold with HP 8 to
  10 (FV 52 to 58; BALANCE.md section 10). The week 1 ledgers (8.2) and tier 6 dates (8.3) below are
  recomputed with these prices by `node tests/sim/run.mjs
./tests/sim/ledger.ts`.
- The rule: tiers 1 to 3 cost 0.7 to 1.4 gold per FV, rising with tier;
  tier 5 and 6 cost 1.2 to 1.5 plus resources; **a caster costs about 1.7
  to 2.1 and an essence**, because its pages are not in its FV (the
  Gravecaller is the dearest since round 3: its summons and Pass on carried
  the Restless's middle game).
- Weekly gold differs by up to 18% (the Realm pays most, for the
  strongest late game) and total weekly cost in gold at marketplace buying
  prices by up to 8% (16,409; 16,525; 15,240; the Candy Kingdom 16,530).
- Weekly FV differs on purpose. The Restless get a third of each dead
  stack back inside the fight; the Horde's area Strikes and unretaliated
  Cannonballs are not in the formula; the Realm's edge (extra turns,
  covering fire) needs set-up. These three gaps are the first thing the
  balance bead should measure.

### 8.2 Week 1: build and recruit paths

Values are after the day's actions. Every path builds the Town Hall first
and buys every creature it can.

**Realm**

| Day | Pickups and mines        | Build         | Recruit       | Gold | Wood | Ore | Essence |
| --: | ------------------------ | ------------- | ------------- | ---: | ---: | --: | ------: |
|   1 | wood 7, gold 500         | Town Hall     | 14 Squires    | 4856 |   22 |   8 |       4 |
|   2 | gold 600, flag Sawmill   | Archery Range | 9 Longbowmen  | 4621 |   17 |   6 |       4 |
|   3 | essence 3, wood 6        | Palisade      | -             | 3621 |   11 |   6 |       7 |
|   4 | ore 4, chest (1000 gold) | Barracks      | 7 Men-at-Arms | 2741 |    9 |   5 |       7 |
|   5 | flag Essence Spring      | Friary        | 4 Friars      |  141 |    2 |   7 |       1 |
|   6 | wood 8                   | Marketplace   | -             |  641 |    8 |   9 |       2 |
|   7 | gold 400                 | -             | -             | 2041 |   11 |  11 |       3 |

**Restless**

| Day | Pickups and mines        | Build           | Recruit        | Gold | Wood | Ore | Essence |
| --: | ------------------------ | --------------- | -------------- | ---: | ---: | --: | ------: |
|   1 | wood 7, gold 500         | Town Hall       | 15 Skeletons   | 4870 |   22 |   8 |       4 |
|   2 | gold 600, flag Sawmill   | Charnel Pit     | 9 Ghouls       | 4635 |   20 |   3 |       4 |
|   3 | essence 3, wood 6        | Iron Railings   | -              | 3635 |   14 |   3 |       7 |
|   4 | ore 4, chest (1000 gold) | Wailing Tower   | 6 Banshees     | 2875 |   12 |   2 |       7 |
|   5 | flag Essence Spring      | Marketplace     | -              | 3375 |   10 |   4 |       7 |
|   6 | wood 8                   | Funeral Parlour | 4 Gravecallers |  375 |   21 |   1 |       1 |
|   7 | gold 400                 | -               | -              | 1775 |   24 |   3 |       2 |

**Horde**

| Day | Pickups and mines        | Build        | Recruit          | Gold | Wood | Ore | Essence |
| --: | ------------------------ | ------------ | ---------------- | ---: | ---: | --: | ------: |
|   1 | wood 7, gold 500         | Town Hall    | 20 Goblins       | 4700 |   22 |   8 |       4 |
|   2 | gold 600, flag Sawmill   | Powder Shed  | 10 Bomb Chuckers | 4500 |   14 |   8 |       4 |
|   3 | essence 3, wood 6        | Stakes       | -                | 3500 |    8 |   8 |       7 |
|   4 | ore 4, chest (1000 gold) | Wolf Kennels | 8 Wolf Riders    | 2980 |    3 |  12 |       7 |
|   5 | flag Essence Spring      | Marketplace  | -                | 3480 |    1 |  14 |       7 |
|   6 | wood 8                   | Hex Hut      | 4 Boomshamans    | 1160 |    2 |  16 |       2 |
|   7 | gold 400                 | -            | -                | 2560 |    5 |  18 |       3 |

| Week 1                           |                    Realm |                                     Restless |                                 Horde |
| -------------------------------- | -----------------------: | -------------------------------------------: | ------------------------------------: |
| Gold in (start, income, pickups) |                   16,000 |                                       16,000 |                                16,000 |
| Spent on buildings               |                     9000 |                                         9000 |                                  8500 |
| Spent on creatures               |                     4959 |                                         5225 |                                  4940 |
| Army bought, fight value         |                     4308 |                                         4061 |                                  4194 |
| Binding resource                 | Gold (141 left on day 5) | Ore (the Funeral Parlour waits a day for it) | Wood (the Hex Hut waits a day for it) |

Findings:

- **Each faction binds on its own resource in week 1**, which is the
  intended tension: the Realm on gold, the Restless on ore, the Horde on
  wood. All three reach four dwellings and a Marketplace by day 6.
- The Restless path works only with the ore pit flagged by day 4; without
  it the Funeral Parlour slips to week 2 or needs 500 gold of bought ore.
- The Horde path works with exactly two wood piles by day 3, like the
  Lost World's. It ends the week with 18 ore it has little use for:
  selling is poor value, so the Marketplace matters less to it than
  the second sawmill.
- **A second hero in week 1 costs 2500 gold**, about one dwelling and its
  first stock. The Realm cannot afford it on this path; the Restless and
  the Horde can on day 5, when they are waiting for a resource, at the
  price of some tier 4 recruits on day 6. Its starting army (FV about 1800) is worth 1400 to 1700 gold of creatures, so more than half the fee
  comes back as troops.
- The Magic Guild 1 (1500 gold, 5 wood, 5 ore) fits on day 7 for the Realm
  and the Horde; the Restless are short of ore again.

### 8.3 When can the player field a tier 6 creature?

A greedy ledger (`tests/sim/ledger.ts`, recomputed for round 4's
prices): build the Town Hall, then the tier 6 chain in tree order, one
building a day as soon as it is affordable, no trading; from week 2 the
pickups of the section header arrive on the week's days 1 to 5.

| Scenario                                | Realm: Lodge, first Dragonslayer | Restless: Mausoleum, first Late King | Horde: Boss Tent, first Warboss |
| --------------------------------------- | -------------------------------- | ------------------------------------ | ------------------------------- |
| Rush: recruit in week 1 only, then save | day 12, **day 14**               | day 14, **day 15**                   | day 12, **day 13**              |
| Recruit everything affordable every day | day 20, **day 22**               | day 20, **day 22**                   | day 15, **day 18**              |
| Rush with no essence spring             | day 12, day 14                   | day 19, day 26                       | day 12, day 13                  |

With the prices the hand ledger used (before bzc.24) the same script gives day 13, 15 and 13 for the
rush, 22, 21 and 19 for recruiting everything, and reproduces 8.2 to the
gold piece. Its no-spring row is earlier than the old hand ledger's (day
27 and 34 for the Realm and the Restless) because it counts the weekly
essence crystals; without them the Realm and the Restless wait for a
bought or found essence.

Answer: **a tier 6 creature at the end of week 2 for a player who rushes,
and in week 3 to 4 for one who keeps recruiting**, the same pace as the
Lost World's T-Rex (day 15). The Horde is a few days faster and does not
need the spring; the Restless depend on it most.

### 8.4 Steady state

- Full weekly recruitment costs about 10,000 gold for each faction. A City
  Hall (14,000 a week) covers it alone; a Town Hall and a gold mine
  (12,250) nearly do.
- One ore pit (14 a week) covers every faction's creature ore. **One
  essence spring (7 a week) covers the Realm (6) and the Horde (4) but not
  the Restless (9)**: they need the Essence Still, crystals or a second
  spring, which is their standing constraint.
- Wood: the Horde spends 11 a week on creatures and 179 on buildings and
  is the only faction that stays short of it. The Realm and the Restless
  run a wood surplus once the forts and guilds stand. Guilds, forts
  and Drills are the new wood sinks: a v0.2 town takes 117 to 179 wood
  against the MVP town's 80.
- New gold sinks beside creatures: heroes (2500 each, up to 8), the fort
  and guild chains (10,000 and 5000 to 11,000), Drills and specials (7300
  to 9500), drill yards, curse lifting and artifact traders. A player with
  two towns still cannot buy everything by week 6, which is the point.

### 8.5 Adjustments

Changed from the MVP: the Palisade's follow-up (Stockade, +50% growth) is
replaced by a plain Fort 2 and Fort 3; growth bonuses move to the Keystone
Hall. The City Hall now also needs a Marketplace. Guild, Drill, special
and Keystone prices are new. No income, mine, pickup or marketplace number
changed. The generator guarantees of the MVP pass still hold and are still
needed: **one essence spring within 2 days, two or more wood piles within 1
day, and an ore pit within 1 day**.

### 8.6 The Lost World (MVP reference)

Unchanged; costs are in
[FACTION_LOST_WORLD.md](FACTION_LOST_WORLD.md#6-town).

| Bundle                                                           |  Gold | Wood | Ore | Essence |
| ---------------------------------------------------------------- | ----: | ---: | --: | ------: |
| Every building in the town                                       | 30000 |   80 |  44 |      13 |
| The T6 chain                                                     | 18000 |   55 |  27 |      10 |
| One full week of all six dwellings (14, 9, 7, 4, 2, 1 creatures) | 10230 |    0 |   8 |       6 |

Its week 1 path (Town Hall, Spitter Nest, Palisade, Raptor Pen, Spirit
Lodge, Marketplace) spends 14,030 of 16,000 gold and binds on gold and
wood; its first T-Rex arrives on day 15 with one essence spring.

## 9. Experience curve

The rule is [RULES_V2.md section 3.2](RULES_V2.md#32-experience-and-levels);
this section records why. The MVP table of GAME_DESIGN 6.1 did not fit
feats, which come every third level and assume a game that reaches level
15 to 20.

**The problem.** XP is the HP of creatures killed. A guard's HP is about
an eighth of its fight value, so the guard rings of GAME_DESIGN 8.3 pay:

| Ring | Guard FV   | XP per guard |
| ---- | ---------- | -----------: |
| 0    | 600-1200   |       75-150 |
| 1    | 1200-3000  |      150-375 |
| 2    | 3000-8000  |     375-1000 |
| 3    | 8000-16000 |    1000-2000 |

A main hero that takes most of its player's fights on a dense map earns
about 1900 XP in week 1 (six guards and a chest), 2900 in week 2, 4200 in
week 3 and 5000 to 7000 a week after that, enemy heroes and towns
included: about 15,000 by the end of week 4 and 36,000 by week 8. The MVP
table is wrong at both ends for that supply. The first level takes eight
ring 0 fights and the first feat arrives in week 2. After level 13 each
level costs 20% more than the last, so the whole second month adds two
levels: level 15 and five feats at week 8, with level 18 at 60,514 XP out
of reach.

**The new table.** Total XP needed for level L:

```text
XP(L) = 100 x (L - 1) x (L + 2)
```

| Level |   XP |     | Level |     XP |     | Level |     XP |
| ----: | ---: | --- | ----: | -----: | --- | ----: | -----: |
|     2 |  400 |     |     9 |   8800 |     |    16 | 27,000 |
|     3 | 1000 |     |    10 | 10,800 |     |    17 | 30,400 |
|     4 | 1800 |     |    11 | 13,000 |     |    18 | 34,000 |
|     5 | 2800 |     |    12 | 15,400 |     |    19 | 37,800 |
|     6 | 4000 |     |    13 | 18,000 |     |    20 | 41,800 |
|     7 | 5400 |     |    14 | 20,800 |     |    25 | 64,800 |
|     8 | 7000 |     |    15 | 23,800 |     |    30 | 92,800 |

Each level costs 200 XP more than the one before (600 for level 3, 800 for
level 4). There is no cap and no change of formula at any level.

| End of week | XP earned (estimate) | MVP table | New table | Feats drafted (new) |
| ----------: | -------------------: | --------: | --------: | ------------------: |
|           1 |                 1900 |   level 2 |   level 4 |                   1 |
|           2 |                 4800 |   level 5 |   level 6 |                   2 |
|           3 |                 9000 |   level 7 |   level 9 |                   3 |
|           4 |               15,000 |  level 10 |  level 11 |                   3 |
|           6 |               27,000 |  level 13 |  level 16 |                   5 |
|           8 |               36,000 |  level 15 |  level 18 |                   6 |

- A hero reaches level 3 and its first feat in week 1, the Command's
  second step (C = 2 at level 5) in week 2, and six feats in a two-month
  game: the concept's "six or seven".
- The early levels are quick so a hired second hero is not hopeless: 1000
  XP, four or five small fights, gives it a feat.
- A chest's 750 XP is nearly two levels on day 1 and a tenth of a level by
  week 6, so the gold-or-XP choice flips during a game without a rule.
- The estimates depend on the map bead's guard density. If dense maps pay
  more than 7000 XP a week late on, raise the 100 in the formula; the
  shape should stay.

## 10. Changes

| Change                                                                                                                           | Why                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Hall incomes are totals that replace each other; no income on day 1; mines pay from the day after flagging                       | MVP brief left them unstated                                                                       |
| Resource-to-resource trades go through gold at the listed rates                                                                  | "Trade resources at fixed rates" gave only gold rates                                              |
| Start-region generator targets for mines and pickups                                                                             | The sanity passes depend on them                                                                   |
| Pickup amounts shown on hover before collection                                                                                  | Deterministic pillar: no hidden numbers                                                            |
| v0.2: halls, forts, the Marketplace, Silo and guilds cost the same in every faction                                              | "Normalised across factions": a faction's lean shows in its dwellings, Drills and creatures only   |
| v0.2: forts are three plain levels; no growth building below the Keystone Hall                                                   | RULES_V2 5.5 and the taxonomy; growth bonuses are the Keystone's prize                             |
| v0.2: the City Hall needs a Marketplace as well as Fort 1                                                                        | Gives the cheapest building a place in every opening                                               |
| v0.2: guild levels cost 0, 1, 2, 4, 6 essence                                                                                    | Essence is the magic resource; a level 5 guild is a 13-essence project                             |
| v0.2: Drills are per-player flags, sold on the map at twice the gold                                                             | No drilled and undrilled stacks to track; a captured or lost town cannot split an army's abilities |
| v0.2: the Keystone Hall gives +2000 gold, +50% growth and one faction power, and costs only the Keystone                         | The grail building of the taxonomy (7.3)                                                           |
| v0.2: the XP table becomes 100 x (L - 1) x (L + 2)                                                                               | Section 9; the rule is in RULES_V2 3.2 and GAME_DESIGN 6.1 points to it                            |
| v0.2 round 2 (bzc.36): Goblin 38, Vampire 1200, Late King 3000, Dragonslayer 4000; 8.2 and 8.3 recomputed by tests/sim/ledger.ts | Simulated battles ([BALANCE.md](BALANCE.md) section 8); the ledgers had kept the pre-bzc.24 prices |
