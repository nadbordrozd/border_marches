/**
 * Player controllers and the AI turn driver (RULES_V2 5.1, 5.2, 5.10).
 *
 * A {@link PlayerController} decides one {@link GameAction} at a time for
 * the player whose turn it is; {@link aiStep} applies it and settles what
 * follows (battles that do not involve the human are fought by the given
 * resolver, AI level-ups and chests are chosen through the controller).
 * The interface waits on the human only for a battle the human fights.
 *
 * The adventure AI (src/core/ai, bead bzc.19) implements PlayerController;
 * {@link SimpleAi} is the old stand-in, kept as the baseline of the match
 * runner (tools/sim/match.ts): it only collects pickups and flags mines it
 * can reach today without a fight, recruits in its towns, and ends its
 * turn.
 */
import { getCreature } from "../../data/creatures.ts";
import type { BuildingId, CreatureId, ResourceId } from "../../data/types.ts";
import {
  castAdventureSpell,
  type AdventureTarget,
} from "../magic/adventure.ts";
import { takeChest } from "./adventure.ts";
import {
  assemble,
  equip,
  handOver,
  unequip,
  useConsumable,
  type ItemRef,
} from "./artifacts.ts";
import { moveHeroAlong } from "./adventure.ts";
import {
  applyBattleResult,
  battlePlayers,
  battleSetup,
  type BattleResolver,
} from "./battle.ts";
import { chooseLevelUp, levelUpOffer, type LevelUpOffer } from "./hero.ts";
import { findPath, reachableCells } from "./pathfinding.ts";
import { dismissHero, hireHero } from "./players.ts";
import { maxAffordable } from "./resources.ts";
import { digHere, useSite } from "./sites.ts";
import { fail, findPlayer, heroesOf, townsOf } from "./state.ts";
import {
  build,
  heroInTownOf,
  marketTrade,
  recruit,
  transferStack,
  type TransferArgs,
} from "./town.ts";
import { endTurn } from "./turn.ts";
import type { CommandResult, GameEvent, GameState } from "./types.ts";

/** Everything a player can do on its turn, as data. */
export type GameAction =
  | { type: "move"; heroId: string; path: Array<{ x: number; y: number }> }
  | { type: "build"; townId: string; building: BuildingId }
  | {
      type: "recruit";
      townId: string;
      creature: CreatureId;
      count: number;
      to?: "hero" | "garrison";
    }
  | { type: "hire"; townId: string; heroDefId: string }
  | { type: "dismiss"; heroId: string }
  | { type: "transfer"; args: TransferArgs }
  /** Artifacts (RULES_V2 4): wear a backpack item, take one off, use one. */
  | { type: "equip"; heroId: string; index: number; slot?: number }
  | { type: "unequip"; heroId: string; slot: number }
  | { type: "use-item"; heroId: string; index: number }
  | { type: "assemble"; heroId: string; marvel: string }
  /** Hand an item to an adjacent own hero (RULES_V2 5.3). */
  | { type: "hand-over"; heroId: string; toHeroId: string; item: ItemRef }
  /** Answer the choice of the site the hero stands on (useSite). */
  | { type: "use-site"; heroId: string; objectId: string; option: string }
  /** Dig on the hero's cell (digHere). */
  | { type: "dig"; heroId: string }
  /** Cast an adventure spell from the book or a scroll (RULES_V2 2.8). */
  | {
      type: "cast";
      heroId: string;
      spell: string;
      target?: AdventureTarget;
      scroll?: boolean;
    }
  /** Trade at the marketplace rates (marketTrade). */
  | { type: "trade"; give: ResourceId; amount: number; get: ResourceId }
  | { type: "end-turn" };

/** Applies an action for the current player. */
export function applyAction(
  state: GameState,
  action: GameAction,
): CommandResult {
  switch (action.type) {
    case "move":
      return moveHeroAlong(state, action.heroId, action.path);
    case "build":
      return build(state, action.townId, action.building);
    case "recruit":
      return recruit(
        state,
        action.townId,
        action.creature,
        action.count,
        action.to,
      );
    case "hire":
      return hireHero(state, action.townId, action.heroDefId);
    case "dismiss":
      return dismissHero(state, action.heroId);
    case "transfer":
      return transferStack(state, action.args);
    case "equip":
      return equip(state, action.heroId, action.index, action.slot);
    case "unequip":
      return unequip(state, action.heroId, action.slot);
    case "use-item":
      return useConsumable(state, action.heroId, action.index);
    case "assemble":
      return assemble(state, action.heroId, action.marvel);
    case "hand-over":
      return handOver(state, action.heroId, action.toHeroId, action.item);
    case "use-site":
      return useSite(state, action.heroId, action.objectId, action.option);
    case "dig":
      return digHere(state, action.heroId);
    case "cast":
      return castAdventureSpell(
        state,
        action.heroId,
        action.spell,
        action.target ?? {},
        action.scroll === true ? { scroll: true } : {},
      );
    case "trade":
      return marketTrade(
        state,
        state.currentPlayer,
        action.give,
        action.amount,
        action.get,
      );
    case "end-turn":
      return endTurn(state);
    default:
      return fail("bad-choice", "unknown action");
  }
}

