/**
 * Moving heroes and visiting map objects (GAME_DESIGN.md section 7).
 */
import { CHEST } from "../../data/economy.ts";
import { TOWN_SIGHT } from "../../data/hero.ts";
import { SEA_CHEST } from "../../data/sea-objects.ts";
import { gainXp } from "./hero.ts";
import { learnInTown, noteHeroPath } from "../magic/adventure.ts";
import { pickupInfo } from "./newGame.ts";
import {
  heroSight,
  isAfloat,
  shipAt,
  toLandPoints,
  toSeaPoints,
} from "./naval.ts";
import {
  canEnter,
  cutsCorner,
  isLilyCell,
  lilyStepCost,
  moveContext,
  navalStepCost,
  navalStepKind,
  stepCost,
  type NavalMove,
  type NavalStepKind,
} from "./pathfinding.ts";
import { checkEliminations } from "./players.ts";
import { visitSite } from "./sites.ts";
import { besidePickup, isPickup } from "./site-state.ts";
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
import type { MapObject } from "../map/types.ts";
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
 * Returns a battle to start, if the visit starts one. Pickups are not
 * visited this way (they are taken from a next cell, bead bzc.49).
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
      o.kind !== "monster" &&
      o.kind !== "buried" &&
      o.kind !== "gate" &&
      !isPickup(o),
  );
  if (obj === undefined) return null;
  return visitObjectNow(state, hero, obj, events);
}

/**
 * Visits `obj` for the hero, in place, wherever the hero stands (callers
 * check the hero is on the entrance, or beside a pickup). Returns a battle
 * to start, if the visit starts one.
 */
