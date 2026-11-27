/**
 * Ships and the sea on the adventure map (docs/design/NAVAL.md section 2,
 * bead bzc.149): which water is sea, where the ships are, who is afloat,
 * the sea movement maxima and the land/sea point conversions, ownership
 * changes, sinking and docks.
 *
 * Everything here is inert on a map that is not naval (`map.naval` absent
 * or false): no cell is sea, no hero is afloat, no ship exists.
 *
 * Movement across boardings and landings lives in pathfinding.ts (planning)
 * and adventure.ts (moveHeroAlong); battles apply shipAfterDefeat.
 */
import {
  DOCK_MAX_STEPS,
  BOAT_KIND,
  HARBOUR_LIGHTHOUSE,
  MAP_LIGHTHOUSE_MAX,
  MAP_LIGHTHOUSE_SEA_MP,
  MAP_LIGHTHOUSE_TYPE,
  SEAFARING_SKILL,
  SEA_MIN,
  SEA_MIN_SMALL,
  SEA_MOVE_BASE,
  SEA_MOVE_MAX,
  SMALL_MAP_SIDE,
  TOWN_LIGHTHOUSE_SEA_MP,
} from "../../data/naval.ts";
import { DIRECTIONS_8, inBounds, isPassable } from "../map/types.ts";
import type { GameMap } from "../map/types.ts";
import { heroEffects } from "./effects.ts";
import type {
  GameEvent,
  GameState,
  HeroState,
  Owner,
  ShipState,
} from "./types.ts";

// ------------------------------------------------------------ the sea

/** Whether the naval layer applies to this map at all. */
export function isNavalMap(map: GameMap): boolean {
  return map.naval === true;
}

/** The smallest water body that is a sea on this map (NAVAL 2.1). */
export function seaMinFor(map: GameMap): number {
  return Math.max(map.width, map.height) <= SMALL_MAP_SIDE
    ? SEA_MIN_SMALL
    : SEA_MIN;
}

const seaCache = new WeakMap<GameMap, Uint8Array>();

/**
 * Per cell 1 when it is sea: a water cell of a 4-connected body of at
 * least seaMinFor(map) cells, on a naval map (all 0 on other maps). The
 * map is never mutated, so the mask is cached per map.
 */
export function seaMask(map: GameMap): Uint8Array {
  const found = seaCache.get(map);
  if (found !== undefined) return found;
  const n = map.width * map.height;
  const mask = new Uint8Array(n);
  if (isNavalMap(map)) {
    const min = seaMinFor(map);
    const seen = new Uint8Array(n);
    const w = map.width;
    for (let start = 0; start < n; start++) {
      if (seen[start] === 1 || map.cells[start]?.terrain !== "water") continue;
      const body: number[] = [start];
      seen[start] = 1;
      for (let k = 0; k < body.length; k++) {
        const i = body[k] ?? 0;
        const x = i % w;
        const y = (i - x) / w;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= map.height) continue;
          const j = ny * w + nx;
          if (seen[j] === 1 || map.cells[j]?.terrain !== "water") continue;
          seen[j] = 1;
          body.push(j);
        }
      }
      if (body.length >= min) for (const i of body) mask[i] = 1;
    }
  }
  seaCache.set(map, mask);
  return mask;
}

/** Whether (x, y) is a sea cell (false off the map and on dry maps). */
export function isSeaCell(map: GameMap, x: number, y: number): boolean {
  return inBounds(map, x, y) && seaMask(map)[y * map.width + x] === 1;
}

/** A passable land cell with a sea cell among its 8 neighbours (2.1). */
export function isShoreCell(map: GameMap, x: number, y: number): boolean {
  if (!inBounds(map, x, y)) return false;
  const cell = map.cells[y * map.width + x];
  if (cell === undefined || !isPassable(cell)) return false;
  return DIRECTIONS_8.some(([dx, dy]) => isSeaCell(map, x + dx, y + dy));
}

// ------------------------------------------------------------ ships

/** The state's ships (none on a dry map or an older save). */
export function shipsOf(state: GameState): readonly ShipState[] {
  return state.ships ?? [];
}

