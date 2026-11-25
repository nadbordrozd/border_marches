# Adventure AI v1

Bead `border_marches-bzc.19`. The computer player of the adventure map:
`AdventureAi` in `src/core/ai/` implements `PlayerController`
(`src/core/game/controller.ts`) and replaces the stand-in `SimpleAi` in the
game (`src/ui/game.ts`). `SimpleAi` stays as the baseline of the match
runner.

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
