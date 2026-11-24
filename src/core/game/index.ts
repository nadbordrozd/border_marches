/**
 * The adventure-layer rules: pure, deterministic functions from a GameState
 * to a new GameState (no DOM, no clocks, no Math.random).
 *
 * Start with newGame(map, { players }). Every command returns a
 * CommandResult: `{ ok: true, state, events }` or
 * `{ ok: false, error, message }`; the input state is never modified.
 * Players take turns in index order (endTurn); AI players are driven by a
 * PlayerController through aiStep / runAiTurn.
 */
export * from "./types.ts";
export {
  newGame,
  newFactionTown,
  newLostWorldTown,
  pickupInfo,
  type NewGameOptions,
  type PickupInfo,
  type PlayerSetup,
} from "./newGame.ts";
export { mapStarts, prepareStarts, type StartSite } from "./starts.ts";
export {
  moveHeroAlong,
  visitObject,
  takeChest,
  guardsAt,
  heroBattle,
} from "./adventure.ts";
export {
  findPath,
  moveContext,
  reachableCells,
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
  adjacent,
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
export {
  endDay,
  endTurn,
  startDay,
  startHeroDay,
  dailyIncome,
  townIncome,
  growTown,
} from "./turn.ts";
export {
  checkEliminations,
  dismissHero,
  newHeroState,
  startingPages,
  startingSkills,
  heroByDef,
  hireHero,
  humanPlayer,
  refreshTaverns,
  tavernOffer,
} from "./players.ts";
export {
  aiStep,
  applyAction,
  runAiTurn,
  SimpleAi,
  type AiStepOutcome,
  type AiStepResult,
  type GameAction,
  type PlayerController,
} from "./controller.ts";
export {
  upgradeV1State,
  upgradeV2State,
  upgradeV2Hero,
  type V2State,
} from "./migrate.ts";
export {
  chooseLevelUp,
  eligibleFeats,
  featOffers,
  featWeight,
  gainXp,
  levelUpOffer,
  patternStat,
  pendingLevel,
  satisfies,
  skillBarred,
  skillOffers,
  skillWeight,
  slotBarred,
  type LevelUpOffer,
  type SkillOffer,
} from "./hero.ts";
export * from "./effects.ts";
export {
  assemblable,
  assemble,
  backpackSlotsUsed,
  canCarry,
  destroyArtifact,
  emptyWorn,
  equip,
  giveArtifact,
  giveScroll,
  handOver,
  heroArtifacts,
  liftCurse,
  slotsOfKind,
  slotsUsed,
  takeSpoils,
  unequip,
  useConsumable,
  wearError,
  type ItemRef,
} from "./artifacts.ts";
export { heroBattleProfile, type HeroBattleProfile } from "./battle-profile.ts";
export {
  applyBattleResult,
  battlePlayers,
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
  findPlayer,
  fortLevel,
  heroAt,
  heroesOf,
  heroInTown,
  inSight,
  isExplored,
  townAtHero,
  townDefenseBonus,
  townsOf,
  towerHarm,
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