export function findShip(
  state: GameState,
  shipId: string,
): ShipState | undefined {
  return state.ships?.find((s) => s.id === shipId);
}

/** The ship on cell (x, y), if any (at most one per cell). */
export function shipAt(
  state: GameState,
  x: number,
  y: number,
): ShipState | undefined {
  return state.ships?.find((s) => s.x === x && s.y === y);
}

/** The hero aboard a ship: alive and standing on its cell. */
export function heroAboard(
  state: GameState,
  ship: ShipState,
): HeroState | undefined {
  return state.heroes.find((h) => h.alive && h.x === ship.x && h.y === ship.y);
}

/** Whether nobody is aboard (a moored ship, NAVAL 2.1). */
export function isMoored(state: GameState, ship: ShipState): boolean {
  return heroAboard(state, ship) === undefined;
}

/** The ship the hero is aboard, if it is afloat. */
export function shipOfHero(
  state: GameState,
  hero: HeroState,
): ShipState | undefined {
  if (!hero.alive || state.ships === undefined) return undefined;
  return shipAt(state, hero.x, hero.y);
}

/** A hero aboard a ship stands on a sea cell and is afloat (2.1). */
export function isAfloat(state: GameState, hero: HeroState): boolean {
  return shipOfHero(state, hero) !== undefined;
}

/**
 * Adds a moored ship at (x, y), in place, and returns it. The cell must
 * be a free sea cell (callers check; a dock or a cell beside a hero).
 */
export function addShip(
  state: GameState,
  x: number,
  y: number,
  owner: Owner,
): ShipState {
  const made = (state.shipsMade ?? 0) + 1;
  state.shipsMade = made;
  const ship: ShipState = { id: `ship-${made}`, x, y, owner };
  state.ships = [...(state.ships ?? []), ship];
  return ship;
}

/** Changes a ship's owner in place; emits ship-captured when it changes. */
export function setShipOwner(
  ship: ShipState,
  owner: Owner,
  events: GameEvent[],
): void {
  if (ship.owner === owner) return;
  const from = ship.owner;
  ship.owner = owner;
  events.push({ type: "ship-captured", shipId: ship.id, owner, from });
}

/** Removes a ship from the map, in place, with a ship-sunk event. */
export function sinkShip(
  state: GameState,
  ship: ShipState,
  why: "defeat" | "retreat" | "scuttled",
  events: GameEvent[],
): void {
  state.ships = (state.ships ?? []).filter((s) => s.id !== ship.id);
  events.push({
    type: "ship-sunk",
    shipId: ship.id,
    x: ship.x,
    y: ship.y,
    why,
  });
}

/**
 * Scuttle's core (NAVAL 2.5 and 7.1), in place: an empty (moored) ship of
 * any owner sinks. False, and nothing changes, when the ship is unknown or
 * a hero is aboard. The spell's reach and mana are bead 6's.
 */
export function scuttleShip(
  state: GameState,
  shipId: string,
  events: GameEvent[],
): boolean {
  const ship = findShip(state, shipId);
  if (ship === undefined || !isMoored(state, ship)) return false;
  sinkShip(state, ship, "scuttled", events);
  return true;
}

/**
 * What happens to a beaten hero's ship (NAVAL 2.5 and 3.7), in place;
 * call it before the hero leaves the map. Beaten by a hero (`winner` a
 * player) without a retreat: the ship stays on its cell, moored, now the
 * winner's. Retreated, or beaten by neutrals (`winner` null): it sinks.
 * Nothing when the hero is ashore.
 */
export function shipAfterDefeat(
  state: GameState,
  loser: HeroState,
  winner: Owner,
  retreated: boolean,
  events: GameEvent[],
): void {
  const ship = shipOfHero(state, loser);
  if (ship === undefined) return;
  if (retreated) sinkShip(state, ship, "retreat", events);
  else if (winner === null) sinkShip(state, ship, "defeat", events);
  else setShipOwner(ship, winner, events);
}