function visitObjectNow(
  state: GameState,
  hero: HeroState,
  obj: MapObject,
  events: GameEvent[],
): PendingBattle | null {
  switch (obj.kind) {
    case "town": {
      const town = state.towns[obj.id];
      if (town === undefined) return null;
      if (town.owner === hero.owner) {
        learnInTown(state, hero, town.id, events);
        events.push({ type: "visit-town", heroId: hero.id, townId: town.id });
        return null;
      }
      if (armySize(town.garrison) > 0) {
        return { kind: "town", objectId: town.id, heroId: hero.id };
      }
      captureTown(state, town, hero.owner, events);
      learnInTown(state, hero, town.id, events);
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
        const rich = obj.data["artifact"];
        if (typeof rich === "string") {
          // The rich chest of rings 2-3 holds a Trinket instead.
          return visitSite(
            state,
            hero,
            { ...obj, data: { ...obj.data, type: "loose-artifact" } },
            events,
          );
        }
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
    case "dwelling":
    case "site":
    case "bank":
    case "artifact":
    case "teleport":
      return visitSite(state, hero, obj, events);
    default:
      return null;
  }
}

/**
 * After a won fight (bead bzc.49): the next guard of the pickup the hero
 * reached for, or the pickup itself, taken from where the hero stands.
 */
export function takePickupAfterFight(
  state: GameState,
  hero: HeroState,
  pickupId: string,
  events: GameEvent[],
): PendingBattle | null {
  const obj = findObject(state.map, pickupId);
  if (obj === undefined || state.collected.includes(pickupId)) return null;
  if (!besidePickup(obj, hero.x, hero.y)) return null;
  const ctx = moveContext(state, hero, { ignoreFog: true });
  const guard = ctx.guards.get(obj.y * state.map.width + obj.x)?.[0];
  if (guard !== undefined) {
    return { kind: "monster", objectId: guard, heroId: hero.id, pickupId };
  }
  return visitObjectNow(state, hero, obj, events);
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
  // From a ship it is a beach landing (NAVAL 3.2): no fort, and the winner
  // stays aboard (it must land to enter the town).
  const attacker = findHero(state, attackerId);
  const afloat = attacker !== undefined && isAfloat(state, attacker);
  return town !== undefined && town.owner === defender.owner && !afloat
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
 * - "pickup": the last step is an uncollected pickup's cell (bead bzc.49):
 *   the hero takes it from where it stands, at no movement cost; when that
 *   cell lies in a zone of control the stop is "guarded" instead (the
 *   first guard attacks, and the pickup is taken once every guard is
 *   beaten: PendingBattle.pickupId);
 * - "no-mp": not enough MP for the next step (the rest stays for tomorrow).
 * Reaching the end ("arrived") on an object entrance visits it (own towns
 * produce a "visit-town" event for the UI).
 *
 * Fails with "bad-path" when a step that would be taken is not adjacent,
 * not enterable or cuts a corner (a pickup's cell anywhere but last).
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
  let pickup: MapObject | undefined;
  /** Boardings and landings on the way (naval maps). */
  const navalEvents: GameEvent[] = [];
  /**
   * Lily Road (NAVAL 7.1, bead bzc.154): the walk as it stood on the last
   * cell that was not lily pads. A walk never stops on water: if it would
   * (out of points, or a path ending there), it ends back there instead.
   */
  let ashore = { x: hero.x, y: hero.y, mp: hero.mp, cells: 0, spent: 0 };
  const onPads = (): boolean =>
    ctx.lily !== undefined &&
    ctx.lily !== null &&
    map.cells[hero.y * map.width + hero.x]?.terrain === "water" &&
    !isAfloat(next, hero);

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
    const padsNow = onPads();
    if (
      padsNow &&
      (ctx.monsterAt.has(idx) ||
        ctx.pickupAt.has(idx) ||
        ctx.enemyHeroAt.has(idx))
    ) {
      return fail("bad-path", `step ${i}: nothing is done from lily pads`);
    }
    const monsterId = ctx.monsterAt.get(idx);
    if (monsterId !== undefined) {
      if (i !== steps.length - 1 || cutsCorner(ctx, hero.x, hero.y, x, y)) {
        return fail("bad-path", `step ${i} runs into a neutral stack`);
      }
      battle = { kind: "monster", objectId: monsterId, heroId };
      stop = "attack";
      break;
    }
    const pickupId = ctx.pickupAt.get(idx);
    if (pickupId !== undefined) {
      if (i !== steps.length - 1 || cutsCorner(ctx, hero.x, hero.y, x, y)) {
        return fail("bad-path", `step ${i} runs into a pickup`);
      }
      pickup = findObject(map, pickupId);
      const guards = ctx.guards.get(idx);
      if (guards !== undefined) {
        // In a zone of control: its guards attack first (RULES_V2 5.6).
        battle = {
          kind: "monster",
          objectId: must(guards[0], "guard"),
          heroId,
          pickupId,
        };
        stop = "guarded";
      } else stop = "pickup";
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
    const nav = ctx.naval;
    if (nav !== undefined && nav !== null) {
      // Naval maps (bead bzc.149): walk, sail, board, land or lily pads.
      const kind = navalStepKind(ctx, hero.x, hero.y, x, y, false, padsNow);
      if (kind === null) {
        return fail("bad-path", `step ${i} to (${x},${y}) is blocked`);
      }
      const cost = navalStepCost(ctx, kind, hero.x, hero.y, x, y);
      const paid = navalStep(next, hero, kind, cost, x, y, nav, navalEvents);
      if (paid === null) {
        stop = "no-mp";
        break;
      }
      spent += paid;
    } else {
      const pads = isLilyCell(ctx, x, y);
      if (
        (!pads && !canEnter(ctx, x, y)) ||
        cutsCorner(ctx, hero.x, hero.y, x, y)
      ) {
        return fail("bad-path", `step ${i} to (${x},${y}) is blocked`);
      }
      const cost = pads
        ? lilyStepCost(ctx, hero.x, hero.y, x, y)
        : stepCost(
            map,
            ctx.nativeTerrain,
            hero.x,
            hero.y,
            x,
            y,
            ctx.forestCost,
          );
      if (cost > hero.mp) {
        stop = "no-mp";
        break;
      }
      hero.mp -= cost;
      spent += cost;
    }
    hero.x = x;
    hero.y = y;
    cells.push([x, y]);
    if (player !== undefined) {
      revealDisc(map, player.explored, x, y, heroSight(next, hero));
    }
    if (!onPads()) ashore = { x, y, mp: hero.mp, cells: cells.length, spent };
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
  if (onPads()) {
    // Never left standing on lily pads: back to the last cell ashore.
    hero.x = ashore.x;
    hero.y = ashore.y;
    hero.mp = ashore.mp;
    cells.length = ashore.cells;
    spent = ashore.spent;
    stop = "no-mp";
  }

  noteHeroPath(next, hero, [original.x, original.y], cells);
  const events: GameEvent[] = [
    { type: "moved", heroId, cells, mpSpent: spent, stop },
    ...navalEvents,
  ];
  if (battle === null && (stop === "object" || stop === "arrived")) {
    battle = visitAtHero(next, hero, events);
  }
  if (battle === null && stop === "pickup" && pickup !== undefined) {
    battle = visitObjectNow(next, hero, pickup, events);
  }
  if (battle !== null) {
    next.pendingBattle = battle;
    events.push({ type: "battle", battle });
  }
  return success(next, events);
}

/**
 * Pays for one naval step (bead bzc.149, NAVAL 2.3-2.4), in place, before
 * the hero's cell changes: a walk or a sail costs its points (the ship
 * sails along); a boarding costs land points, converts the rest to sea
 * points and takes the ship for the hero's player; a landing converts back
 * with Seafaring (then the land cost) or uses up the day without it, and
 * leaves the ship moored where it was. Returns the points paid, or null
 * (nothing changed) when the hero has too few for the step today.
 */
function navalStep(
  state: GameState,
  hero: HeroState,
  kind: NavalStepKind,
  cost: number,
  x: number,
  y: number,
  nav: NavalMove,
  events: GameEvent[],
): number | null {
  const w = state.map.width;
  switch (kind) {
    case "walk":
    case "lily":
      if (cost > hero.mp) return null;
      hero.mp -= cost;
      return cost;
    case "sail": {
      if (cost > hero.mp) return null;
      const ship = shipAt(state, hero.x, hero.y);
      hero.mp -= cost;
      if (ship !== undefined) {
        ship.x = x;
        ship.y = y;
      }
      return cost;
    }
    case "board": {
      const ship = shipAt(state, x, y);
      if (ship === undefined || cost > hero.mp) return null;
      hero.mp = toSeaPoints(hero.mp - cost, nav.landMax, nav.seaMax);
      const from = ship.owner;
      ship.owner = hero.owner;
      nav.moored.delete(y * w + x);
      nav.afloat = true;
      events.push({
        type: "ship-boarded",
        heroId: hero.id,
        shipId: ship.id,
        from,
      });
      return cost;
    }
    case "land": {
      let paid: number;
      const endsDay = nav.seafaring < 1;
      if (!endsDay) {
        const land = toLandPoints(hero.mp, nav.landMax, nav.seaMax);
        if (cost > land) return null;
        hero.mp = land - cost;
        paid = cost;
      } else {
        if (hero.mp <= 0) return null;
        paid = hero.mp;
        hero.mp = 0;
      }
      const ship = shipAt(state, hero.x, hero.y);
      nav.afloat = false;
      if (ship !== undefined) {
        nav.moored.set(ship.y * w + ship.x, ship.id);
        events.push({
          type: "ship-landed",
          heroId: hero.id,
          shipId: ship.id,
          endsDay,
        });
      }
      return paid;
    }
  }
}

/**
 * Visits the object the hero stands on (its entrance cell), or a pickup
 * next to it: re-opens an own town, flags a mine, takes a pickup, offers
 * a chest, or starts the battle for an enemy town.
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
  const pickup = isPickup(obj);
  if (
    pickup
      ? !besidePickup(obj, original.x, original.y)
      : obj.x !== original.x || obj.y !== original.y
  ) {
    return fail(
      "not-on-object",
      pickup
        ? "the hero is not next to the pickup"
        : "the hero is not on the object's entrance",
    );
  }
  const next = cloneState(state);
  const hero = must(findHero(next, heroId), "hero");
  const events: GameEvent[] = [];
  const battle = pickup
    ? visitObjectNow(next, hero, obj, events)
    : visitAtHero(next, hero, events);
  if (battle !== null) {
    next.pendingBattle = battle;
    events.push({ type: "battle", battle });
  }
  return success(next, events);
}

/**
 * A chest's two offers: its own `data.gold` and `data.xp`, else a treasure
 * chest's (1000 gold or 750 XP) or a Sea Chest's (1500 or 1000, bead
 * bzc.151).
 */
export function chestTerms(obj: MapObject): { gold: number; xp: number } {
  const sea = obj.data["type"] === "sea-chest";
  const num = (k: string, land: number, water: number): number => {
    const v = obj.data[k];
    return typeof v === "number" ? v : sea ? water : land;
  };
  return {
    gold: num("gold", CHEST.gold, SEA_CHEST.gold),
    xp: num("xp", CHEST.xp, SEA_CHEST.xp),
  };
}

/** Takes the treasure chest next to the hero: 1000 gold or 750 XP. */
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
  // A Sea Chest (bead bzc.151) offers the same choice at its own prices.
  const sea = obj !== undefined && obj.data["type"] === "sea-chest";
  if (
    obj === undefined ||
    (sea
      ? typeof obj.data["artifact"] === "string"
      : obj.kind !== "pickup" || pickupInfo(obj).type !== "chest") ||
    state.collected.includes(pickupId)
  ) {
    return fail("unknown-object", `no chest ${pickupId}`);
  }
  if (!besidePickup(obj, original.x, original.y)) {
    return fail("not-on-object", "the hero is not next to the chest");
  }
  if (choice !== "gold" && choice !== "xp") {
    return fail("bad-choice", `bad chest choice ${String(choice)}`);
  }
  const next = cloneState(state);
  const hero = must(findHero(next, heroId), "hero");
  const events: GameEvent[] = [];
  const { gold, xp } = chestTerms(obj);
  if (choice === "gold") {
    const player = next.players.find((p) => p.id === hero.owner);
    if (player !== undefined) player.resources.gold += gold;
    events.push({
      type: "pickup",
      pickupId,
      resource: "gold",
      amount: gold,
    });
  } else {
    gainXp(hero, xp, events);
  }
  next.collected.push(pickupId);
  return success(next, events);
}
