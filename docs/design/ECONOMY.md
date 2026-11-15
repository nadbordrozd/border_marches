# Economy

Status: canonical for the MVP (bead `border_marches-xaj.1`, 2026-11-15).
Building and creature costs live in
[FACTION_LOST_WORLD.md](FACTION_LOST_WORLD.md#6-town) (one place per
number); this document has the resources, income, mines, pickups, the
marketplace, totals and the sanity pass. Calendar rules are in
[GAME_DESIGN.md](GAME_DESIGN.md#5-calendar).

## 1. Resources

| Resource | Role                                                        | Rarity on the map                                    |
| -------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| Gold     | Pays for most things: every building and creature           | Income from halls and gold mines, gold piles, chests |
| Wood     | The staple building material                                | Common: most mines are sawmills, many wood piles     |
| Ore      | Advanced buildings and big creatures (Triceratops, T-Rex)   | Less common                                          |
| Essence  | Magic and special things: Shamans, the T-Rex, top buildings | Rare: few springs                                    |

## 2. Starting resources

| Gold | Wood | Ore | Essence |
| ---: | ---: | --: | ------: |
| 7500 |   20 |  10 |       4 |

## 3. Income

Paid at the start of every day from day 2. A mine flagged today pays from
tomorrow.

| Source               | Daily income                          |
| -------------------- | ------------------------------------- |
| Village Hall (start) | 500 gold                              |
| Town Hall            | 1000 gold (replaces the Village Hall) |
| City Hall            | 2000 gold (replaces the Town Hall)    |
| Resource Silo        | +1 wood, +1 ore                       |
| Sawmill              | +3 wood                               |
| Ore Pit              | +2 ore                                |
| Essence Spring       | +1 essence                            |
| Gold Mine            | +750 gold                             |

## 4. Mines

Flagged by visiting; flags are permanent in the MVP. A map has more sawmills
than ore pits and few essence springs. Generator targets (per player start
region, adjusted to map size):

| Mine           | Count | Placement                                                                      |
| -------------- | ----- | ------------------------------------------------------------------------------ |
| Sawmill        | 3-4   | At least 1 unguarded within 1 day of the town                                  |
| Ore Pit        | 2     | At least 1 within 1 day, guarded lightly (ring 0)                              |
| Essence Spring | 1-2   | **Exactly 1 within 2 days**, guarded at the top of its ring; any other far out |
| Gold Mine      | 1-2   | Ring 1 or further, guarded at the top of its ring                              |

Guard rings are defined in
[GAME_DESIGN.md section 8.3](GAME_DESIGN.md#83-guard-sizing).

## 5. Pickups

Collected by visiting. Every amount is fixed by the map seed when the map is
generated (shown before pickup on hover).

| Pickup           | Amount                                  | Start region target              |
| ---------------- | --------------------------------------- | -------------------------------- |
| Wood pile        | 5-10 wood                               | 3-4 within 1 day of the town     |
| Ore pile         | 3-6 ore                                 | 1-2 within 1 day                 |
| Essence crystals | 2-4 essence                             | 1 within 1 day, more further out |
| Gold pile        | 300-800 gold, in steps of 100           | 2-3 within 1 day                 |
| Treasure chest   | The player chooses: 1000 gold or 750 XP | 1 within 1 day                   |

## 6. Cost totals (Lost World)

| Bundle                                                                                       |  Gold | Wood | Ore | Essence |
| -------------------------------------------------------------------------------------------- | ----: | ---: | --: | ------: |
| Every building in the town                                                                   | 30000 |   80 |  44 |      13 |
| The T6 chain (Spitter Nest, Palisade, Raptor Pen, Spirit Lodge, Horn Grounds, Tyrant's Lair) | 18000 |   55 |  27 |      10 |
| One full week of all six dwellings (14, 9, 7, 4, 2, 1 creatures)                             | 10230 |    0 |   8 |       6 |
| One T-Rex                                                                                    |  3000 |    0 |   4 |       2 |

## 7. Marketplace

Rates are fixed; more marketplaces do not change them in the MVP. Trades
between two resources go through gold at these rates (10 wood buys 1 ore).

| Resource | Buy 1 for | Sell 1 for |
| -------- | --------: | ---------: |
| Wood     |  250 gold |    25 gold |
| Ore      |  250 gold |    25 gold |
| Essence  |  600 gold |    60 gold |

## 8. Sanity pass

Hand calculations (no simulations of the game). Assumptions for a normal
start region: sawmill flagged day 2, ore pit day 4, essence spring day 5,
second sawmill day 8, gold mine day 9; week 1 pickups as in the table below;
from week 2 each week brings 2 gold piles (500), a chest taken as gold, a
wood pile (7), an ore pile (4) and essence crystals (3).

### 8.1 Week 1: build and recruit path

| Day | Pickups and mines        | Build        | Recruit    | Gold | Wood | Ore | Essence |
| --: | ------------------------ | ------------ | ---------- | ---: | ---: | --: | ------: |
|   1 | wood 7, gold 500         | Town Hall    | 14 Cavemen | 4800 |   22 |   8 |       4 |
|   2 | gold 600, flag Sawmill   | Spitter Nest | 9 Spitters | 4610 |   17 |   6 |       4 |
|   3 | essence 3, wood 6        | Palisade     | -          | 3610 |   11 |   6 |       7 |
|   4 | ore 4, chest (1000 gold) | Raptor Pen   | 7 Raptors  | 2870 |    4 |  10 |       7 |
|   5 | flag Essence Spring      | Spirit Lodge | 4 Shamans  |   70 |    2 |   5 |       1 |
|   6 | wood 8                   | Marketplace  | -          |  570 |    8 |   5 |       2 |
|   7 | gold 400                 | -            | -          | 1970 |   11 |   5 |       3 |

Values are after the day's actions. Week 1 spends 14,030 gold (9,000 on
buildings, 5,030 on recruits) out of 16,000 (7,500 start, 6,000 income,
2,500 from pickups).

Findings:

- **Gold and wood bind together in week 1, which is the intended tension.**
  The full path (Town Hall plus four dwellings by day 5, every creature
  bought) works with exactly two wood piles in reach by day 3. With one wood
  pile the player must skip or delay the Town Hall or a dwelling.
- Ore is comfortable early (10 start, 9 used by day 5).
- Essence: the Spirit Lodge (2) plus 4 Shamans (4) uses all 4 starting
  essence plus the crystals; the spring keeps Shamans going.
- The Town Hall pays back in 5 days (+500/day for 2500), the City Hall in 5
  days (+1000/day for 5000 and resources): both sound early picks.

### 8.2 When can the player field a T-Rex?

Rushing the T6 chain (Town Hall, then the chain in order) and recruiting
whatever is left, saving for the first T-Rex once the Lair stands:

| Scenario                             | Horn Grounds | Tyrant's Lair |         First T-Rex | Note                                     |
| ------------------------------------ | -----------: | ------------: | ------------------: | ---------------------------------------- |
| 1 spring, Shamans bought every week  |        day 9 |        day 13 | **day 15 (week 3)** | The intended path                        |
| No spring, no Shamans                |        day 7 |        day 12 |     day 18 (week 3) | Waits for crystals; no T4 at all         |
| No spring, Shamans bought every week |        day 9 |        day 25 |        after week 4 | Shamans and the Lair compete for essence |

Answer: **yes, a T-Rex by week 3 with one essence spring**, while still
recruiting most of the army. Without a spring the player must choose
between Shamans and the T-Rex, or buy essence at 600 gold (the 12 essence of
the chain plus one T-Rex cost 7,200 gold).

### 8.3 Steady state

- Full weekly recruitment of all six tiers costs 10,230 gold, 8 ore and 6
  essence. One ore pit (14 a week) covers the ore; **one essence spring (7 a
  week) covers the essence**; a City Hall (14,000 a week) covers the gold
  alone.
- The 1-spring rush army at the end of week 4 has a fight value of about
  33,000 before losses, slightly above the Warlord's Hold garrison (30,062):
  the Hold is a week 4-5 goal for a strong player.
- Wood piles up after the buildings are done (about 90 by day 21 and 140 by
  day 28 in the rush): a known MVP surplus. Later factions, spells and
  artifacts are expected to add wood sinks; until then the Marketplace turns
  it into a little gold.

### 8.4 Adjustments

No cost or income number was changed. The sanity pass adds generator
guarantees (section 4 and 5 start-region targets): **one essence spring
within 2 days** and **two or more wood piles within 1 day**, without which
the week-1 and T-Rex timelines above do not hold.

## 9. Changes from brief

| Change                                                                                                                          | Why                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Hall incomes are totals that replace each other                                                                                 | Unstated in the brief; Heroes-style halls replace                         |
| No income on day 1; mines pay from the day after flagging                                                                       | Timing was unstated                                                       |
| Resource-to-resource trades go through gold at the listed rates                                                                 | "Trade resources at fixed rates" gave only gold rates                     |
| Start-region generator targets for mines and pickups, including one essence spring within 2 days and 2+ wood piles within 1 day | The sanity pass shows the week-1 path and the week-3 T-Rex depend on them |
| Pickup amounts shown on hover before collection                                                                                 | Deterministic pillar: no hidden numbers                                   |