/** An eliminated player's ships become neutral (2.5), in place. */
export function neutraliseShips(
  state: GameState,
  player: number,
  events: GameEvent[],
): void {
  for (const ship of state.ships ?? []) {
    if (ship.owner === player) setShipOwner(ship, null, events);
  }
}

/**
 * The ships a naval map starts with: one neutral moored ship per moored
 * boat object (kind "boat") on a sea cell, in map object order. None on a
 * dry map.
 */
export function shipsFromMap(map: GameMap): ShipState[] {
  if (!isNavalMap(map)) return [];
  const out: ShipState[] = [];
  for (const obj of map.objects) {
    if (obj.kind !== BOAT_KIND || !isSeaCell(map, obj.x, obj.y)) continue;
    if (out.some((s) => s.x === obj.x && s.y === obj.y)) continue;
    const owner = obj.data["owner"];
    out.push({
      id: `ship-${out.length + 1}`,
      x: obj.x,
      y: obj.y,
      owner: typeof owner === "number" ? owner : null,
    });
  }
  return out;
}

/**
 * The naval part of a new or loaded state, in place: a naval state always
 * has its ships list (an older or hand-made naval state gets the map's
 * moored boats); a dry state keeps none.
 */
export function settleNavalState(state: GameState): void {
  if (!isNavalMap(state.map)) return;
  if (state.ships === undefined) {
    state.ships = shipsFromMap(state.map);
    state.shipsMade = state.ships.length;
  }
  state.shipsMade ??= state.ships.length;
}

// ------------------------------------------------------------ movement

/** The hero's Seafaring rank (0..3, bead 6 adds the skill). */
export function seafaringRank(hero: HeroState): number {
  return hero.skills.find((s) => s.id === SEAFARING_SKILL)?.rank ?? 0;
}

export interface SeaMovementBreakdown {
  base: number;
  /** Seafaring, the Tricorne, the Locket (sea-movement-percent). */
  percent: number;
  /** sea-movement-flat effects plus the player's lighthouses. */
  flat: number;
  /** Of `flat`: the town Lighthouse (300, once) and map ones (200 each). */
  lighthouses: number;
  debt: number;
  total: number;
}

/** The player's lighthouse bonus to sea movement (NAVAL 2.4). */
export function lighthouseBonus(state: GameState, player: number): number {
  let bonus = 0;
  const town = Object.values(state.towns).some(
    (t) => t.owner === player && t.buildings.includes(HARBOUR_LIGHTHOUSE),
  );
  if (town) bonus += TOWN_LIGHTHOUSE_SEA_MP;
  let sites = 0;
  for (const obj of state.map.objects) {
    if (obj.data["type"] !== MAP_LIGHTHOUSE_TYPE) continue;
    if (state.sites[obj.id]?.owner === player) sites++;
  }
  bonus += Math.min(MAP_LIGHTHOUSE_MAX, sites) * MAP_LIGHTHOUSE_SEA_MP;
  return bonus;
}

/**
 * Sea movement points for a day (NAVAL 2.4): 1500 x (100 + sea
 * percentages) / 100 + sea flat bonuses (lighthouses included), at most
 * 3000, minus a Borrowed Day debt. The army's Speed and land bonuses do
 * not count. Fair Wind gains points now, not here (bead 6).
 */
export function seaMovementBreakdown(
  state: GameState,
  hero: HeroState,
): SeaMovementBreakdown {
  let percent = 0;
  let flat = 0;
  for (const { effect } of heroEffects(hero)) {
    if (effect.kind === "sea-movement-percent") percent += effect.percent;
    else if (effect.kind === "sea-movement-flat") flat += effect.amount;
  }
  const lighthouses = lighthouseBonus(state, hero.owner);
  flat += lighthouses;
  const mp = Math.min(
    SEA_MOVE_MAX,
    Math.floor((SEA_MOVE_BASE * (100 + percent)) / 100) + flat,
  );
  const total = Math.max(0, mp - hero.mpDebt);
  return {
    base: SEA_MOVE_BASE,
    percent,
    flat,
    lighthouses,
    debt: hero.mpDebt,
    total,
  };
}

export function seaMovementPoints(state: GameState, hero: HeroState): number {
  return seaMovementBreakdown(state, hero).total;
}

