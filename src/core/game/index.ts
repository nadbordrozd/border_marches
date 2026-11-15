/**
 * The adventure-layer rules: pure, deterministic functions from a GameState
 * to a new GameState (no DOM, no clocks, no Math.random).
 *
 * Start with newGame(map). Every command returns a CommandResult:
 * `{ ok: true, state, events }` or `{ ok: false, error, message }`; the input
 * state is never modified.
 */
export * from "./types.ts";
export {
  newGame,
  newLostWorldTown,
  pickupInfo,
  type PickupInfo,
} from "./newGame.ts";
export {
  moveHeroAlong,
  visitObject,
  takeChest,
  guardsAt,
} from "./adventure.ts";
export {
  findPath,
  moveContext,
  stepCost,
  diagonalCost,
  assignDays,
  isStopCell,
  canEnter,
  type Path,
  type PathStep,
  type PathOptions,
  type MoveContext,
} from "./pathfinding.ts";
export {
  build,
  buildStatus,
  recruit,
  transferStack,
  marketTrade,
  marketQuote,
  hasMarketplace,
  heroInTownOf,
  type BuildStatus,
  type MarketQuote,
  type SlotRef,
  type TransferArgs,
} from "./town.ts";
export { endDay, dailyIncome, townIncome, growTown } from "./turn.ts";
export { chooseLevelUp, levelUpOffers, gainXp } from "./hero.ts";
export {
  applyBattleResult,
  battleSetup,
  fightPendingBattle,
  type BattleHero,
  type BattleResolver,
  type BattleResult,
  type BattleSetup,
  type BattleSide,
  type BattleStack,
} from "./battle.ts";
export {
  calendar,
  isGrowthDay,
  xpForLevel,
  levelForXp,
  weeklyGrowth,
  fightValue,
  splitNeutralStack,
  type Calendar,
} from "./progression.ts";
export {
  armySize,
  cloneState,
  emptyArmy,
  findHero,
  heroInTown,
  inSight,
  isExplored,
  townAtHero,
  townDefenseBonus,
} from "./state.ts";
export {
  addResources,
  canAfford,
  emptyResources,
  maxAffordable,
  scaleResources,
  subtractResources,
  toResources,
} from "./resources.ts";
