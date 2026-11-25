# Adventure AI v1

Bead `border_marches-bzc.19`. The computer player of the adventure map:
`AdventureAi` in `src/core/ai/` implements `PlayerController`
(`src/core/game/controller.ts`) and replaces the stand-in `SimpleAi` in the
game (`src/ui/game.ts`). `SimpleAi` stays as the baseline of the match
runner.

The design below is v1; [Iteration 1](#iteration-1-bead-bzc21) at the end
of this file lists what changed since (fight estimates, the turn budget,
town defence, troop trips, puzzle sites) and supersedes v1 where they
differ, and [Iteration 2](#iteration-2-bead-bzc22) after it (fight
families, who is winning, openings, spells, quests) supersedes both.

## Design

Every `decide(state, player)` call looks at the state afresh and returns
the most urgent action, in this order:

1. **Site choice** at the object a hero stands on: hire at a dwelling, a
   stat at the arena (academy when rich), a Keepers' Vault treasure by
   prize value, a curse lifted.
2. **Hero upkeep**: assemble a Marvel, wear a found artifact in an empty
   slot or over a cheaper one (never a cursed one), read a scroll of sight,
   drink a mana potion when low.
3. **Towns** (`economy.ts`): hire a second hero at once and a third when
   rich (day 10+, 8500 gold); build one building a day by a rank that
   works for any faction tree (Town Hall, tier-2 dwelling, fort, tier-3,
   City Hall, tier-4, marketplace, guild 1, tier-5, silo, specials,
   drills, upper fort and guild), missing requirements first; save for a
   key building it cannot afford (and buy its missing resource at the
   market); recruit everything when a hero is in town, at the week's end
   or under threat, otherwise only what the key building leaves. The main
   hero takes the garrison along, except (after week one) the tier-1
   stack, which stays as the town's guard.
4. **Ferry**: a secondary hero next to the main hero hands over every
   stack that fits, keeping one creature.
5. **Dowse and dig**: Dowse early in the week; a hero on a marked cell
   with full movement digs.
6. **Movement**. The strongest hero ("main") plans first, then the
   others, each skipping targets already taken. A target's score is its
   net value per day of travel (`value / (cost / maxMp + 0.35)`) within
   four days' reach. Targets: pickups, mines (enemy mines x1.3), artifacts,
   dwellings, banks, shrines and other sites (`objectValueFor`, with AI
   filters for quests not met, levels too low, full mana, loops), towns
   (x2; an enemy's +8000), unexplored ground (28 gold per new cell in
   sight, weighted down as the map fills), own towns with troops to fetch
   (only when they add 15% to the army, scaled by how much more strength
   is needed), the main hero (for a secondary carrying troops), neutral
   stacks (what they guard plus a clearing value rising with the day plus
   the unexplored ground around them) and enemy heroes. Reach is the
   AI's own Dijkstra (`reach.ts`) that walks through object entrances a
   visit only stops at, so ground behind a pickup in a narrow pass counts.
7. **Fights** (`strength.ts`): a fast fight-value ratio (hero Attack and
   Defense ~3% a point, the fort's Defense bonus) settles clear cases
   (below 0.8 lost, above 3 won); close calls are fought for real on a
   copy with the game's resolver (`battleSetup` + auto-battle), at most
   one per decision and four per turn, cached by both armies. A fight is a
   target only when it is won and the loss share is under the cap (main
   hero 30%, towns 50%, enemy heroes 55%, secondaries 10-20%); its value
   is reduced by the troops lost, priced lower when reserves wait at home.
   Stacks whose zones cover the attack cell (chained fights) are added.
8. **Safety**: no hero ends its day where a visible enemy hero stronger
   than it (counting a town's garrison) can strike next turn; a hero in
   such a spot retreats, preferably into a town. A weak hero in a
   threatened town stays to defend it, and the main hero comes home
   when a stronger enemy nears a town it can still defend.
9. **Level-ups** by class skill weights (upgrades preferred), feats by
   their skill tags; chests are gold, or experience for a main hero under
   level 10 when gold is plentiful; Borrowed Day when it brings the target
   within reach today.

Determinism: no randomness, ties broken by map order. The goal memory (a
25% bonus for yesterday's target), the futility memory (a site visited
without effect is skipped for a week) and the fight cache live in the
controller instance; a reloaded game starts them empty.

Fog: targets are read from the player's explored cells. (Pathfinding's
zones of control include stacks in unexplored cells, a small leak of the
existing movement rules.)

## Rules changes made for the AI

- `GameAction` gained `use-site`, `dig`, `cast` (adventure spell) and
  `trade` (marketplace).
- `aiStep` waits for the human only when a side's player has no
  controller (`humanPlayer()` still names player 0 in an all-AI match).
- `settleOutcome`: a game with no human player never ends by elimination
  (the match runner stops it at its day limit).

## Evaluation

Simulation tier only (never the unit tier):

```sh
node tools/sim/run-ts.mjs tools/sim/match.ts --ai v1 --size M --players 3 --seeds 11,12 --days 84
node tools/sim/run-ts.mjs tools/sim/match.ts --ai simple --map keepers-toll --seeds 11
node tools/sim/run-ts.mjs tools/sim/match.ts --size S --seeds 11 --explain 1:30 --trace 1:20-24
```

`run-ts.mjs` bundles the entry with rolldown (Node's type stripping cannot
load the battle engine's parameter properties) into `.orchestration/sim/`.
Every day each player's metrics are recorded (`src/core/ai/match.ts`):
army fight value (heroes and garrisons), main hero's fight value, gold
income, mines, towns, heroes, explored share of passable cells, guards
cleared (by the player / by anyone / at start), neutral towns left, top
hero level, artifacts, idle heroes, buildings; plus turn time, the time
spent deciding, and actions the rules refused. `--trace` prints a player's
actions, `--explain` its targets, refused fights and a fog map.

## Results (2026-11-25, main at ff405d2 merged)

84 days, every player an AI. Per player at day 84 (day 28 in brackets
where it tells the story): army = fight value of all armies and
garrisons; guards = stacks cleared by anyone / at start; nt = neutral
towns left; explored = that player's share of passable cells.

**Before** (`SimpleAi`), every map and seed alike: no building after the
start, 500 gold a day, 0-2 mines, 1 town, 0 guards cleared, 5-28%
explored, army 12.7-14.3k (only town growth sitting in the garrison),
main hero 1.8k all game, every neutral town left.

**After** (`AdventureAi`):

| Map           | Seed | Survivor(s) at d84 | Army d28 → d84                             | Income             | Mines     | Towns     | Explored    | Guards cleared | nt  | Top level   |
| ------------- | ---- | ------------------ | ------------------------------------------ | ------------------ | --------- | --------- | ----------- | -------------- | --- | ----------- |
| S, 2 players  | 11   | humans             | 22.2k → 120.7k                             | 8000               | 12        | 4         | 100%        | 27/27          | 0   | 14          |
| S, 2 players  | 12   | humans             | 17.0k → 99.0k                              | 7750               | 14        | 3         | 100%        | 25/25          | 1   | 4           |
| M, 3 players  | 11   | humans             | 32.4k → 191.3k                             | 11000              | 18        | 4         | 94%         | 41/47          | 1   | 12          |
| M, 3 players  | 12   | goblins            | 21.2k → 185.2k                             | 12000              | 21        | 5         | 100%        | 41/41          | 0   | 12          |
| Keepers' Toll | 11   | humans             | 18.8k → 198.0k                             | 10000              | 13        | 5         | 100%        | 53/53          | 0   | 11          |
| Keepers' Toll | 12   | humans and undead  | 7.4k → 83.1k / 11.8k → 35.9k               | 4500 / 5750        | 8 / 6     | 2 / 3     | 81% / 84%   | 46/53          | 0   | 5 / 9       |
| Hourglass (L) | 11   | goblins            | 33.9k → 185.3k                             | 15500              | 15        | 7         | 91%         | 99/101         | 0   | 19          |
| Hourglass (L) | 12   | all three          | 29.4k → 72.2k, 8.8k → 44.9k, 12.6k → 22.9k | 7250 / 6250 / 3000 | 8 / 8 / 7 | 3 / 2 / 2 | 56-59% each | 99/101         | 0   | 18 / 11 / 2 |

The matches are aggressive: on S and M maps one AI usually eliminates the
others in weeks 3-8 (attacking weaker heroes and empty or weakly held
towns), then clears the rest of the map alone. Armies grow every week
(steadily, about 25-35k fight value a week for the leader after month
one); by month three the map is explored, nearly every guard is gone and
the neutral towns are taken (all of them in six of eight runs; one is
left in S seed 12 and M seed 11). In the one
three-way game that stays open (Hourglass seed 12) every player still
grows and the guards are cleared.

Speed (headless, M-class maps): the whole AI turn averages 60-250 ms, of
which deciding is 60-230 ms; the slowest single turns reach 0.8-2.4 s,
almost all of it simulated close-call battles (capped at four per turn)
and the battles actually fought. No action was refused by the rules in
any run.

## Known weaknesses (next iteration)

1. Early hero wars decide most games: a player whose main hero meets a
   stronger one in week 1-3 loses everything; towns are lightly held (only
   the tier-1 stack stays home) and there is no counter-attack planning.
2. Turn time spikes past 1 s when several close fights are simulated in
   one turn with the battle AI v2; a cheaper estimate (or a time budget)
   is needed.
3. The main hero can shuttle between two towns to collect troops (seen in
   the browser on S seed 11) instead of pushing on; secondaries ferry too
   little.
4. Spells and sites are used thinly: no Green Road, Parley, Tow Line or
   Opening Salvo; key tents, gates, seer quests and obelisk puzzles are
   only taken when they lie on the way.
5. A battle the resolver ends with both sides wiped out ("defender wins"
   with no survivors) is refused by applyBattleResult and leaves the
   battle pending: the match stalls (seen once, M seed 12 before the last
   change). That is a battle-layer fix (follow-up bead).

Raw per-day metrics: `.orchestration/sim/match-v1-*.json` and
`final-*.txt` (git-ignored, reproducible with the commands above).

## Iteration 1 (bead bzc.21)

Played AI-against-AI matches on S (2 players), M (3 players) and both
named maps, seeds 11-13, 84 days each; traced the worst players day by
day; watched rounds in muted headless Chrome (port 6295, `?mute=1`, the
human side only ending its turns); and replayed the passive-human case
headless (`--idle 0`).

### What was wrong (worst first)

1. **Whole armies thrown away on "easy" fights.** The fast estimate called
   fights at a fight-value ratio of 3 to 6 sure wins, and the one
   simulation of a close call used the real battle's seed (a prophecy
   that did not hold once anything changed). Before the 15-round limit
   was adjudicated by fight value (bead bzc.24), the auto-battle could not
   finish some stray stacks: 9 whipping boys held 59 undead troops (ratio
   5.0) in 12 seeds of 20, 33 bellhops held 72 (ratio 6.1) in 19 of 20.
   The undead main hero died that way on day 1-9 in several seeds and the
   player was out by week two or three.
2. **The main hero changed at every hire.** A fresh hire with a bigger
   starting army became "main" and the old main ferried it every stack,
   then the hire lost them all in its first fight.
3. **A broke player never recruited.** Saving for the Town Hall kept the
   gold back on every day, even with the army gone; heroes idled with one
   creature for a week while 5000 gold sat in the treasury.
4. **Towns emptied in front of an enemy.** The main hero took the whole
   garrison except tier 1 even with an enemy hero two days away, and a
   town under threat was worth less than an enemy town nearby.
5. **Hero wars on coin flips.** Enemy heroes were attacked at 55% expected
   losses on one simulation.
6. **Turn time.** 75% of all CPU went into simulated battles (the battle AI
   v2 rehearses moves; a 14-stack battle takes 1-1.7 s); four per turn
   made 1.5-5 s turns.
7. **Back-and-forth for troops; thin ferrying** (secondaries fetched troops
   only for a main hero more than 10 cells away, and only 300 fight value
   or more).
8. **Puzzle sites ignored.** A Keymaster's Tent was worth 0 (so keys came
   only by accident), obelisks 500, the Keystone was never dug, seer
   quests were never pursued.

### What changed

- **Fight estimates** (`strength.ts`): simulations use their own seed
  (`deriveSeed(seed, "ai", ...)`), never the battle's. Fights up to a ratio
  of 6 are simulated (was 3). A won fight is simulated again with a second
  seed and the worse outcome counts; when the budget has no room for the
  second, the first is kept and the fight waits for a later decision. An
  unsimulated fight below ratio 3, or against creatures a simulation saw
  hold out at ratio 2 or more ("stubborn"), waits for budget rather than
  being taken on a guess; bigger fights take the guess with its losses
  doubled.
- **Turn budget**: per turn at most 6 simulations (2 per decision) and
  500 predicted milliseconds of them (`predictedMs`, 5 ms per stack
  squared on the field, so a 14-stack battle is never simulated). The
  budget counts predictions, not the clock, so a match plays identically
  on any machine and under any load.
- **Sticky main hero**: the main hero changes only when it is gone or
  another hero scores 1.6 times as much (+500).
- **Town defence**: a town with a visible enemy hero within about two days
  is on alert: its garrison stays home (unless the main hero is there and,
  with the garrison, 1.3 times the enemy), and it recruits everything. A
  threatened town (enemy stronger than its defence) is worth 40000 to the
  main hero (was 20000), an alert one 6000; an enemy hero near one of our
  towns is worth 5000 more as a target (counter-attack).
- **Clear advantage**: enemy heroes are attacked only at a fight-value
  ratio of 1.3 or more, both simulations won and at most 40% losses (main;
  secondaries 15%); enemy towns with a garrison at ratio 1.2 and 45%.
- **Townless**: with no town left every town is worth 40000 more and may
  cost 90% of the army; a town the player once owned is worth 6000 more.
- **Troops**: after the main hero took troops in a town, it walks back
  there within five days only for 45% of its army (30% when a secondary can
  ferry, else 15%). Secondaries pick up a garrison worth 10% of the main
  army and fetch troops for a main hero more than 6 cells away. A player
  whose main hero has less than 1500 + 150 x day of power recruits before
  saving for any building.
- **Puzzle sites**: a Keymaster's Tent is worth 2500 plus what each closed
  gate of its colour hides (a flood fill behind the gate: object values
  and unexplored cells); an obelisk 500 + 6000 / obelisks; once every
  obelisk is seen the Keystone's cell is a dig target worth 9000; a seer
  hut's "defeat that stack" or "visit that site" quest adds 60% of its
  reward to the stack or site.
- **Spells**: Opening Salvo before attacking an adjacent stack; Green Road
  when walking through forest reaches a target today that scores 1.3
  times the best without it. Both are guild-level-2 pages, which the build
  order reaches late: neither was cast in the traced matches (Dowse and
  Borrowed Day were).
- **Runner** (`tools/sim/match.ts`): a `SUMMARY` line per seed with the
  first player-against-player battle, the first town lost, eliminations,
  guards cleared by day 56, end armies and turn time (mean, p95, max);
  `--idle <p>` makes a player pass (a passive human); `run-ts.mjs` bundles
  per process so runs can go in parallel.
- **UI**: the game's AI uses its own default resolver for estimates (one
  line in `src/ui/game.ts`).