/** Today's sea maximum: fixed at the day start, else worked out now. */
export function seaMaxOf(state: GameState, hero: HeroState): number {
  return hero.seaMaxMp ?? seaMovementPoints(state, hero);
}

/** Today's maximum in the hero's current element. */
export function dailyMaxOf(state: GameState, hero: HeroState): number {
  return isAfloat(state, hero) ? seaMaxOf(state, hero) : hero.maxMp;
}

/** Land points left -> sea points on boarding: floor(left x sea / land). */
export function toSeaPoints(
  left: number,
  landMax: number,
  seaMax: number,
): number {
  if (landMax <= 0) return 0;
  return Math.floor((Math.max(0, left) * seaMax) / landMax);
}

/** Sea points left -> land points on a Seafaring landing. */
export function toLandPoints(
  left: number,
  landMax: number,
  seaMax: number,
): number {
  if (seaMax <= 0) return 0;
  return Math.floor((Math.max(0, left) * landMax) / seaMax);
}

/**
 * A hero's naval day start, in place, after startHeroDay: the sea maximum
 * is fixed for the day (`seaMax`, computed before the Borrowed Day debt
 * was cleared) and a hero afloat gets sea points instead of land points.
 */
export function navalDayStart(
  state: GameState,
  hero: HeroState,
  seaMax: number,
): void {
  hero.seaMaxMp = seaMax;
  if (isAfloat(state, hero)) hero.mp = seaMax;
}

/** Both maxima at once, for a newly hired or upgraded hero. */
export function fixDailyMaxima(state: GameState, hero: HeroState): void {
  if (!isNavalMap(state.map)) return;
  hero.seaMaxMp = seaMovementPoints(state, hero);
}

// ------------------------------------------------------------ docks

const dockCache = new WeakMap<GameMap, Map<string, number | null>>();

/**
 * A town's dock (NAVAL 2.2), computed from the map alone (so maps keep
 * their bytes and every game finds the same dock): the sea cell nearest
 * the town's entrance by walking distance over open land (8 directions),
 * at most DOCK_MAX_STEPS steps from it counting the step onto the water,
 * reached from a shore cell; ties go to the lowest cell index. Null: the
 * town is landlocked (or the map is not naval, or there is no such town).
 */
export function townDock(
  map: GameMap,
  townId: string,
): { x: number; y: number } | null {
  let cache = dockCache.get(map);
  if (cache === undefined) {
    cache = new Map();
    dockCache.set(map, cache);
  }
  let found = cache.get(townId);
  if (found === undefined) {
    found = computeDock(map, townId);
    cache.set(townId, found);
  }
  return found === null
    ? null
    : { x: found % map.width, y: Math.floor(found / map.width) };
}

function computeDock(map: GameMap, townId: string): number | null {
  if (!isNavalMap(map)) return null;
  const town = map.objects.find((o) => o.id === townId && o.kind === "town");
  if (town === undefined) return null;
  const w = map.width;
  const blocked = new Set<number>();
  for (const o of map.objects)
    for (const [x, y] of o.blocked) blocked.add(y * w + x);
  const sea = seaMask(map);
  const start = town.y * w + town.x;
  const depth = new Map<number, number>([[start, 0]]);
  let frontier = [start];
  let best: number | null = null;
  for (let d = 0; d < DOCK_MAX_STEPS && best === null; d++) {
    const next: number[] = [];
    const candidates: number[] = [];
    for (const i of frontier) {
      const x = i % w;
      const y = (i - x) / w;
      for (const [dx, dy] of DIRECTIONS_8) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inBounds(map, nx, ny)) continue;
        const j = ny * w + nx;
        if (depth.has(j)) continue;
        if (sea[j] === 1) {
          if (!blocked.has(j)) candidates.push(j);
          continue;
        }
        const cell = map.cells[j];
        if (cell === undefined || !isPassable(cell) || blocked.has(j)) continue;
        depth.set(j, d + 1);
        next.push(j);
      }
    }
    if (candidates.length > 0) best = Math.min(...candidates);
    frontier = next;
  }
  return best;
}
