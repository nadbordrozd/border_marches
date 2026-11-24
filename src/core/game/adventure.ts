/**
 * Moving heroes and visiting map objects (GAME_DESIGN.md section 7).
 */
import { CHEST } from "../../data/economy.ts";
import { HERO_SIGHT, TOWN_SIGHT } from "../../data/hero.ts";
import { gainXp } from "./hero.ts";
import { pickupInfo } from "./newGame.ts";
import { canEnter, cutsCorner, moveContext, stepCost } from "./pathfinding.ts";
import { checkEliminations } from "./players.ts";
import {
  armySize,
  checkTurn,
  cloneState,
  must,
  fail,
  findHero,
  findObject,
  revealDisc,
  success,
  townAtHero,
} from "./state.ts";
import type {
  CommandResult,
  GameEvent,
  GameState,
  HeroState,
  MoveStopReason,
  PendingBattle,
  TownState,
} from "./types.ts";

/**
 * Makes `owner` the town's owner in place (RULES_V2 5.5): buildings and
 * dwelling stock stay, the garrison is empty (it was beaten), the new
 * owner's townless counter resets, and the old owner may be eliminated.
 */
export function captureTown(
  state: GameState,
  town: TownState,
  owner: number,
  events: GameEvent[],
): void {
  const from = town.owner;
  town.owner = owner;
  town.garrison = town.garrison.map(() => null);
  town.builtToday = false;
  events.push({ type: "town-captured", townId: town.id, owner, from });
  const obj = findObject(state.map, town.id);
  const player = state.players.find((p) => p.id === owner);
  if (player !== undefined) player.townlessDays = 0;
  if (obj !== undefined && player !== undefined) {
    revealDisc(state.map, player.explored, obj.x, obj.y, TOWN_SIGHT);
  }
  checkEliminations(state, events);
}

/**
 * Visits whatever object has its entrance under the hero, in place.
 * Returns a battle to start, if the visit starts one.
 */
export function visitAtHero(
  state: GameState,
  hero: HeroState,
  events: GameEvent[],
): PendingBattle | null {
  const obj = state.map.objects.find(
    (o) =>
      o.x === hero.x &&
      o.y === hero.y &&
      o.kind !== "hero-start" &&
      o.kind !== "monster",
  );
  if (obj === undefined) return null;
  switch (obj.kind) {
    case "town": {
      const town = state.towns[obj.id];
      if (town === undefined) return null;
      if (town.owner === hero.owner) {
        events.push({ type: "visit-town", heroId: hero.id, townId: town.id });
        return null;
      }
      if (armySize(town.garrison) > 0) {
        return { kind: "town", objectId: town.id, heroId: hero.id };
      }
      captureTown(state, town, hero.owner, events);
      events.push({ type: "visit-town", heroId: hero.id, townId: town.id });
      return null;
    }
    case "mine": {
      const mine = state.mines[obj.id];
      if (mine !== undefined && mine.owner !== hero.owner) {
        mine.owner = hero.owner;
        events.push({
          type: "mine-flagged",
          mineId: mine.id,
          owner: hero.owner,
        });
      }
      return null;
    }
    case "pickup": {
      if (state.collected.includes(obj.id)) return null;
      const info = pickupInfo(obj);
      if (info.type === "chest") {
        events.push({ type: "chest-offer", heroId: hero.id, pickupId: obj.id });
        return null;
      }
      const player = state.players.find((p) => p.id === hero.owner);
      if (player !== undefined) player.resources[info.resource] += info.amount;
      state.collected.push(obj.id);
      events.push({
        type: "pickup",
        pickupId: obj.id,
        resource: info.resource,
        amount: info.amount,
      });
      return null;
    }
    default:
      return null;
  }
}

/**
 * The pending battle for `attackerId` attacking the hero `defenderId`. A
 * defender standing on its own town's entrance defends the town (fort,
 * no retreat, garrison next).
 */
