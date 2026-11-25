# Battle balance (v0.2)

Status: beads `border_marches-bzc.24` (round 1, sections 1-7) and
`border_marches-bzc.36` (round 2, section 8), 2026-11-25. Section 7 lists
what round 1 left, section 8.6 what is left now. Simulations are a design
tool, not unit tests: nothing here runs in `npx vitest run`. Every table is
reproduced by the runner commands next to it.

## 1. Method

- **Battles.** Seeded AI-against-AI battles through the real engine, with
  battle AI v2 (`src/core/battle/ai.ts`) on both sides, in its full mode
  (policy `v2`; the fast mode of AI.md "Battle AI fast mode" is for
  battles no human watches, not for balance runs). Every chosen action
  is checked with `actionError` first; no run in this document had an
  illegal action.
- **Armies.** `tests/sim/armies.ts`: a faction army is bought with a gold
  budget (resources at wood 150, ore 150, essence 400 gold), a seeded share
  per tier weighted by weekly growth x cost, the leftover on tier 1, so
  armies look like a town's recruits rather than one tier.
- **Stages.** Budgets and hero levels from ECONOMY.md section 8 (the week 1
  ledger, about 15,800 gold-equivalent of weekly recruits once all six
  dwellings stand, and the XP estimate):

  | Stage | Game time | Budget (gold equivalent) | Hero level | Guard ring |
  | ----- | --------- | -----------------------: | ---------: | ---------: |
  | early | week 1-2  |                     8000 |          5 |          1 |
  | mid   | week 4    |                   30,000 |         11 |          2 |
  | late  | week 8    |                   80,000 |         18 |          3 |

