/**
 * Deterministic battle engine (GAME_DESIGN.md section 9). Pure: no DOM, no
 * clock, no unseeded randomness.
 */

export * from "./types.ts";
export * from "./hex.ts";
export * from "./damage.ts";
export {
  ABILITY_HOOKS,
  STATUSES,
  countAdjacentAllies,
  isAlive,
} from "./abilities.ts";
export type {
  AbilityDefinition,
  StatusApplication,
  StatusDefinition,
  StrikeContext,
} from "./abilities.ts";
export {
  actionError,
  activeStack,
  applyAction,
  canShoot,
  compareTurnOrder,
  computeBreakdown,
  enemySide,
  findPath,
  getStack,
  isLegalAction,
  isRangedCreature,
  legalActions,
  previewAttack,
  reachableHexes,
} from "./engine.ts";
export {
  ATTACKER_COLUMN,
  DEFENDER_COLUMN,
  DEPLOYMENT_ROWS,
  MAX_OBSTACLES,
  MAX_STACKS_PER_SIDE,
  createBattle,
  deploymentHexes,
  generateObstacles,
} from "./setup.ts";
export {
  AI_VALUE_PER_HP_BY_TIER,
  aiValuePerHp,
  chooseAiAction,
  scoreActions,
  stackValue,
} from "./ai.ts";
export type { ScoredAction } from "./ai.ts";
export {
  DEFAULT_MAX_ROUNDS,
  autoPlay,
  battleResult,
  runAutoBattle,
} from "./auto.ts";
export type {
  AutoBattleOptions,
  AutoPlayResult,
  BattleResult,
  StackOutcome,
} from "./auto.ts";
export {
  battleStatsFromCreature,
  createBattleResolver,
  engineSetupFromGame,
  gameResultFromEngine,
} from "./resolver.ts";