### Before and after

Before: the AI of main at 4e8de38 (after the balance bead's adjudicated
round limit); after: this iteration on the same main. Both measured the
same evening on the same machine, seeds 11-13, 84 days, every player an
AI; "a → b" is before → after. Turn ms is the whole AI turn including the
battles it fights; deciding ms is the controller alone.

| Map           | Seed | 1st PvP fight (day) | 1st town lost (day) | 1st elimination (day) | Guards cleared by d56 | Leader's army d84 | Turn ms mean | Turn ms p95 | Turn ms max | Deciding ms max |
| ------------- | ---- | ------------------- | ------------------- | --------------------- | --------------------- | ----------------- | ------------ | ----------- | ----------- | --------------- |
| S, 2 players  | 11   | 10 → 8              | 10 → 22             | 44 → 30               | 100% → 100%           | 141k → 171k       | 277 → 196    | 1135 → 564  | 2494 → 1314 | 2404 → 561      |
| S, 2 players  | 12   | 8 → 8               | 12 → 14             | 16 → 14               | 72% → 100%            | 193k → 203k       | 93 → 86      | 381 → 305   | 528 → 531   | 527 → 330       |
| S, 2 players  | 13   | 12 → 3              | 15 → 48             | 23 → 48               | 96% → 89%             | 178k → 137k       | 115 → 122    | 456 → 352   | 629 → 625   | 627 → 625       |
| M, 3 players  | 11   | 8 → 8               | 8 → 12              | 18 → 60               | 100% → 96%            | 247k → 83k        | 216 → 192    | 743 → 539   | 1512 → 1428 | 1510 → 1132     |
| M, 3 players  | 12   | 15 → 16             | 19 → 16             | 25 → 20               | 80% → 83%             | 257k → 284k       | 155 → 255    | 595 → 764   | 1049 → 1023 | 792 → 927       |
| M, 3 players  | 13   | 13 → 7              | 14 → 6              | 31 → 20               | 78% → 96%             | 119k → 285k       | 451 → 313    | 1573 → 1081 | 4654 → 1734 | 2145 → 894      |
| Keepers' Toll | 11   | 22 → 20             | 23 → 20             | 47 → 80               | 79% → 98%             | 173k → 124k       | 442 → 213    | 2004 → 662  | 3077 → 1241 | 3075 → 582      |
| Keepers' Toll | 12   | 16 → 29             | 23 → 29             | - → -                 | 91% → 79%             | 167k → 151k       | 247 → 203    | 928 → 578   | 3202 → 1078 | 3179 → 689      |
| Keepers' Toll | 13   | 15 → 15             | 41 → 15             | 69 → 30               | 79% → 100%            | 136k → 229k       | 654 → 334    | 2992 → 1008 | 5392 → 1606 | 5132 → 1061     |
| Hourglass (L) | 11   | 18 → 20             | 22 → 24             | 43 → 42               | 91% → 67%             | 243k → 154k       | 294 → 196    | 985 → 527   | 2148 → 1154 | 1199 → 535      |
| Hourglass (L) | 12   | 15 → 13             | 15 → 23             | 19 → 47               | 72% → 67%             | 130k → 166k       | 270 → 261    | 1082 → 773  | 1979 → 2113 | 1447 → 679      |
| Hourglass (L) | 13   | 13 → 18             | 15 → 15             | 19 → 37               | 82% → 73%             | 177k → 110k       | 451 → 268    | 1474 → 695  | 3031 → 964  | 3019 → 871      |

