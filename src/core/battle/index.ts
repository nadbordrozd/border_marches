/**
 * Deterministic battle engine (GAME_DESIGN.md 9, RULES_V2.md 1: the battle
 * grammar). Pure: no DOM, no clock, no unseeded randomness.
 */

export * from "./types.ts";
export * from "./hex.ts";
export * from "./damage.ts";
export {
  ABILITY_HOOKS,
  abilityParam,
  countAdjacentAllies,
  isAlive,
} from "./abilities.ts";
export {
  ability,
  act,
  conditionKind,
  conditionKindIds,
  effect,
  groundKind,
  hasAct,
  hasConditionKind,
  registerAbility,
  registerAct,
  registerConditionKind,
  registerEffect,
  registerGroundKind,
} from "./registry.ts";
export type {
  AbilityDef,
  ActDef,
  ConditionKindDef,
  EffectFn,
  Effects,
  GroundKindDef,
  LandResult,
  Reaction,
  StrikeContext,
  StrikeOptions,
} from "./registry.ts";
export { STANDARD_CONDITION_KINDS, STANDARD_GROUND_KINDS } from "./standard.ts";
export {
  MAX_CLOCK,
  MAX_CONDITIONS,
  MAX_HOLD_CLOCK,
  MAX_LIVING_STACKS_PER_SIDE,
  MAX_REACTION_STEPS,
  MAX_SCHEDULED,
  MAX_SPEED,
  MIN_SPEED,
  ROUND_LIMIT,
  bears,
  blockingHexes,
  effectiveSpeed,
  freeHexes,
  groundAt,
  makeCondition,
  sideOf,
  stackTotalHp,
  timelineClass,
} from "./resolve.ts";
export {
  actionError,
  activeStack,
  applyAction,
  canShoot,
  canWait,
  compareTurnOrder,
  computeBreakdown,
  enemySide,
  findPath,
  getStack,
  heroActError,
  isLegalAction,
  isRangedCreature,
  legalActions,
  previewAttack,
  reachableHexes,
  turnOrder,
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
  stackFightValue,
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
  enemyIntents,
  rehearse,
  rehearsePlan,
  summarise,
  takeBackIndex,
} from "./rehearse.ts";
export type {
  HistoryEntry,
  Intent,
  PlanRehearsal,
  Rehearsal,
  Refusal,
  StackSummary,
} from "./rehearse.ts";
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
  HERO_ABILITY_PREFIX,
  HERO_START_EFFECT,
  heroAbilityIds,
  heroSpeedBonus,
  selectStacks,
  stackAbilityId,
  startRuleRefs,
  strikeAbilityId,
} from "./hero-effects.ts";
export type { HeroStackModifier, HeroStrikeModifier } from "./hero-effects.ts";
export {
  battleStatsFromCreature,
  createBattleResolver,
  engineSetupFromGame,
  gameResultFromEngine,
} from "./resolver.ts";
export {
  MAX_FUEL,
  MAX_POWER,
  RANK_MAX_TIER,
  RANK_POWER_BONUS,
  SCHOOLS,
  SCROLL_MIN_POWER,
  TIER_MANA,
  alliedSchools,
  clampPower,
  creatureCastError,
  creatureCastPower,
  creaturePagesLeft,
  echoError,
  emptyRanks,
  fuelError,
  heroCastError,
  heroCastPower,
  listedMana,
  manaCost,
  opposedSchools,
  schoolRelation,
  sideMagicFromSetup,
  touchedStacks,
} from "./magic.ts";
export type { SchoolRelation } from "./magic.ts";
export {
  actIds,
  casterOf,
  hasAbility,
  hasGroundKind,
  registerCreatureCaster,
} from "./registry.ts";
export type { CastContext } from "./registry.ts";
export type { MagicOutcome } from "./auto.ts";
