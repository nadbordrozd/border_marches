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
[Iteration 3](#iteration-3-bead-bzc23) (the fast cost model, capital
defence, consolidation, waystones, the difficulty levels) comes last and
supersedes all of them where they differ.

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
- **Spells and sites.** Parley on a small stack in front of something
  worth having when the fight is refused, cast from a cell within 2 of
  the stack outside every zone (the hero walks there first; bzc.39);
  Opening Salvo likewise stops 2 cells short of a stack it means to
  fight, casts, then attacks; Read the Seal on a
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
   Opening Salvo needed the stack adjacent to the hero, but stepping into
   a stack's zone starts the fight at once, so a hero was adjacent only
   when it started there. Fixed in bzc.39: both reach 2 cells (RULES_V2
   2.8) and the AI stops 2 cells short to cast. (Item 1 is eased by the
   same bead's starting militia, RULES_V2 5.5.)
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

## Battle AI fast mode (bead bzc.37)

The battle AI v2 (`src/core/battle/ai.ts`) scores every candidate by
rehearsing it on the engine, and a hero side searches its best three hero
acts one ply deeper (each a whole second search). A 13-14-stack battle
took 1-1.7 s, both when the adventure AI simulated a fight
(`src/core/ai/strength.ts`) and when the rules resolved an AI-only
battle. The battle AI now has two modes (`AiOptions.mode`).

### Where each mode is used

One switch, `UNWATCHED_BATTLE_AI = "fast"` in
`src/core/battle/resolver.ts`: `createBattleResolver()` plays that mode
unless asked otherwise, and it is the resolver of every battle resolved
without the battle screen: the adventure AI's fight simulations (the
oracle in `strength.ts` gets it from `AdventureAi`) and the battles of an
AI with another AI or with neutrals (`settle` in
`core/game/controller.ts`, with the game's resolver in `src/ui/game.ts`).
A battle with a human side opens the battle screen, whose AI calls
`chooseAiAction` without a mode: the full mode, auto-combat and quick
battle included; so do the battle screen's intents (`rehearse.ts`) and
balance runs (`npm run sim:battles`, policy `v2`). `runAutoBattle` and
`autoPlay` default to the full mode too (`AutoBattleOptions.ai`).

### What the fast mode does

- **Incremental placed estimate.** A move or attack hex is ranked by the
  board's value with the stack standing there, without re-evaluating the
  board: the threat map (every stack's best strike next turn) is computed
  once per decision; per hex only the moving stack's own strike and the
  strikes against it are recomputed, and an enemy shooter it would stand
  next to loses its shot. It equals the full evaluation of the placed
  board (a test checks it).
- **Tighter pruning.** Two moves rehearsed (full: six); one hex per
  attack target; attacks and shots ranked by that estimate plus the
  strike's damage value, the best three rehearsed (full: every attack
  from every hex, every shot); area shots ranked by the value around the
  hex, three rehearsed; Hit and Run on the best attack only.
- **Hero acts.** No second ply: a hero act counts its own gain (the
  stack's best action is assumed to gain as much after it as now). Each
  cast tries its three most valuable stack targets (and every target
  without a stack); only the best cast gets Echo and Fuel options. In an
  auto-played battle a side searches its hero acts at its first decision
  of a round and at its last (the cheaper last-turn threshold), not at
  every stack's turn between.
- **Reuse within a battle.** An auto-played battle keeps one memo
  (`createAiMemo`): strike rates (damage per creature of one stack on
  another) by both stacks' identity, side and conditions, recomputed every
  three rounds, and the round of each side's last hero search. The choice
  then depends on the battle's earlier decisions, so only auto-play passes
  a memo; `chooseAiAction` without one stays a pure function of the state.
- **Determinism and legality.** Candidates still come only from the legal
  lists (`legalActions`, the acts' own checks); ranking ties go to the
  earliest. Same setup, same battle (tests replay auto-battles and check
  every action with `actionError` over seeded faction and guard battles).

Two exact speed-ups apply to both modes and change no decision: a
creature's value per HP is memoised (it computed the fight value, with a
square root, on every call) and the per-decision rate cache uses nested
maps instead of string keys. The full mode's decisions are unchanged
(identical `sim:battles` tables and identical adventure matches) at about
3.5 times less time per decision (9.2 → 2.6 ms at the mid stage).

### Results (2026-11-25, main at 6061468 merged)

Resolve time of whole battles (all decisions and the engine), each mode
on both sides of the same 12 seeded faction battles per size with full
heroes and stage kits; the modes alternate battle by battle so load falls
on both alike (`npm run sim:battles -- --mode timing --seeds 12`; the
machine was shared with other runs, load 11-17, so absolute times are
about twice a quiet machine's):

| Size   | Stacks (mean) | Stage | Full mean / median / max ms | Fast mean / median / max ms | Full / fast |
| ------ | ------------- | ----- | --------------------------- | --------------------------- | ----------- |
| Small  | 6             | early | 142 / 169 / 246             | 32 / 35 / 53                | 4.5x        |
| Medium | 10            | mid   | 409 / 419 / 694             | 98 / 101 / 156              | 4.2x        |
| Large  | 12            | late  | 766 / 764 / 1403            | 146 / 154 / 221             | 5.2x        |

Against the full mode as it was before this bead (without the two exact
speed-ups) the fast mode is about 15-18 times faster.

Fast against full in mirrored battles (`npm run sim:battles -- --a
v2-fast --b v2 --only faction`, every faction pairing, each seed played
twice with the sides swapped):

| Stage | Budget, hero level | Battles | Fast wins | Decision ms fast / full |
| ----- | ------------------ | ------- | --------- | ----------------------- |
| Early | 8,000, 5           | 216     | 48.7%     | 0.70 / 3.42             |
| Mid   | 30,000, 11         | 216     | 47.3%     | 1.15 / 4.94             |
| Late  | 80,000, 18         | 144     | 46.7%     | 1.49 / 6.83             |
| All   |                    | 576     | 47.7%     |                         |

The fast mode gives up about 2 points (the standard error of 576 battles
is about 2 points), within the 5 points allowed. No illegal action in any
run. (Win rates were measured just before main's bzc.22 and bzc.39 were
merged; those changed no battle code or battle numbers.)

Adventure AI turn time (every player an AI, seeds 11 and 12, 60 days),
before (main's battle AI) and after (this bead, fast by default), with
the full mode for comparison; the six runs ran at the same time on the
shared machine (absolute times inflated by the load, the ratios hold):

| Map           | Seed | Turn ms p95: before → fast (full) | Turn ms max: before → fast (full) |
| ------------- | ---- | --------------------------------- | --------------------------------- |
| M, 2 players  | 11   | 623 → 66 (209)                    | 757 → 104 (278)                   |
| M, 2 players  | 12   | 489 → 52 (213)                    | 1059 → 69 (393)                   |
| Hourglass (L) | 11   | 391 → 67 (145)                    | 959 → 118 (324)                   |
| Hourglass (L) | 12   | 316 → 80 (133)                    | 897 → 103 (362)                   |

With the full mode the matches play exactly as before (same fights, same
eliminations). With the fast mode the simulated fights come out a little
differently, so the matches diverge: on M seed 12 the second player still
falls (day 51 instead of 31) and 84% of the guards are cleared by day 56
(100% before); on the Hourglass seed 11 a player is out on day 30 (none
before); seed 12 plays 25 player battles instead of 15. A second run
earlier in the day, before AI iteration 2 was merged, gave the same
picture (turn p95 384-869 → 134-159 ms, max 641-1779 → 175-368 ms).

The turn budget is unchanged: `predictedMs` (strength.ts) still counts in
the full mode's milliseconds, so the AI simulates as many fights as
before, five times faster. Passing the fast mode's cost model
(`AdventureAiOptions.simCost`) would let it simulate more fights a turn
instead (iteration 3).

Raw metrics: `.orchestration/sim/c-{before,fast,full}-{M,HG}.json`
(git-ignored); reproduce with `node tools/sim/run-ts.mjs
tools/sim/match.ts --size M --seeds 11,12 --days 60 [--battle-ai
full]` and `--map hourglass-marches`.

## Iteration 3 (bead bzc.23)

Worked on iteration 2's remaining weaknesses with the fast battle AI
(bzc.37) and the starting militia (bzc.39) in place, measured with
AI-against-AI matches and a passive human (`--idle 0`), and watched both
named maps in muted headless Chrome with the human only ending its turns.

### What changed

- **Fast cost model** (`strength.ts fastPredictedMs`, 1.2 ms per stack
  squared, a quarter of `predictedMs`): the default of
  `AdventureAiOptions.simCost`, since the default resolver plays the fast
  mode. The match runner passes `predictedMs` with `--battle-ai full`.
  With the Normal budget (400 predicted ms, 16 simulations a turn, 4 a
  decision; was 500 full-mode ms, 6 and 2) the AI simulates 2-4 times as
  many fights a match (M 3p: 105-177 → 332-440; Hourglass 223-308 →
  473-566), big battles included.
- **Capital defence.** The tier-1 stack stays home from day one (was day
  8): the starting militia's tier-1 stack is the capital's guard (M seed
  11: the main hero took the whole militia on day 1 and a goblin hero
  walked into the empty undead capital on day 3). A rival hero that went
  back into the fog puts every town it could have reached by now on
  **watch** for six days (its power then, weighted down by the days
  since; `watchList`): the garrison stays home and the town recruits
  everything. A **secondary** within a day of a town on alert or under
  threat goes home when its army with the garrison and the recruits holds
  the town (+20000 threatened, +4000 alert). A threatened town recruits
  first and then builds with what is left (a threatened town sat on 11000
  gold for a fortnight with nothing left to recruit).
- **First attack day** (difficulty): no attack on another player's heroes
  or towns before day 8 on Normal, unless defending a town of ours,
  retaking one we lost or townless.
- **Consolidation.** A town wants a guard (`guardWant`): 60% of a rival
  hero seen in the last week within three days' walk (at most a quarter
  of the main hero's power), and 15% of the main hero's power on the
  front (a rival town within three days, not the capital). The main hero
  takes the garrison only above the guard and leaves one of its smaller
  stacks in a town short of it (`leaveGuard`); secondaries ferry only
  what is above it. A hero whose presence alone holds its town against a
  visible rival (`held`) stays there unless it goes out to beat that
  rival (a hero took a town, walked on, and the rival next to it walked
  in the same day). A rival's town whose owner has a stronger hero within
  two days is worth 35% (taken back at once otherwise). Away from the
  capital, a threatened town calls the main hero home only when it can
  hold it, for 15000 + 1500 per building (the capital stays 40000).
- **Finishing a rival**: a rival we outweigh two to one with at most two
  towns we know of is pressed at an edge of 1.15, its towns +12000.
- **Idle heroes and missed targets.** A hero whose every end of day is
  unsafe walks the safe part of today's path (not within two days of a
  stronger visible rival hero) instead of idling. The main hero leaves a
  target more than a day away to a secondary 2.5 times nearer and 3.5
  times stronger than the stack (`handOver`; a main hero walked four days
  to a stack its secondary stood next to). A secondary fetches only
  troops a town lets go, and not from a town it left in the last two days
  (a secondary walked between its alert town and the road every day).
  Neutral towns count for gathering reserves (1.4 times the garrison).
- **Waystones** in route planning (`reach.ts`): a one-way waystone's exit
  and a two-way waystone's twin continue the search at no extra cost; a
  path through one ends on it (`Reach.jumps`). A one-way waystone whose
  exit shows unexplored ground is worth that view.
- **Runner and harness**: `--difficulty`, `townsTaken` in the results
  (towns taken from a player; a flip is a town retaken within two weeks),
  `tools/sim/match-table.mjs` for before-and-after tables.

### Difficulty

`src/core/ai/difficulty.ts`, chosen in the new-game setup ("Computer
players: Easy / Normal / Hard", Normal selected; `?difficulty=` in the
URL) and kept in `GameState.difficulty` (absent in older saves: Normal;
no save version change). `AdventureAi` reads it at every decision.

| Parameter                        | Easy | Normal | Hard                                     |
| -------------------------------- | ---- | ------ | ---------------------------------------- |
| Simulation budget per turn (ms)  | 150  | 400    | 650                                      |
| Simulated battles per turn       | 6    | 16     | 24                                       |
| Simulated battles per decision   | 2    | 4      | 6                                        |
| Loss share accepted (multiplier) | 1.3  | 1      | 0.85                                     |
| Edge wanted against a player (+) | 0.3  | 0      | -0.1                                     |
| First attack on a player (day)   | 22   | 8      | 4                                        |
| Starting resources of each AI    | -    | -      | +2500 gold, +10 wood, +5 ore, +2 essence |

Easy guesses more, wastes troops on worse fights, wants a bigger edge and
leaves the players alone for three weeks (it still defends its towns);
Hard simulates more, fights more carefully, presses from day 4 and starts
a third richer. Only Normal was measured below.

### Before and after

Before: main's AI (at 09d2b13, unchanged since 84febfe); after: this
iteration merged with the same main. Both ran at the same time on the
same machine (16 matches on 10 shared cores, so turn times are inflated;
the comparison holds), seeds 11-13, 84 days, Normal; "a → b" is before →
after. Towns taken counts towns taken from a player (flips: retaken
within two weeks).

Every player an AI:

| Map           | Seed | 1st PvP fight | 1st town lost | 1st AI out | PvP fights | Towns taken (flips) | Guards d56  | Neutral towns d56 | AI army d42 | Leader d84  | Idle hero-days | Turn p95  | Turn max  |
| ------------- | ---- | ------------- | ------------- | ---------- | ---------- | ------------------- | ----------- | ----------------- | ----------- | ----------- | -------------- | --------- | --------- |
| S, 2 players  | 11   | 12 → 5        | 13 → 22       | 51 → 34    | 25 → 16    | 11 (8) → 7 (5)      | 100% → 100% | 1 → 0             | 39k → 43k   | 145k → 174k | 12% → 9%       | 280 → 438 | 511 → 488 |
| S, 2 players  | 12   | 8 → 5         | 8 → 21        | 17 → 52    | 9 → 20     | 4 (2) → 5 (1)       | 100% → 60%  | 0 → 1             | 72k → 16k   | 228k → 122k | 15% → 23%      | 154 → 293 | 331 → 468 |
| S, 2 players  | 13   | 7 → 7         | 7 → 39        | 25 → 39    | 9 → 9      | 5 (3) → 1 (0)       | 100% → 100% | 0 → 0             | 51k → 42k   | 194k → 168k | 10% → 16%      | 150 → 267 | 171 → 355 |
| M, 3 players  | 11   | 3 → 5         | 3 → 14        | 9 → 21     | 11 → 24    | 6 (3) → 10 (6)      | 100% → 81%  | 0 → 0             | 94k → 44k   | 279k → 195k | 4% → 20%       | 337 → 385 | 470 → 545 |
| M, 3 players  | 12   | 8 → 6         | 9 → 8         | 15 → 8     | 9 → 33     | 3 (0) → 10 (5)      | 100% → 80%  | 0 → 0             | 88k → 58k   | 277k → 99k  | 8% → 16%       | 248 → 520 | 381 → 671 |
| M, 3 players  | 13   | 8 → 8         | 7 → 13        | 38 → 37    | 25 → 49    | 14 (8) → 28 (19)    | 77% → 72%   | 1 → 1             | 36k → 29k   | 228k → 57k  | 8% → 17%       | 183 → 257 | 346 → 515 |
| Keepers' Toll | 11   | 17 → 22       | 17 → 56       | 23 → -     | 2 → 18     | 1 (0) → 2 (1)       | 94% → 85%   | 0 → 0             | 85k → 64k   | 254k → 124k | 4% → 14%       | 370 → 446 | 558 → 743 |
| Keepers' Toll | 12   | 17 → 24       | 17 → 29       | - → -      | 20 → 21    | 4 (1) → 3 (1)       | 85% → 87%   | 1 → 0             | 62k → 69k   | 154k → 168k | 13% → 13%      | 204 → 253 | 332 → 474 |
| Keepers' Toll | 13   | 11 → 19       | 21 → 24       | - → -      | 30 → 32    | 9 (5) → 10 (6)      | 91% → 94%   | 0 → 0             | 35k → 58k   | 88k → 124k  | 10% → 8%       | 220 → 376 | 558 → 603 |
| Hourglass (L) | 11   | 19 → 16       | 20 → 34       | 30 → 58    | 17 → 32    | 10 (5) → 5 (2)      | 76% → 83%   | 1 → 0             | 80k → 58k   | 195k → 150k | 4% → 8%        | 354 → 631 | 634 → 958 |
| Hourglass (L) | 12   | 20 → 8        | 24 → 16       | 70 → 24    | 32 → 30    | 14 (9) → 15 (7)     | 89% → 81%   | 1 → 0             | 56k → 58k   | 133k → 129k | 8% → 8%        | 384 → 321 | 504 → 521 |
| Hourglass (L) | 13   | 19 → 16       | 22 → 17       | 43 → 54    | 24 → 41    | 11 (5) → 18 (12)    | 85% → 65%   | 1 → 1             | 61k → 56k   | 133k → 168k | 7% → 11%       | 137 → 183 | 248 → 269 |

Player 0 passive (`--idle 0`):

| Map           | Seed | Human out | 1st PvP fight | 1st town lost | 1st AI out | PvP fights | Towns taken (flips) | Guards d56  | Neutral towns d56 | AI army d42 | Leader d84  | Idle hero-days | Turn p95  | Turn max  |
| ------------- | ---- | --------- | ------------- | ------------- | ---------- | ---------- | ------------------- | ----------- | ----------------- | ----------- | ----------- | -------------- | --------- | --------- |
| S, 2 players  | 11   | 9 → 22    | 9 → 22        | 9 → 22        | - → -      | 2 → 2      | 1 (0) → 1 (0)       | 100% → 100% | 0 → 0             | 70k → 46k   | 211k → 172k | 1% → 4%        | 294 → 421 | 427 → 677 |
| S, 2 players  | 12   | 11 → 8    | 11 → 6        | 11 → 8        | - → -      | 2 → 2      | 1 (0) → 1 (0)       | 96% → 100%  | 0 → 0             | 67k → 73k   | 207k → 220k | 2% → 11%       | 188 → 206 | 290 → 391 |
| S, 2 players  | 13   | 14 → 13   | 14 → 13       | 14 → 13       | - → -      | 2 → 2      | 1 (0) → 1 (0)       | 100% → 100% | 0 → 0             | 70k → 51k   | 204k → 193k | 1% → 5%        | 169 → 339 | 246 → 430 |
| M, 3 players  | 11   | 22 → 15   | 3 → 6         | 3 → 15        | 9 → 74     | 3 → 39     | 2 (0) → 14 (8)      | 100% → 74%  | 0 → 1             | 105k → 27k  | 288k → 121k | 1% → 23%       | 388 → 460 | 631 → 687 |
| M, 3 players  | 12   | 62 → -    | 7 → 6         | 9 → 23        | - → 61     | 30 → 27    | 5 (1) → 9 (7)       | 66% → 51%   | 1 → 1             | 24k → 24k   | 92k → 99k   | 28% → 10%      | 191 → 301 | 433 → 516 |
| M, 3 players  | 13   | 17 → 8    | 12 → 6        | 12 → 8        | 57 → 13    | 15 → 6     | 6 (2) → 2 (0)       | 74% → 98%   | 1 → 0             | 62k → 69k   | 234k → 301k | 2% → 0%        | 184 → 314 | 285 → 419 |
| Keepers' Toll | 11   | 30 → 34   | 30 → 32       | 30 → 34       | - → -      | 2 → 2      | 1 (0) → 1 (0)       | 98% → 92%   | 1 → 0             | 63k → 61k   | 221k → 218k | 5% → 0%        | 327 → 438 | 580 → 686 |
| Keepers' Toll | 12   | 46 → 32   | 44 → 26       | 46 → 26       | - → -      | 2 → 1      | 1 (0) → 1 (0)       | 100% → 94%  | 1 → 0             | 64k → 54k   | 228k → 213k | 2% → 2%        | 306 → 329 | 369 → 525 |
| Keepers' Toll | 13   | 26 → 22   | 25 → 22       | 26 → 22       | - → -      | 2 → 2      | 1 (0) → 1 (0)       | 87% → 100%  | 0 → 0             | 65k → 60k   | 231k → 218k | 1% → 6%        | 298 → 328 | 366 → 493 |
| Hourglass (L) | 11   | 36 → 31   | 36 → 28       | 36 → 31       | - → -      | 27 → 17    | 9 (3) → 5 (2)       | 78% → 87%   | 1 → 0             | 59k → 65k   | 126k → 226k | 3% → 13%       | 374 → 657 | 537 → 841 |
| Hourglass (L) | 12   | 68 → 81   | 22 → 14       | 22 → 18       | 57 → -     | 18 → 24    | 9 (6) → 10 (7)      | 44% → 53%   | 3 → 2             | 43k → 41k   | 193k → 99k  | 15% → 17%      | 408 → 349 | 745 → 635 |
| Hourglass (L) | 13   | 32 → 21   | 20 → 21       | 32 → 21       | - → -      | 11 → 28    | 3 (0) → 9 (4)       | 95% → 92%   | 1 → 0             | 59k → 63k   | 196k → 130k | 6% → 9%        | 299 → 219 | 435 → 287 |

Means over the twelve matches of each table:

| Metric                                   | All AI: before | All AI: after | Passive human: before | Passive human: after |
| ---------------------------------------- | -------------- | ------------- | --------------------- | -------------------- |
| First player-against-player battle (day) | 12.4           | 11.8          | 19.4                  | 16.8                 |
| First town lost (day)                    | 14.0           | 24.4          | 20.8                  | 20.1                 |
| First AI eliminated (day; 85 if none)    | 40.9           | 48.5          | 74.0                  | 76.1                 |
| AI eliminations by day 21                | 3              | 2             | 1                     | 1                    |
| Human eliminated (day; 85 if none)       | -              | -             | 31.1                  | 31.0                 |
| Player-against-player battles per match  | 17.8           | 27.1          | 9.7                   | 12.7                 |
| Towns taken from a player per match      | 7.7            | 9.5           | 3.3                   | 4.6                  |
| Of them retaken within two weeks (flips) | 4.1            | 5.4           | 1.0                   | 2.3                  |
| Guards cleared by day 56                 | 91%            | 82%           | 87%                   | 87%                  |
| Neutral towns left on day 56             | 0.5            | 0.3           | 0.8                   | 0.3                  |
| Strongest AI army on day 42              | 63k            | 50k           | 63k                   | 53k                  |
| Leader's army on day 84                  | 192k           | 140k          | 203k                  | 184k                 |
| Idle hero-days (AI)                      | 9%             | 13%           | 6%                    | 8%                   |
| Turn ms p95 (16 runs at once)            | 252            | 364           | 286                   | 363                  |
| Turn ms max (16 runs at once)            | 420            | 551           | 445                   | 549                  |

Turn time measured with two matches at once (M 3 players, every player
an AI, 84 days, the shared machine at load 11-14): p95 63-84 → 71-127
ms, max 89-142 → 144-166 ms per seed; within the 300 ms p95 and 1 s max
asked for, with 2-4 times the simulations.

Reading: the capital no longer falls in week one (first town lost day 14
→ 24 with every player an AI; M seed 11's day-3 raid is gone, its first
town now falls on day 14), players survive longer (first elimination day
41 → 48) and nearly every neutral town is taken by day 56. The cost is in
three-player games: with all three alive longer they fight each other
more (18 → 27 player battles a match; M seed 13, and M seed 11 with a
passive human, the worst), clear less by day 56 (91% → 82%) and the
leader ends smaller. The passive human is beaten as soon as before on
average (day 31): on S maps on days 8-22, on the named maps by month two.
Flips fell during the iteration from 7.6 to 4.8 a match (held towns,
guards, the chase check; intermediate runs of the same code base) but
stay above main's 4.1, because more towns change hands at all.

Ablations (same seeds, against the after column): keeping the tier-1
guard home only from week two again gave more player battles (27 → 30)
and idle hero-days (13% → 17%) with every player an AI, but against the
passive human it cleared more (87% → 94% by day 56), grew faster (53k →
65k on day 42) and beat the human sooner (day 31 → 24). The day-one
guard stays: a human raids an empty capital in week one, a passive one
never does. Moving Normal's first attack day from 8 to 1 changed nothing
measurable (most player battles come after week one).

### Watched in the browser

Muted headless Chrome on port 6295 (`?mute=1&map=<id>&faction=humans&
difficulty=normal&autostart=1`), the human only ending its turns, one
screenshot and a state summary per day (`.orchestration/sim/it3/
watch.mjs`, git-ignored). The Keepers' Toll, 21 days: the undead kept
30-39 creatures in their capital throughout, hired two scouts that
flagged mines and walked the north with one creature each, and took the
neutral human town on day 18; in the matching headless trace their main
hero stopped at a Wishing Well it was already blessed by on three days
running (the well lies on its way, and a walk stops at every site it
passes). The Hourglass, 18 days: the goblins took a neutral town on day
12 and grew to 194 creatures by day 17 with a 60-80 creature home
garrison; the undead main hero wandered a 10 by 25 cell area for two
weeks with 43-57 creatures and took its first town on day 18 (the
undead's tier-1 skeletons, most of their numbers, stay home as the
guard). The human sees none of it in its fog (its hero never moves), so a
passive human's screen stays empty until the attack. The new-game menu
with the difficulty row: `.orchestration/sim/it3/menu-difficulty.png`.

### Remaining weaknesses (iteration 4), worst first

1. **Three-player wars of attrition.** With nobody out early, three AIs
   fight 24-49 player battles a match, towns flip, and clearing and army
   growth suffer (M seeds 12 and 13: 33-49 battles, leader 57-99k on day
   84). The AI needs a war plan: pick one rival (the weakest neighbour),
   hold back against the other (no hunting its secondaries far from
   home), and count a third player's gain when it trades armies.
2. **The undead grow slowly.** Their numbers are tier-1 skeletons, and
   those stay home as the guard: the undead main hero had 43-57
   creatures on day 18 on the Hourglass and 7-8k fight value on day 14
   on most maps (humans and goblins 7-13k). The home guard should be
   sized by value (a share of the week's growth), not by tier.
3. **Idle hero-days rose to 8-13%**: heroes staying in held, watched or
   threatened towns, and secondaries with nothing safe to do while a
   rival hovers. Some of it is defence by design; the rest needs jobs
   that stay safe (mines behind the town, ferrying from a second town).
4. **Pass-through visits**: a site on the way stops the hero every time
   (a Wishing Well on three days for nothing); routes should avoid stops
   that give nothing.
5. **Easy and Hard are unmeasured**: only Normal ran the tables; the
   levels need a few matches each, and a human's opinion.

Raw metrics: `.orchestration/sim/it3/fbefore-*.json` and `fafter-*.json`,
ablations `abA-*` (week-two guard) and `abB-*` (first attack day 1),
table `final-table.md` (git-ignored); reproduce with `node
tools/sim/run-ts.mjs tools/sim/match.ts --size M --players 3 --seeds
11,12,13 --days 84 [--idle 0] [--difficulty hard]` and `node
tools/sim/match-table.mjs .orchestration/sim/it3 fbefore fafter`.