Means over the twelve matches:

| Metric                                   | Before | After |
| ---------------------------------------- | ------ | ----- |
| First player-against-player battle (day) | 13.8   | 13.8  |
| First town lost (day)                    | 18.1   | 20.3  |
| First elimination (day; 85 if none)      | 36.6   | 42.8  |
| Matches with an elimination by day 21    | 4      | 3     |
| Guards cleared by day 56                 | 85%    | 87%   |
| Turn ms p95                              | 1196   | 654   |
| Turn ms max                              | 2475   | 1234  |
| Deciding ms max                          | 2088   | 740   |

On main before the balance change (old 30-round limit, the stall fix
only) the same comparison was starker, because the round-limit losses
were the main killer: first town lost on day 19.6 → 36.8, first
elimination 39.3 → 50.2, eliminations by day 21 in 4 → 2 matches, turn p95
762 → 495 ms; guards cleared by day 56 fell 86% → 78% (more players stay
in and contest the map). Against a passive human on the Keepers' Toll
the AI grew to 33-67k fight value by day 42, cleared 36-37 of 53 guards
and took the human's town on day 18 and 39 (the human army never moved).

On M maps the controller now decides in at most 0.9-1.1 s in the worst
turn (was 0.8-2.1 s), and the whole turn's p95 is 0.5-1.1 s; the whole turn
still reaches 1.0-1.7 s when the AI fights a big real battle (the battle
AI's own cost, outside the adventure AI).

Puzzle sites and spells in full-length traces of five players during
the iteration (Hourglass seed 12, Keepers' Toll seed 12): keys taken by
two players (one took two), obelisks visited by four of the five (up to
six), Dowse cast 14 times with 3 digs, Borrowed Day 4 times.

### Remaining weaknesses (iteration 2), worst first

1. **Big battles cost too much time.** The battle AI v2 takes 1-1.7 s for
   a 13-14-stack battle, both when the AI simulates and when the rules
   resolve the real one; the adventure AI never simulates those (it
   guesses), and whole turns with such a battle still pass 1 s. A cheap
   battle-AI mode for simulations (no rehearsal, no hero acts) would let
   the AI simulate big fights and keep turns short.
2. **Estimates are reset by every army change.** The cache is keyed by
   both armies, so after each fight or recruit all estimates are
   recomputed; with the budget a hero fights about two simulated fights a
   turn. Clearing on the large three-player map is slower than before
   (67-73% of guards by day 56 on the Hourglass vs 72-91%).
3. **Three-player wars of attrition.** 7-46 player battles per match on M
   and L maps with towns changing hands back and forth; no joint attack by
   two heroes, no regrouping, no reading of who is winning.
4. **Early losses still decide some matches.** 3 of 12 had an elimination
   by day 21 (S seed 12 on day 14, M seeds 12 and 13 on day 20); a second
   town taken early is left empty and falls to the first passing hero, and
   the build order and first-week plan are not adapted per faction.
5. **Adventure spells.** Green Road and Opening Salvo need guild level 2
   (rank 66 in the build order) and a school rank, so the AI rarely knows
   them; Parley and Read the Seal are not used at all; seer quests for an
   artifact, creatures or level are not pursued.

Raw metrics: `.orchestration/sim/base3-*.json` and `it7-*.json`
(git-ignored); reproduce with `node tools/sim/run-ts.mjs
tools/sim/match.ts --size M --players 3 --seeds 11,12,13 --days 84`.

## Iteration 2 (bead bzc.22)

Worked on iteration 1's remaining weaknesses 2-5 (the battle AI's own
cost waits for bead bzc.37's fast mode), measured with AI-against-AI
matches and a passive human (`--idle 0`), and watched two games in muted
headless Chrome with the human only ending its turns.

### What changed

- **Fight families** (`strength.ts`). Every full (worst-of-two) simulated
  result is also kept per family: the guard's creature types and fort
  bonus, the attacker's lead faction and ranged share (`familyKey`), not
  the counts. A later fight of that family is predicted from it
  (`inferFromFamily`): a loss seen at this strength ratio or above is a
  loss; a win seen at this ratio or below is a win, its losses scaled by
  the square of the ratio (`scaleLoss`); a win seen within 10% above the
  ratio still counts, its losses padded by a quarter; a loss between the
  two blocks the guess (then it is simulated). Recruits, lost stacks and
  levels no longer reset what the AI knows about a guard type: in the
  final runs 827 estimates came from families against 3074 simulations.
  The budget's cost model is an option (`OracleOptions.costOf`,
  `AdventureAiOptions.simCost`): a faster resolver (bzc.37) passes its
  own and the same turn budget buys more simulations, no other change.
- **Reach fix** (`reach.ts`). A stack's own cell ends a walk. A hero
  starting inside a zone could plan a path "through" the stack, a fight
  its estimate never saw.
- **Who is winning** (`strategy`). Each turn: our power (heroes and
  garrisons) against each rival's (its heroes as last seen within three
  weeks, its explored garrisons), our power a week ago, and the days we
  attacked each rival. A rival attacked twice in ten days while our power
  did not grow 10% in a week, and that we do not outweigh 1.6 to 1, is a
  stalled war: its heroes and towns need a fight-value edge of 1.7 and
  are worth 40% less (defending our towns keeps the normal rules). With
  two or more rivals left, a rival stronger than us needs 1.5; a rival we
  outweigh two to one is pressed at 1.2.