/**
 * Decides for one player. Implementations must be pure functions of the
 * state and read only what the player may know (RULES_V2 5.10: its own
 * explored cells, not other players' resources), so a game replays
 * exactly.
 */
export interface PlayerController {
  /**
   * The next action for `player`, whose turn it is. Return
   * `{ type: "end-turn" }` to finish. The driver ends the turn by itself
   * when an action fails or after its action limit.
   */
  decide(state: GameState, player: number): GameAction;
  /**
   * A level-up choice for one of the player's heroes: the index (0..2) of
   * the chosen entry of `offer` (RULES_V2 3.3: skill offers, the first is
   * the guaranteed upgrade; or a feat draft, 3.5). Default: the first.
   */
  levelUp?(state: GameState, heroId: string, offer: LevelUpOffer): number;
  /** A treasure chest's reward (default: gold). */
  chest?(state: GameState, heroId: string, pickupId: string): "gold" | "xp";
}

export type AiStepOutcome =
  /** The action was applied; call aiStep again. */
  | "continue"
  /** The player ended its turn (the state is the next player's turn). */
  | "turn-ended"
  /** A battle the human fights is pending: resolve it, then call again. */
  | "human-battle"
  | "game-over";

export interface AiStepResult {
  state: GameState;
  events: GameEvent[];
  /** The action taken, if any. */
  action: GameAction | null;
  outcome: AiStepOutcome;
}

/** The default choice: the guarantee, or the first feat drafted. */
function defaultLevelUp(): number {
  return 0;
}

/**
 * Settles what an AI action left open, in order: battles the human is not
 * part of (fought by `resolver`), AI level-ups, AI chest offers. Stops at a
 * battle with the human.
 */
function settle(
  state: GameState,
  events: GameEvent[],
  controllers: (player: number) => PlayerController | null,
  resolver: BattleResolver,
): { state: GameState; humanBattle: boolean } {
  let s = state;
  const pendingChests: Array<{ heroId: string; pickupId: string }> = [];
  const noteChests = (evs: readonly GameEvent[]): void => {
    for (const e of evs) {
      if (e.type === "chest-offer") pendingChests.push(e);
    }
  };
  noteChests(events);
  for (let guard = 0; guard < 64; guard++) {
    if (s.status !== "playing") break;
    // AI level-ups (also of an AI defender after the human attacked).
    for (const hero of s.heroes) {
      const c = hero.alive ? controllers(hero.owner) : null;
      while (c !== null && hero.pendingLevelUps > 0) {
        const offer = levelUpOffer(s, hero.id);
        if (offer === null) break;
        const choice = c.levelUp?.(s, hero.id, offer) ?? defaultLevelUp();
        const r = chooseLevelUp(s, hero.id, choice);
        if (!r.ok) break;
        s = r.state;
        events.push(...r.events);
        const h = s.heroes.find((x) => x.id === hero.id);
        if (h === undefined || h.pendingLevelUps <= 0) break;
      }
    }
    const battle = s.pendingBattle;
    if (battle === null) break;
    const sides = battlePlayers(s, battle);
    // A side waits for the human when its player has no controller (in an
    // all-AI match none does, though humanPlayer() still names player 0).
    const human = (p: number | null): boolean =>
      p !== null && controllers(p) === null;
    if (human(sides.attacker) || human(sides.defender)) {
      return { state: s, humanBattle: true };
    }
    const setup = battleSetup(s);
    if (setup === null) break;
    const r = applyBattleResult(s, resolver(setup));
    if (!r.ok) break;
    s = r.state;
    events.push(...r.events);
    noteChests(r.events);
  }
  for (const chest of pendingChests) {
    const hero = s.heroes.find((h) => h.id === chest.heroId);
    const c = hero === undefined ? null : controllers(hero.owner);
    if (c === null || s.pendingBattle !== null) continue;
    const choice = c.chest?.(s, chest.heroId, chest.pickupId) ?? "gold";
    const r = takeChest(s, chest.heroId, chest.pickupId, choice);
    if (r.ok) {
      s = r.state;
      events.push(...r.events);
    }
  }
  return { state: s, humanBattle: false };
}

/**
 * One step of an AI player's turn: settles anything left open, asks the
 * controller for an action, applies it, and settles again. A failed
 * action ends the turn (so a confused controller cannot stall the game).
 * `controllers` maps a player to its controller (null for the human).
 */