- **Heroes.** `full`: a named hero of one of the faction's two classes
  (might and magic alternate by seed), raised to the level by its class
  stat pattern, with a seeded book from the faction's guild weights and
  sometimes a scroll. `nobook`: the same hero with no pages, scrolls or
  mana (stats, skills, Command). `none`: no hero on either side. In round
  1 the sim heroes took no extra skills, feats or artifacts; round 2's are
  built as section 8.1 says (`--gear bare` gives round 1's).
- **Faction balance.** Every ordered pairing of the three factions (so each
  faction plays both sides of every matchup), 20 seeds each. A faction's
  win rate is over its cross-faction battles; "att win" is the attacker's
  rate over all nine pairings; "mirror att" the attacker's rate in the three
  mirror matches (equal value, the cleanest test of a side bias).
- **Guards.** A full hero attacking a map guard built exactly as the
  generator builds one (`stackFor` in `src/core/map/gen/guards.ts`: a stray
  of the stage's ring whose count fits 5 to 50, deployed by
  `splitNeutralStack`), sized to a ratio of the hero's army fight value.
- **Noise.** With 20 seeds a faction's rate rests on 80 battles: about
  plus or minus 6 points (one standard error). Read single cells with that
  in mind; the trend across stages and hero modes is the signal.

### Runner commands

```text
npm run sim:battles -- --mode report --seeds 20             # faction table, every stage and hero mode
npm run sim:battles -- --mode report --seeds 20 --matrix    # ... with every pairing's attacker rate
npm run sim:battles -- --mode guards --seeds 20 --ratios 0.5,0.75,1.0,1.25,1.5
npm run sim:battles -- --mode tiers                         # value per gold per tier (section 6)
npm run sim:battles -- --mode duels --seeds 20 --budget 6000 # one tier against the same tier
npm run sim:battles -- --mode balance --seeds 20            # the bzc.20 table (budget 12000, level 6)
npm run sim:battles -- --mode balance --hero none --trace "humans v goblins" --seed 1003 --budget 8000 --level 5
node tests/sim/run.mjs ./tests/sim/ledger.ts                # ECONOMY 8.2 and 8.3 ledgers
```

Options: `--stage early,mid,late`, `--hero full,nobook,none`, `--limit N`
(a round limit for every battle), `--a v2:<weight>=<n>,...` (AI weight
overrides), `--pf <faction>=<policy>` (one faction's own policy),
`--gear stage|bare` (round 2's heroes or round 1's), `--acts` (hero acts
per battle by faction) and
`--tweak <creature>.<field>=<n>,class:<class>.<stat>=<n>,school:<faction>.<school>=<n>`
(try a number before writing it into `src/data`). A full report takes about
six minutes on one core; run one process per stage and hero mode
(`--stage`, `--hero`) and it takes two.

## 2. Before: the bzc.20 measurement

Battle AI v2 on both sides, budget 12,000, hero level 6, 20 seeds
(`--mode balance`, commit ef99cf6): humans won 28% of cross-faction
battles, undead 55%, goblins 68%; **the attacker won 30%** (0% for humans
attacking undead or goblins), battles averaged 19 rounds and **40% ended
at the 30-round limit**, where the defender won by rule; a hero against a
guard of 0.8 of its fight value won only 50-65%.

The same rules through the new stage report (old engine rule restored for
the run, old AI weights `--a v2:behindPresses=0,guardsPress=0,fearRounds=12`,
`--limit 30`, the prices of ef99cf6):

| Stage | Heroes | Humans | Undead | Goblins | Att win | Mirror att | Rounds | At limit |
| ----- | ------ | -----: | -----: | ------: | ------: | ---------: | -----: | -------: |
| early | full   |    30% |    56% |     64% |     15% |        10% |   21.0 |      43% |
| early | nobook |    35% |    59% |     56% |     13% |        17% |   21.9 |      45% |
| early | none   |    29% |    54% |     68% |     18% |        17% |   22.9 |      45% |
| mid   | full   |    34% |    59% |     58% |     22% |        28% |   19.0 |      42% |
| mid   | nobook |    40% |    58% |     53% |     17% |        20% |   19.5 |      44% |
| mid   | none   |    40% |    59% |     51% |     17% |        22% |   20.5 |      46% |
| late  | full   |    54% |    53% |     44% |     25% |        33% |   17.8 |      37% |
| late  | nobook |    54% |    58% |     39% |     27% |        28% |   18.4 |      41% |
| late  | none   |    64% |    59% |     28% |     22% |        25% |   20.0 |      43% |

Faction rates here are distorted by the side bias: a faction that defends
well "wins" by stalling.

## 3. The structural fix: the round limit

**The cause.** A defender lost nothing by waiting: the AI defender held
back out of reach, the attacker had to walk into first strikes, and if it
did not break the defence in 30 rounds it lost anyway. Even mirror matches
went to the defender 70-90% of the time.

**Options compared** (budget 12,000, level 6, 20 seeds per pairing; "att"
is the attacker's mean rate over the nine faction pairings; rounds and the
limit share are over faction battles; "guard" is a hero against a guard of
0.8 of its fight value). The verdict rows ran with this bead's engine
change; the first two with the old defender-wins line restored.

| Variant                                                    | Att | Rounds | At limit | Guard (rounds) |
| ---------------------------------------------------------- | --: | -----: | -------: | -------------- |
| 30 rounds, defender wins (before)                          | 21% |   20.1 |      40% | 60% (16.4)     |
| 12 rounds, defender wins                                   |  9% |   11.3 |      78% | 53% (9.1)      |
| 30 rounds, more fight value left wins                      | 46% |   20.1 |      40% | 100% (16.4)    |
| ... and the side behind on that verdict presses (AI)       | 48% |   16.8 |      22% | 100% (9.0)     |
| 15 rounds, verdict, old AI                                 | 47% |   13.4 |      58% | 100% (10.4)    |
| 12 rounds, verdict, behind presses, guards press           | 49% |   11.2 |      74% | 100% (8.6)     |
| 15 rounds, verdict, behind presses, guards press           | 49% |   13.0 |      44% | 100% (8.9)     |
| 12 rounds, verdict, behind presses, fear fades in 6 rounds | 49% |   10.1 |      33% | 100% (7.2)     |
| 20 rounds, the same                                        | 49% |   11.8 |      16% | 100% (7.2)     |
| 30 rounds, the same                                        | 49% |   13.3 |      16% | 100% (7.2)     |
| **15 rounds, the same (chosen; 40 seeds)**                 | 52% |   10.9 |      20% | 100% (7.2)     |

Reproduce a row with `--mode balance --seeds 20 --limit <n> --a
v2:behindPresses=<0|1>,guardsPress=<0|1>,fearRounds=<12|6>`; the two
defender-wins rows also need `finish(d, "defender", "roundLimit")` in
`endRound` (src/core/battle/engine.ts). These ran on the prices of
ef99cf6.

Also tried and not taken:

- **Speed ties to the defender** instead of the attacker (first-move
  fairness): the attacker's rate and the mirror rate moved by at most 4
  points (early and mid stages, 16 seeds), so GAME_DESIGN 9.2 stands.
- **Making a defender's Wait or Defend cost something after N rounds:** not
  needed once the verdict removed the reason to stall, and it would have
  added a rule to every battle.
- **Placement:** deployment is already mirror-symmetric (columns 0 and 14,
  the same rows), and with the verdict the mirror matches sit near 50%.

**The rule (RULES_V2 1.12, GAME_DESIGN 8.2 note).** The round limit is 15. If neither side is beaten by the end of round 15, the side with more
fight value left wins (per living, non-summoned stack it owns: creature FV
x HP left / creature HP, rounded down); a tie goes to the defender; the
loser's survivors flee, so the loser is defeated as if eliminated and the
winner keeps its survivors (`gameResultFromEngine`). It is deterministic
and exact: the rehearsal of the round's last action shows the end.

**The AI (`src/core/battle/ai.ts`).** The pressing behaviour that the
attacker used to have (less fear of the enemy's reach, more weight on its
own threat, growing each round) now belongs to the side that would lose at
the limit as the board stands (`behindPresses`), and to any neutral guard
(no hero, no native stack: `guardsPress`); the fear fades over 6 rounds
instead of 12 (`fearRounds`). The old behaviour is
`--a v2:behindPresses=0,guardsPress=0,fearRounds=12`.

**The screen.** The battle's top bar reads "Round 3 of 15" and "13 rounds
left · At the limit: you win, 4200 to 3800", with the rule and both
numbers on hover; it glows in the last three rounds and turns green when
the verdict favours the player (`roundLimitInfo` in
`src/ui/battle/info.ts`). The result dialog names a round-limit verdict
and its numbers.

**Result.** Under the chosen rule the attacker of an equal-value fight wins
48-58% with heroes (section 5) and battles average 10-12 rounds, with
about a quarter decided at the limit.

## 4. Guards

A hero (full, the stage's level) against a map guard of the generator's
creatures, guard fight value = ratio x the hero's army fight value; 20
seeds per faction per cell, all three factions pooled (60 battles a cell);
"lost" is the share of the hero's fight value lost in the battles it won.
Before: the old rule and AI as in section 2 (`--limit 30 --a
v2:behindPresses=0,guardsPress=0,fearRounds=12` with the old engine line).

| Stage (ring) | Ratio | Before: win | Before: rounds | After: win | After: rounds | After: at limit | After: lost |
| ------------ | ----: | ----------: | -------------: | ---------: | ------------: | --------------: | ----------: |
| early (1)    |  0.50 |         77% |           12.0 |       100% |           6.2 |              0% |          6% |
| early (1)    |  0.75 |         45% |           20.9 |       100% |           7.3 |              0% |         14% |
| early (1)    |  1.00 |         47% |           20.0 |        97% |           8.0 |              0% |         21% |
| early (1)    |  1.25 |           - |              - |        93% |           9.6 |              8% |         30% |
| early (1)    |  1.50 |           - |              - |        78% |          11.2 |             13% |         42% |
| mid (2)      |  0.50 |         83% |            9.7 |       100% |           5.5 |              0% |          4% |
| mid (2)      |  0.75 |         93% |            8.8 |       100% |           6.4 |              0% |          7% |
| mid (2)      |  1.00 |         87% |           11.4 |       100% |           7.7 |              0% |         20% |
| mid (2)      |  1.25 |           - |              - |        90% |          10.0 |              3% |         37% |
| mid (2)      |  1.50 |           - |              - |        57% |          11.7 |             27% |         48% |
| late (3)     |  0.50 |         90% |            7.8 |       100% |           4.9 |              0% |          1% |
| late (3)     |  0.75 |         95% |            7.4 |       100% |           6.0 |              0% |          6% |
| late (3)     |  1.00 |         87% |           10.3 |       100% |           7.5 |              0% |         19% |
| late (3)     |  1.25 |           - |              - |        93% |           8.8 |              2% |         38% |
| late (3)     |  1.50 |           - |              - |        52% |          11.6 |             22% |         55% |

**What ratio does the generator's rule make?** Guard FV = 0.75 x prize
value x ring factor (0.8, 1.0, 1.2, 1.4). Take as the intended army one
worth the prize ("an army of matching value"): seeded armies have about
1.1 FV per gold at 3000-8000 gold, 0.7 at 30,000 and 0.65 at 80,000
(section 6), and prizes rise with the ring, so the guard is about 0.5
(ring 0), 0.7 (ring 1), 0.95 (ring 2) and up to 1.25 (the largest ring 3
prizes) of that army. Every one of those cells is a win 90% of the time or
more, with losses of 6% to 38% of the army, rising with the ratio. A
player's real army at that stage is larger than the prize, so the fight
is easier still. **The guard sizing constants are unchanged**
(`src/core/map/gen/guards.ts`, `src/data/mapObjects.ts`): the round-limit
fix and pressing guards alone made guards winnable, so the generator's
output, and the named maps' fingerprints, do not change.

## 5. Faction tuning

**Changes** (prices only; no stats, growth or abilities changed, so every
worked combo keeps its numbers):

| Creature     | Was                           | Now                           | Why                                                                                   |
| ------------ | ----------------------------- | ----------------------------- | ------------------------------------------------------------------------------------- |
| Squire       | 55 gold                       | 45 gold                       | The weakest tier 1 (0% in tier duels before); the Realm's early game                  |
| Goblin       | 35 gold                       | 40 gold                       | The strongest tier 1 (100% in tier duels before); the Horde won 85% early             |
| Banshee      | 240 gold                      | 260 gold                      | The Restless won about 70% at mid stage whatever the heroes                           |
| Knight       | 1200 gold + 2 ore             | 1050 gold + 2 ore             | The Realm's middle game (13-28% at mid stage)                                         |
| Late King    | 2900 gold + 2 ore + 3 essence | 3600 gold + 2 ore + 3 essence | The best tier 6 in duels (88%); two Kings carried the Restless's mid stage            |
| Dragonslayer | 3000 gold + 3 ore + 2 essence | 3500 gold + 3 ore + 2 essence | Offsets the cheaper Squire and Knight late (the Realm won 61-69% late without heroes) |
| Ogre         | 1050 gold + 3 wood            | 950 gold + 3 wood             | The Horde fell to 28-45% late                                                         |
| Orc Warboss  | 2800 gold + 5 wood + 3 ore    | 2500 gold + 5 wood + 3 ore    | The weakest tier 6 (0% in tier duels); the Horde's late game                          |

Tried and dropped: raising Knight Errant and Enchanter starting stats
(+2 Attack +1 Defense, +1 Power) closed the Realm's hero gap by about 5
points but breaks RULES_V2 3.1 (six starting stat points per class);
cheaper Friars, Longbowmen and Men-at-Arms, and a dearer Vampire or
Gravecaller, each moved their faction by less than the noise. The search
used `--tweak` with 12-16 seeds per pairing over about 25 variants.

**After** (`--mode report --seeds 20 --matrix`, this commit):

| Stage | Heroes | Humans | Undead | Goblins | Att win | Mirror att | Rounds | At limit |
| ----- | ------ | -----: | -----: | ------: | ------: | ---------: | -----: | -------: |
| early | full   |    31% |    58% |     61% |     58% |        62% |   12.2 |      29% |
| early | nobook |    45% |    58% |     48% |     58% |        60% |   12.5 |      28% |
| early | none   |    56% |    56% |     38% |     64% |        67% |   13.5 |      38% |
| mid   | full   |    36% |    56% |     58% |     48% |        52% |   10.9 |      27% |
| mid   | nobook |    46% |    58% |     46% |     51% |        43% |   10.7 |      23% |
| mid   | none   |    53% |    58% |     40% |     47% |        42% |   11.6 |      26% |
| late  | full   |    54% |    36% |     60% |     52% |        48% |   10.7 |      23% |
| late  | nobook |    55% |    45% |     50% |     51% |        47% |   10.4 |      22% |
| late  | none   |    69% |    40% |     41% |     53% |        53% |   11.7 |      33% |

The bzc.20 setting after (`--mode balance --seeds 20`, budget 12,000,
level 6): humans 50%, undead 61%, goblins 39% of cross-faction battles;
the attacker 54% over the nine pairings (mirrors 47%); 11.6 rounds; 29% at
the limit; heroes beat 0.8 guards 100% in 6-8 rounds. No illegal action in
any run.

**The widest gap per stage** (the largest distance of any faction from
50%, over the three hero modes), before and after: early 21 and 19
points, mid 16 and 14, late 22 and 19; the attacker's rate moved from
13-27% to 47-64%. 21 of the 27 faction cells are inside 40-60% (before:
18, with the side bias in every one), and 25 inside 35-65%.

## 6. Value per gold, tier by tier

`--mode tiers` (FV is GAME_DESIGN 8.2; cost counts wood and ore at 150
gold and essence at 400; casters' pages are not in their FV):

| Tier | Realm             | FV / 1000 g | Restless          | FV / 1000 g | Horde             | FV / 1000 g |
| ---: | ----------------- | ----------: | ----------------- | ----------: | ----------------- | ----------: |
|    1 | Squire 45         |        1444 | Skeleton 45       |        1378 | Goblin 40         |        1300 |
|    2 | Longbowman 115    |         948 | Ghoul 115         |         930 | Bomb Chucker 110  |         991 |
|    3 | Man-at-Arms 240   |         879 | Banshee 260       |         769 | Wolf Rider 190    |         716 |
|    4 | Friar 800         |         294 | Gravecaller 820   |         295 | Boomshaman 780    |         274 |
|    5 | Knight 1350       |         648 | Vampire 1500      |         491 | Ogre 1400         |         624 |
|    6 | Dragonslayer 4750 |         479 | Late King 5100    |         425 | Orc Warboss 3700  |         512 |
| week | all six, 13,995 g |         596 | all six, 14,650 g |         526 | all six, 13,040 g |         592 |

Sanity: value per gold falls with tier in every faction (tiers 1-3 about
0.7-1.4 FV per gold, tiers 5-6 about 0.4-0.65); casters are the exception
by design (their pages are not in FV); the Restless's lower paper value is
paid back by their birthright (a third of each dead stack returns) and by
the Banshees' and Late Kings' abilities. Tier duels (`--mode duels --seeds
10 --budget 6000`, one tier against the same tier of each other faction,
no heroes; win rates Realm, Restless, Horde): tier 1 85%, 48%, 18%; tier 2
75%, 0%, 75% (the Ghoul is the only melee tier 2, so this is melee against
shooters, not a verdict); tier 3 85%, 35%, 30%; tier 4 25%, 63%, 63%;
tier 5 100%, 0%, 50%; tier 6 63%, 88%, 0%. Duels are lopsided by nature
(one creature type a side, nearly deterministic) and are a pointer, not a
target.

## 7. Known remaining imbalances

- **The Realm with a full hero, early and mid: 31% and 36%.** Without
  spells the Realm is at 45-46%, without heroes 53-56%. Its book (Accord
  heavy: Scapegoat, Change Places, Late Bell, Share) is set-up magic that
  the battle AI casts less profitably than the Restless's and the Horde's
  damage and banes (Last Breath, Cold Snap, Leech Line). Candidates for a
  follow-up: the AI's valuation of Accord links, or the Realm's spell
  weights; class stats are fixed by RULES_V2 3.1.
- **The Realm without heroes, late: 69%** (54-55% with heroes):
  Dragonslayers and Knights in numbers. A dearer Dragonslayer was the
  first step; the next would be its growth or Stand Fast.
- **The Restless with a full hero, late: 36%** (45% without spells, 40%
  without heroes).
- **The Horde without heroes, early: 38%** (48% without spells, 61% with a
  full hero: its hero carries it early).
- **The attacker without heroes, early: 64%** (mirrors 67%), the one stage
  and mode where the side bias is still outside 45-55%. Speed-tie order is
  not the cause (section 3). With heroes the attacker is at 48-58%.
- **About a quarter of battles end at the limit** (22-38%), mostly close
  fights where neither side can afford to engage. The verdict decides
  them fairly; a later AI pass could make the side ahead press too.
- The sim heroes take no skills, feats or artifacts beyond their class's
  starting ones; real heroes at level 11-18 are stronger and could move
  every "full" row (round 2: they do, section 8.1).
- ECONOMY.md section 8's week 1 ledgers and tier 6 dates use the old
  prices (round 2: recomputed, section 8.3).

## 8. Round 2 (bzc.36)

### 8.1 Heroes that look like real ones

Round 1's heroes had pattern stats and a book drawn from the guild weights
whatever their school skills (a Knight Errant with no Accord rank knew
Accord pages). Round 2's (`buildHero` with a stage kit, the default gear):

- **Level-ups as in play:** every level adds the pattern stat, then the
  adventure AI's own choice (`AdventureAi.levelUp`) among the real seeded
  skill offers and, at every third level, feat drafts (RULES_V2 3.3-3.5).
- **A book it could have learnt:** every page of a seeded town guild of
  its faction up to the stage's level that its school ranks allow (2.2,
  `learnableFromGuild`), shrine pages of tiers 1-3 if learnable, and
  scrolls of tiers 1-2. A might hero without a school skill has no pages,
  as in play.
- **Worn artifacts:** seeded Trinkets and Wonders (no cursed items, no
  Marvel pieces), each in a free slot of its kind.

| Stage | Guild level | Shrine pages | Scrolls | Trinkets | Wonders |
| ----- | ----------: | -----------: | ------: | -------: | ------: |
| early |           1 |            0 |       1 |        1 |       0 |
| mid   |           3 |            1 |       1 |        2 |       1 |
| late  |     5 (cap) |            2 |       2 |        3 |       2 |

Early is guild 1 because the week 1 ledgers (ECONOMY 8.2) fit Guild 1 on
day 7, not Guild 2 (a first run with guild 2 early put the Horde's full
hero at 66%). The kits are `STAGE_KITS` in `tests/sim/armies.ts`.

### 8.2 The battle AI

`src/core/battle/ai.ts` (`DEFAULT_AI_WEIGHTS`, `conditionWorth`):

- **Scapegoat is valued by its two ends.** Before, a Scapegoat was worth
  0.5 x tempo x rounds x the bearer's value, whatever the far end, so the
  Realm linked its 100 Squires to its Longbowmen: every blow on the cheap
  Squires then landed on the dear shooters. Now it is worth that much
  times (1 - far end's value per HP / bearer's value per HP), on at most
  the HP the far end can absorb, and negative the wrong way round. The AI
  now links Knights and Dragonslayers to Squires.
- **Warded and Drenched are valued by the Harm they scale.** They act on
  Harm only (and a link carries its Harm unscaled, RULES_V2 1.4), so they
  are now worth size% x `harmShare` (0.2) x tempo x rounds x value instead
  of a flat 0.5% per size point (Warded 40 fell from 12% to 5% of the
  bearer's value): Sanctuary Oath is no longer cast where another page
  does more.
- **The side well ahead presses at the end** (`aheadRounds` 3,
  `aheadLead` 1.5): in the last three rounds a side with 1.5 times the
  other's fight value left presses as the side behind does. It cut the
  share of battles at the limit by 1-3 points (early full 27% to 24%) and
  moved no faction rate beyond noise.
- **Tried and dropped:** starting the side behind's pressing only six
  rounds before the limit (`pressLate`): 36-97% of battles then ended at
  the limit. Casting more freely for the Realm (cast threshold 1.5% of
  its value instead of 3%): 34% and 40% for its full hero early and mid,
  no better.

What the casts are worth, measured by turning one faction's casts off
(`--pf <faction>=v2:castFraction=99,lastCastFraction=99`, round 2's
heroes with guild 2 early): the Realm's casts are worth +5 points early
and +10 mid (28% to 33%, 33% to 43%), the Horde's +30 early and +9 mid
(36% to 66%, 36% to 45%). The Realm's gap is the content of its book more
than the AI's use of it: Accord's tier 1-2 pages set up (links, Shielded,
swaps) while Storm's and Hush's deal Harm, and the Weatherwitch and the
Mortician start with a damage page (Thunderclap, Last Breath) where the
Enchanter starts with Scapegoat.

### 8.3 Prices

| Creature     | Was                           | Now                           | Why                                                                         |
| ------------ | ----------------------------- | ----------------------------- | --------------------------------------------------------------------------- |
| Goblin       | 40 gold                       | 38 gold                       | The Horde without heroes was at 38-41% at every stage                       |
| Vampire      | 1100 gold + 1 essence         | 1200 gold + 1 essence         | Offsets the cheaper Late King at mid stage (the Restless were 56-63% there) |
| Late King    | 3600 gold + 2 ore + 3 essence | 3000 gold + 2 ore + 3 essence | The Restless fell to 35-45% late in every hero mode                         |
| Dragonslayer | 3500 gold + 3 ore + 2 essence | 4000 gold + 3 ore + 2 essence | The Realm won 63-69% late in every hero mode (69% without heroes)           |

No stats, growth or ability numbers changed, so the faction docs' worked
combos keep their numbers. Variants tried (all nine cells, 20 seeds):
Goblin 36 with Wolf Rider 175 (the Horde jumped to 60-78% early), Squire
42 (the Realm without heroes reached 69% early), Late King 3300 with the
Vampire unchanged (the Restless stayed at 61% mid). The ECONOMY 8.2
ledgers and 8.3 tier 6 dates are recomputed with these prices by
`node tests/sim/run.mjs ./tests/sim/ledger.ts`.

### 8.4 Before and after

`--mode report --seeds 20 --matrix --acts`, one process per cell (a cell
takes 1-2 minutes; `--stage` and `--hero` pick it). "Before" is round 1's
table (section 5, reproduced exactly at round 1's commit); "heroes" is
round 2's heroes with round 1's AI and prices (guild 2 early); "after" is
this commit merged with main (bzc.21 and bzc.34 included).

| Stage | Heroes | Before H / U / G | Heroes H / U / G | After H / U / G | Att win before / after | At limit before / after | Att at limit after |
| ----- | ------ | ---------------- | ---------------- | --------------- | ---------------------: | ----------------------: | -----------------: |
| early | full   | 31 / 58 / 61     | 31 / 53 / 66     | 36 / 45 / 69    |                58 / 57 |                 29 / 24 |                 56 |
| early | nobook | 45 / 58 / 48     | 48 / 55 / 48     | 50 / 43 / 58    |                58 / 53 |                 28 / 30 |                 56 |
| early | none   | 56 / 56 / 38     | 56 / 56 / 38     | 59 / 38 / 54    |                64 / 59 |                 38 / 31 |                 61 |
| mid   | full   | 36 / 56 / 58     | 40 / 59 / 51     | 35 / 63 / 53    |                48 / 47 |                 27 / 18 |                 48 |
| mid   | nobook | 46 / 58 / 46     | 54 / 50 / 46     | 48 / 60 / 43    |                51 / 55 |                 23 / 21 |                 65 |
| mid   | none   | 53 / 58 / 40     | 53 / 58 / 40     | 50 / 56 / 44    |                47 / 52 |                 26 / 26 |                 52 |
| late  | full   | 54 / 36 / 60     | 63 / 44 / 44     | 59 / 46 / 45    |                52 / 55 |                 24 / 14 |                 40 |
| late  | nobook | 55 / 45 / 50     | 68 / 35 / 48     | 63 / 43 / 45    |                51 / 58 |                 22 / 17 |                 58 |
| late  | none   | 69 / 40 / 41     | 69 / 40 / 41     | 53 / 45 / 53    |                53 / 56 |                 33 / 29 |                 49 |

Faction win rates in percent over cross-faction battles (H Realm, U
Restless, G Horde); "att at limit" is the attacker's share of the battles
decided at the limit. Mirror attacker rates after: 62, 58, 60, 50, 57,
50, 52, 57, 55. **21 of the 27 cells are inside 40-60% (round 1: 21) and
26 inside 35-65% (round 1: 25)**, now with heroes that have skills, feats,
artifacts and a book they could have learnt. Of round 1's six
out-of-band cells four are in: the Realm without heroes late (69 to 53),
the Restless with a full hero late (36 to 46), the Horde without heroes
early (38 to 54) and the attacker without heroes early (64 to 59). The
widest gap per stage: early 19 points (round 1: 19), mid 15 (14), late
13 (19).

Guards (`--mode guards --seeds 20 --ratios 0.5,0.75,1.0,1.25,1.5`, the
three factions pooled): a full hero beats a guard of its army's fight
value 95-100% of the time at every stage, losing 10-19% of its fight
value; at 1.5 times it still wins 87% (early), 82% (mid) and 95% (late).
Guards stay winnable at the generator's ratios (section 4). No run had an
illegal action or a policy exception.

### 8.5 Value per gold after

| Tier | Realm             | FV / 1000 g | Restless          | FV / 1000 g | Horde             | FV / 1000 g |
| ---: | ----------------- | ----------: | ----------------- | ----------: | ----------------- | ----------: |
|    1 | Squire 45         |        1444 | Skeleton 45       |        1378 | Goblin 38         |        1368 |
|    5 | Knight 1350       |         648 | Vampire 1600      |         460 | Ogre 1400         |         624 |
|    6 | Dragonslayer 5250 |         434 | Late King 4500    |         482 | Orc Warboss 3700  |         512 |
| week | all six, 14,495 g |         575 | all six, 14,250 g |         540 | all six, 13,000 g |         594 |

Tiers 2-4 are as in section 6; costs count resources as in section 1.

### 8.6 Remaining imbalances

- **The Realm with a full hero, early and mid: 36% and 35%** (50% and 48%
  without spells). Its book is weaker than the others' at those stages:
  the AI now uses it sensibly, and turning its casts off costs it 5-10
  points (8.2). Candidates, all content: a damage or heal page for the
  Enchanter's start (RULES_V2 3.6 wants a page of its starting school, so
  either an Accord page that heals or harms, or a Bloom start with Mend),
  or stronger Accord tier 1-2 numbers.
- **The Horde with a full hero, early: 69%** (58% without spells, 54%
  without heroes): the Weatherwitch's Thunderclap and Storm pages at
  level 5, which Launched makes safe to drop into a melee. Candidate:
  Thunderclap's numbers (12 + 6 x P). Mid and late the Horde is at 43-53%.
- **The Restless without heroes, early: 38%**, and **with a full hero,
  mid: 63%** (60% without spells). The Vampire price moved the mid stage
  by about 3 points; the next step is the Ghoul or the Banshee for the
  early stage and the Gravecaller for the middle.
- **The Realm without spells, late: 63%** (59% with a full hero, 53%
  without heroes): its might hero's Leadership (Morale +3, extra turns)
  against armies that are smaller in number. A skill question, not a
  price one.
- **The attacker** is at 47-59% in every cell; early without heroes it
  still wins 61% of the battles decided at the limit (the first volley:
  speed ties go to the attacker, GAME_DESIGN 9.2).
- **About a fifth of battles end at the limit** (14-31%, round 1 22-38%);
  the side ahead pressing at the end moved it little.
- Noise: a faction cell is 80 battles, about plus or minus 6 points.
  Several of these cells sit within one standard error of the band; the
  trends across hero modes are the signal.