- **Coordination.** The main hero gathers its reserves when a rival hero
  or garrisoned town within three days is too strong for it alone but
  not with what the secondaries carry: their meeting is worth 2.5 times
  the troops plus 3000 and any amount counts. A main hero outmatched by a
  rival hero within about two days falls back on a town with troops
  (+8000). No bouncing: a hero guarding a town on alert does not leave it
  for another on alert, nor for a threatened one while its own is
  threatened, and a town it stood in during the last three days does not
  call it back on alert (a main hero had walked between two alert towns
  for days, seen in M seed 11).
- **Openings** (`economy.ts OPENINGS`): week one builds the cheap ranged
  or fast dwelling first (its creatures arrive at once), then income or
  the fort: humans archery range, town hall, fort, barracks; undead
  charnel pit, town hall, fort, wailing tower; goblins powder shed, fort,
  wolf kennels, town hall. The main hero's targets more than its
  faction's wander range from its first town (`WANDER_DAYS`: 2 days'
  walk, goblins 3) count a third in days 1-14.
- **Economy.** A rich player buys at the market what any blocked building
  lacks (keeping 12000 gold): long games had 50-70k gold sitting unspent
  with no essence. A fourth hero from day 21 with 17500 gold.
- **Magic.** A player with a magic-leaning hero (or one with a school
  skill) ranks guild levels 1 and 2 as key buildings (27 and 44, was 42
  and 66). Level-ups weigh a school skill double when its rank unlocks an
  adventure page the hero knows but cannot cast (a page needs a rank in
  its school: tier 2 needs rank 1, tier 3 rank 2).