export function aiStep(
  state: GameState,
  controllers: (player: number) => PlayerController | null,
  resolver: BattleResolver,
): AiStepResult {
  const events: GameEvent[] = [];
  if (state.status !== "playing") {
    return { state, events, action: null, outcome: "game-over" };
  }
  const before = settle(state, events, controllers, resolver);
  if (before.humanBattle) {
    return {
      state: before.state,
      events,
      action: null,
      outcome: "human-battle",
    };
  }
  let s = before.state;
  if (s.status !== "playing") {
    return { state: s, events, action: null, outcome: "game-over" };
  }
  const player = s.currentPlayer;
  const controller = controllers(player);
  if (controller === null) {
    return { state: s, events, action: null, outcome: "turn-ended" };
  }
  let action = controller.decide(s, player);
  let result = applyAction(s, action);
  if (!result.ok && action.type !== "end-turn") {
    action = { type: "end-turn" };
    result = applyAction(s, action);
  }
  if (!result.ok) {
    return { state: s, events, action, outcome: "game-over" };
  }
  s = result.state;
  events.push(...result.events);
  if (action.type === "end-turn") {
    return {
      state: s,
      events,
      action,
      outcome: s.status === "playing" ? "turn-ended" : "game-over",
    };
  }
  const after = settle(s, events, controllers, resolver);
  s = after.state;
  return {
    state: s,
    events,
    action,
    outcome: after.humanBattle
      ? "human-battle"
      : s.status === "playing"
        ? "continue"
        : "game-over",
  };
}

/**
 * Runs the current AI player's whole turn: aiStep until the turn ends, a
 * battle with the human is pending, or the game ends. After `maxActions`
 * actions the turn is ended for it.
 */
export function runAiTurn(
  state: GameState,
  controllers: (player: number) => PlayerController | null,
  resolver: BattleResolver,
  maxActions = 200,
): AiStepResult {
  const events: GameEvent[] = [];
  let s = state;
  let last: AiStepResult = {
    state,
    events,
    action: null,
    outcome: "continue",
  };
  for (let i = 0; i < maxActions; i++) {
    last = aiStep(s, controllers, resolver);
    s = last.state;
    events.push(...last.events);
    if (last.outcome !== "continue") return { ...last, events };
  }
  const ended = endTurn(s);
  if (ended.ok) {
    events.push(...ended.events);
    return {
      state: ended.state,
      events,
      action: { type: "end-turn" },
      outcome: "turn-ended",
    };
  }
  return { ...last, events };
}

/** Today's free targets of a hero: uncollected pickups and foreign mines. */
function freeTargets(
  state: GameState,
  heroId: string,
): Array<{
  x: number;
  y: number;
  cost: number;
}> {
  const hero = state.heroes.find((h) => h.id === heroId);
  if (hero === undefined) return [];
  const reach = reachableCells(state, heroId);
  const collected = new Set(state.collected);
  const guarded = new Set<number>();
  const w = state.map.width;
  const explored = findPlayer(state, hero.owner)?.explored ?? [];
  for (const m of Object.values(state.monsters)) {
    if (explored[m.y * w + m.x] !== true) continue;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) guarded.add((m.y + dy) * w + m.x + dx);
    }
  }
  const out: Array<{ x: number; y: number; cost: number }> = [];
  for (const obj of state.map.objects) {
    const i = obj.y * w + obj.x;
    const cost = reach.get(i);
    if (cost === undefined || cost === 0 || guarded.has(i)) continue;
    if (obj.kind === "pickup" && !collected.has(obj.id)) {
      out.push({ x: obj.x, y: obj.y, cost });
    } else if (
      obj.kind === "mine" &&
      state.mines[obj.id]?.owner !== hero.owner
    ) {
      out.push({ x: obj.x, y: obj.y, cost });
    }
  }
  return out.sort((a, b) => a.cost - b.cost || a.y - b.y || a.x - b.x);
}

/**
 * The stand-in AI: recruits what its towns offer (into the garrison, or
 * the hero standing there), walks each hero to the nearest pickup or
 * foreign mine it can reach today without a fight, then ends the turn.
 * Deterministic and fog-respecting (paths use the player's explored
 * cells).
 */
export class SimpleAi implements PlayerController {
  decide(state: GameState, player: number): GameAction {
    const me = findPlayer(state, player);
    if (me === undefined) return { type: "end-turn" };
    for (const town of townsOf(state, player)) {
      for (const [creature, d] of Object.entries(town.dwellings)) {
        if (d === undefined || d.available <= 0) continue;
        const id = creature as CreatureId;
        const n = Math.min(
          d.available,
          maxAffordable(me.resources, getCreature(id).cost),
        );
        if (n <= 0) continue;
        const hero = heroInTownOf(state, town);
        const to = hero !== undefined ? "hero" : "garrison";
        const army = hero !== undefined ? hero.army : town.garrison;
        const fits = army.some((s) => s === null || s.creature === id);
        if (!fits) continue;
        return { type: "recruit", townId: town.id, creature: id, count: n, to };
      }
    }
    for (const hero of heroesOf(state, player)) {
      if (hero.mp <= 0) continue;
      const target = freeTargets(state, hero.id)[0];
      if (target === undefined) continue;
      const path = findPath(state, hero.id, target.x, target.y);
      if (path === null || path.steps.some((s) => s.day > 0 || s.attack)) {
        continue;
      }
      return {
        type: "move",
        heroId: hero.id,
        path: path.steps.map((s) => ({ x: s.x, y: s.y })),
      };
    }
    return { type: "end-turn" };
  }
}