export function heroBattle(
  state: GameState,
  attackerId: string,
  defenderId: string,
): PendingBattle {
  const defender = must(findHero(state, defenderId), "defender");
  const town = townAtHero(state, defender);
  return town !== undefined && town.owner === defender.owner
    ? {
        kind: "hero",
        objectId: defenderId,
        heroId: attackerId,
        townId: town.id,
      }
    : { kind: "hero", objectId: defenderId, heroId: attackerId };
}

/** Neutral stacks whose zone of control covers the hero's cell. */
export function guardsAt(state: GameState, hero: HeroState): string[] {
  const ctx = moveContext(state, hero, { ignoreFog: true });
  return ctx.guards.get(hero.y * state.map.width + hero.x) ?? [];
}

/**
 * Moves a hero along a path (as from findPath: the cells after the hero's
 * own; a leading copy of the hero's cell is skipped). The hero walks while
 * it has MP for the next step and stops early:
 * - "guarded": it entered a neutral stack's zone of control; the stack
 *   attacks (pendingBattle is set; the path's target stack if it is one of
 *   the guards, else the first guard in map object order);
 * - "object": it entered an object entrance that stops movement (visited);
 * - "attack": the next step is a neutral stack's cell (pendingBattle set);
 * - "no-mp": not enough MP for the next step (the rest stays for tomorrow).
 * Reaching the end ("arrived") on an object entrance visits it (own towns
 * produce a "visit-town" event for the UI).
 *
 * Fails with "bad-path" when a step that would be taken is not adjacent,
 * not enterable or cuts a corner.
 */
export function moveHeroAlong(
  state: GameState,
  heroId: string,
  path: ReadonlyArray<{ x: number; y: number }>,
): CommandResult {
  const original = findHero(state, heroId);
  if (original === undefined || !original.alive) {
    return fail("unknown-hero", `no hero ${heroId}`);
  }
  const blocked = checkTurn(state, original.owner);
  if (blocked !== null) return blocked;
  let steps = path;
  if (steps[0]?.x === original.x && steps[0]?.y === original.y) {
    steps = steps.slice(1);
  }
  if (steps.length === 0) return fail("bad-path", "empty path");

  const next = cloneState(state);
  const hero = must(findHero(next, heroId), "hero");
  const ctx = moveContext(next, hero, { ignoreFog: true });
  const player = next.players.find((p) => p.id === hero.owner);
  const { map } = next;
  const lastStep = must(steps[steps.length - 1], "step");
  const targetMonster = ctx.monsterAt.get(lastStep.y * map.width + lastStep.x);

  const cells: Array<[number, number]> = [];
  let spent = 0;
  let stop: MoveStopReason = "arrived";
  let battle: PendingBattle | null = null;

  for (let i = 0; i < steps.length; i++) {
    const { x, y } = must(steps[i], "step");
    const dx = Math.abs(x - hero.x);
    const dy = Math.abs(y - hero.y);
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      Math.max(dx, dy) !== 1
    ) {
      return fail("bad-path", `step ${i} to (${x},${y}) is not adjacent`);
    }
    const idx = y * map.width + x;
    const monsterId = ctx.monsterAt.get(idx);
    if (monsterId !== undefined) {
      if (i !== steps.length - 1 || cutsCorner(ctx, hero.x, hero.y, x, y)) {
        return fail("bad-path", `step ${i} runs into a neutral stack`);
      }
      battle = { kind: "monster", objectId: monsterId, heroId };
      stop = "attack";
      break;
    }
    const enemyId = ctx.enemyHeroAt.get(idx);
    if (enemyId !== undefined) {
      if (i !== steps.length - 1 || cutsCorner(ctx, hero.x, hero.y, x, y)) {
        return fail("bad-path", `step ${i} runs into a hero`);
      }
      battle = heroBattle(next, heroId, enemyId);
      stop = "attack";
      break;
    }
    if (!canEnter(ctx, x, y) || cutsCorner(ctx, hero.x, hero.y, x, y)) {
      return fail("bad-path", `step ${i} to (${x},${y}) is blocked`);
    }
    const cost = stepCost(map, ctx.nativeTerrain, hero.x, hero.y, x, y);
    if (cost > hero.mp) {
      stop = "no-mp";
      break;
    }
    hero.mp -= cost;
    spent += cost;
    hero.x = x;
    hero.y = y;
    cells.push([x, y]);
    if (player !== undefined) {
      revealDisc(map, player.explored, x, y, HERO_SIGHT);
    }
    const guards = ctx.guards.get(idx);
    if (guards !== undefined) {
      const target =
        targetMonster !== undefined && guards.includes(targetMonster)
          ? targetMonster
          : must(guards[0], "guard");
      battle = { kind: "monster", objectId: target, heroId };
      stop = "guarded";
      break;
    }
    if (ctx.stops.has(idx)) {
      stop = "object";
      break;
    }
  }

  const events: GameEvent[] = [
    { type: "moved", heroId, cells, mpSpent: spent, stop },
  ];
  if (battle === null && (stop === "object" || stop === "arrived")) {
    battle = visitAtHero(next, hero, events);
  }
  if (battle !== null) {
    next.pendingBattle = battle;
    events.push({ type: "battle", battle });
  }
  return success(next, events);
}