- **Spells and sites.** Parley on an adjacent small stack in front of
  something worth having when the fight is refused; Read the Seal on a
  rival hero in range every three days when at least half the mana is
  left (the AI's estimates do not need the reading; no v0.2 object is
  `sealed`); Second Helping on our own dwelling before hiring; Tow Line
  from a pylon to the marked pylon nearest the best target when it saves
  more than a day; Drills bought at a drill yard for the army's creatures
  when 4000 gold stays after the price (the last three from bead bzc.32).
- **Seer quests.** An artifact quest adds 60% of the reward to that
  artifact on the map (unless a hero carries it), a creatures quest 50%
  to the stray hut that sells them (unless a hero has enough); the
  "defeat" and "visit" leads of iteration 1 stay. Level quests are met
  by playing on.
- **Runner**: `--no-families` and `--no-openings` (ablations); the
  `SUMMARY` line adds simulations, family predictions and deferrals.

### Before and after

Before: the iteration-1 AI on today's main (bzc.32 map leftovers, bzc.34
content leftovers and bzc.26 merged); after: this iteration on the same
main. Both ran at the same time on the same machine (16 matches on 10
cores, so absolute turn times are about 1.5 times a quiet machine's),
seeds 11-13, 84 days; "a → b" is before → after.

Every player an AI:

| Map           | Seed | 1st PvP fight (day) | 1st town lost (day) | 1st elimination (day) | PvP fights | Guards cleared by d56 | Leader's army d84 | Turn ms p95 | Turn ms max | Deciding ms max |
| ------------- | ---- | ------------------- | ------------------- | --------------------- | ---------- | --------------------- | ----------------- | ----------- | ----------- | --------------- |
| S, 2 players  | 11   | 14 → 13             | 14 → 14             | 73 → 41               | 32 → 19    | 97% → 72%             | 81k → 168k        | 1207 → 1228 | 1937 → 1840 | 891 → 1832      |
| S, 2 players  | 12   | 8 → 11              | 16 → 18             | 16 → 39               | 3 → 6      | 100% → 96%            | 220k → 195k       | 491 → 817   | 1005 → 1823 | 651 → 855       |
| S, 2 players  | 13   | 6 → 8               | 9 → 12              | 33 → 22               | 16 → 7     | 78% → 100%            | 153k → 196k       | 1168 → 1271 | 4036 → 2641 | 1312 → 1325     |
| M, 3 players  | 11   | 7 → 7               | 19 → 3              | 29 → 8                | 29 → 17    | 70% → 77%             | 148k → 213k       | 877 → 783   | 1661 → 1244 | 1655 → 1141     |
| M, 3 players  | 12   | 5 → 13              | 17 → 13             | 23 → 19               | 11 → 17    | 71% → 88%             | 209k → 220k       | 889 → 1435  | 3274 → 3832 | 1174 → 1671     |
| M, 3 players  | 13   | 7 → 14              | 7 → 17              | 33 → 48               | 31 → 33    | 74% → 65%             | 141k → 117k       | 528 → 718   | 1051 → 1371 | 483 → 735       |
| Keepers' Toll | 11   | 20 → 17             | 23 → 17             | - → 23                | 14 → 2     | 77% → 100%            | 128k → 248k       | 1166 → 1425 | 2096 → 1895 | 1725 → 1177     |
| Keepers' Toll | 12   | 18 → 22             | 21 → 25             | 66 → -                | 26 → 20    | 77% → 89%             | 138k → 166k       | 1152 → 1400 | 1502 → 3826 | 1462 → 2201     |
| Keepers' Toll | 13   | 15 → 18             | 15 → 18             | - → 34                | 14 → 4     | 79% → 94%             | 166k → 259k       | 524 → 601   | 1101 → 1040 | 1086 → 752      |
| Hourglass (L) | 11   | 14 → 20             | 14 → 31             | 31 → 65               | 15 → 17    | 53% → 81%             | 211k → 194k       | 1091 → 1139 | 4083 → 3828 | 1216 → 1223     |
| Hourglass (L) | 12   | 16 → 12             | 16 → 12             | 44 → 36               | 19 → 22    | 50% → 67%             | 199k → 329k       | 828 → 731   | 2255 → 1938 | 1299 → 760      |
| Hourglass (L) | 13   | 14 → 14             | 31 → 21             | 43 → 23               | 14 → 25    | 76% → 92%             | 167k → 138k       | 547 → 574   | 1674 → 1600 | 747 → 588       |

Player 0 passive (`--idle 0`, a human who only ends turns); "AI out" is
the first AI player eliminated (by another AI), "AI army d42" the
strongest AI's:

| Map           | Seed | Human out (day) | AI out (day) | AI army d42 | Guards cleared by d56 | Leader's army d84 | Turn ms p95 |
| ------------- | ---- | --------------- | ------------ | ----------- | --------------------- | ----------------- | ----------- |
| S, 2 players  | 11   | 10 → 17         | - → -        | 72k → 63k   | 100% → 100%           | 192k → 197k       | 739 → 621   |
| S, 2 players  | 12   | 11 → 11         | - → -        | 73k → 65k   | 96% → 96%             | 220k → 205k       | 386 → 423   |
| S, 2 players  | 13   | 8 → 9           | - → -        | 76k → 65k   | 100% → 100%           | 203k → 206k       | 459 → 510   |
| M, 3 players  | 11   | 36 → 11         | 35 → 9       | 61k → 102k  | 77% → 98%             | 211k → 287k       | 901 → 1026  |
| M, 3 players  | 12   | 51 → 32         | 25 → 25      | 61k → 58k   | 88% → 100%            | 200k → 242k       | 906 → 611   |
| M, 3 players  | 13   | 7 → 16          | - → -        | 41k → 39k   | 65% → 67%             | 171k → 195k       | 711 → 850   |
| Keepers' Toll | 11   | 37 → 36         | - → -        | 63k → 46k   | 83% → 81%             | 199k → 193k       | 814 → 668   |
| Keepers' Toll | 12   | - → 24          | - → -        | 53k → 67k   | 89% → 87%             | 184k → 248k       | 1138 → 655  |
| Keepers' Toll | 13   | 31 → 23         | - → -        | 64k → 75k   | 87% → 98%             | 214k → 241k       | 1036 → 1228 |
| Hourglass (L) | 11   | 21 → 28         | - → -        | 77k → 76k   | 82% → 69%             | 137k → 242k       | 921 → 1111  |
| Hourglass (L) | 12   | 11 → 36         | - → -        | 76k → 74k   | 65% → 83%             | 150k → 175k       | 869 → 1096  |
| Hourglass (L) | 13   | 21 → 34         | - → 56       | 78k → 67k   | 70% → 83%             | 154k → 318k       | 522 → 558   |

Means over the twelve matches of each table:

| Metric                                  | All AI: before | All AI: after | Passive human: before | Passive human: after |
| --------------------------------------- | -------------- | ------------- | --------------------- | -------------------- |
| Guards cleared by day 56                | 75%            | 85%           | 83%                   | 89%                  |
| Leader's army at day 84                 | 163k           | 204k          | 186k                  | 229k                 |
| Player-against-player battles per match | 18.7           | 15.8          | 8.8                   | 6.8                  |
| First town lost (day)                   | 16.8           | 16.8          | 20.9                  | 19.4                 |
| First AI eliminated (day; 85 if none)   | 46.8           | 36.9          | 75.8                  | 71.3                 |
| AI eliminations by day 21               | 1              | 2             | 0                     | 1                    |
| Human eliminated (day; 85 if none)      | -              | -             | 27.4                  | 23.1                 |
| Turn ms p95                             | 872            | 1010          | 784                   | 780                  |
| Turn ms max                             | 2140           | 2240          | 1714                  | 1538                 |
| Deciding ms max                         | 1142           | 1188          | 859                   | 837                  |

Reading: the AI clears more of the map (on the Hourglass by day 56:
53/50/76% → 81/67/92% with every player an AI, back in iteration 0's
72-91% band in two seeds of three), builds bigger armies (+25%), fights
fewer player battles, and beats a passive human sooner. Early losses are
not fixed: the openings give stronger week-one armies and matches are
decided sooner (first elimination on day 47 → 37 on average; M seed 11
lost its undead capital on day 3 to a goblin hero that walked into the
empty town, out on day 8). The turn budget is unchanged (it counts
predicted milliseconds); whole turns are about as long as before, a
little longer in AI-only games, because the armies and their real
battles are bigger. An ablation on the Keepers' Toll and M maps (56
days, passive human, `--no-families` and `--no-openings`) showed no clear
effect of either feature alone at three seeds: the spread between seeds
is larger than the effect.

