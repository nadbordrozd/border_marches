/**
 * The adventure-layer AI (bead bzc.19): {@link AdventureAi} plays a player
 * through the PlayerController interface of src/core/game/controller.ts.
 * strength.ts estimates fights, economy.ts runs the towns, match.ts plays
 * AI-only matches with per-day metrics (tools/sim/match.ts prints them).
 */
export { AdventureAi, type AdventureAiOptions } from "./adventure-ai.ts";
export {
  armyFv,
  FightOracle,
  heroPower,
  stackFv,
  type FightEstimate,
} from "./strength.ts";
export {
  buildingRank,
  buildQueue,
  chooseBuild,
  chooseHire,
  chooseRecruit,
} from "./economy.ts";