/**
 * Visits the object the hero stands on (its entrance cell): re-opens an own
 * town, flags a mine, takes a pickup, offers a chest, or starts the battle
 * for an enemy town.
 */
export function visitObject(
  state: GameState,
  heroId: string,
  objectId: string,
): CommandResult {
  const original = findHero(state, heroId);
  if (original === undefined || !original.alive) {
    return fail("unknown-hero", `no hero ${heroId}`);
  }
  const blocked = checkTurn(state, original.owner);
  if (blocked !== null) return blocked;
  const obj = findObject(state.map, objectId);
  if (obj === undefined) return fail("unknown-object", `no object ${objectId}`);
  if (obj.x !== original.x || obj.y !== original.y) {
    return fail("not-on-object", "the hero is not on the object's entrance");
  }
  const next = cloneState(state);
  const hero = must(findHero(next, heroId), "hero");
  const events: GameEvent[] = [];
  const battle = visitAtHero(next, hero, events);
  if (battle !== null) {
    next.pendingBattle = battle;
    events.push({ type: "battle", battle });
  }
  return success(next, events);
}

/** Takes the treasure chest the hero stands on: 1000 gold or 750 XP. */
export function takeChest(
  state: GameState,
  heroId: string,
  pickupId: string,
  choice: "gold" | "xp",
): CommandResult {
  const original = findHero(state, heroId);
  if (original === undefined || !original.alive) {
    return fail("unknown-hero", `no hero ${heroId}`);
  }
  const blocked = checkTurn(state, original.owner);
  if (blocked !== null) return blocked;
  const obj = findObject(state.map, pickupId);
  if (
    obj === undefined ||
    obj.kind !== "pickup" ||
    pickupInfo(obj).type !== "chest" ||
    state.collected.includes(pickupId)
  ) {
    return fail("unknown-object", `no chest ${pickupId}`);
  }
  if (obj.x !== original.x || obj.y !== original.y) {
    return fail("not-on-object", "the hero is not on the chest");
  }
  if (choice !== "gold" && choice !== "xp") {
    return fail("bad-choice", `bad chest choice ${String(choice)}`);
  }
  const next = cloneState(state);
  const hero = must(findHero(next, heroId), "hero");
  const events: GameEvent[] = [];
  if (choice === "gold") {
    const player = next.players.find((p) => p.id === hero.owner);
    if (player !== undefined) player.resources.gold += CHEST.gold;
    events.push({
      type: "pickup",
      pickupId,
      resource: "gold",
      amount: CHEST.gold,
    });
  } else {
    gainXp(hero, CHEST.xp, events);
  }
  next.collected.push(pickupId);
  return success(next, events);
}