### Watched in the browser

Muted headless Chrome on port 6295 (`?mute=1&autostart=1`), the human
only ending its turns; one screenshot and a state dump per day
(`.orchestration/sim/it2/watch.mjs`, git-ignored). S seed 11: the AI hired
a second hero on day 1, ferried the first hero's army to it, cleared
nine stacks by day 15 and took the human's empty capital on day 15
(walking past the human hero next to it); its secondary hero sat in town
with one creature on days 10-13. Keepers' Toll seed 12: the AI took a
neutral town on day 12, kept growing garrisons in both its towns (24-42
creatures) and came within seven cells of the human's town on day 23,
then turned away (the human's town and hero stayed in its fog, so a
human sees nothing of this).

### Remaining weaknesses (iteration 3), worst first

1. **Empty capitals in week one.** A town with no garrison falls to the
   first rival hero that finds it (M seed 11: day 3, out on day 8); the
   openings make week-one heroes stronger and such raids likelier. The
   home guard starts only in week two, and a rival coming out of
   unexplored ground is not seen until it arrives.
2. **Adjacent-only map spells cannot be used by walking.** Parley and
   Opening Salvo need the stack adjacent to the hero, but stepping into a
   stack's zone starts the fight at once, so a hero is adjacent only when
   it started there. The AI casts them only then (rare). A rules
   follow-up: a range of two, or casting them as part of the attack.
3. **Big battles still cost 1-4 s** (the battle AI's own cost, bzc.37);
   whole AI turns reach 2-4 s in AI-only games on busy cores.
4. **Weak secondary heroes idle or wander with one creature**; neutral
   towns with 70-110 creature garrisons are left for weeks; one-way
   waystones are not used in route planning.
5. **War judgement is coarse.** The who-is-winning check counts heroes
   as last seen and explored garrisons only; three-player maps still have
   15-33 player battles per match, and a player that wins a war does not
   consolidate (captured towns hold only what they recruit).

Raw metrics: `.orchestration/sim/it2/b2-*.json` (before) and `f1-*.json`
(after), table `final-table.txt` (git-ignored); reproduce with `node
tools/sim/run-ts.mjs tools/sim/match.ts --size M --players 3 --seeds
11,12,13 --days 84 [--idle 0]`.
