/**
 * Developer tools (bead bzc.93): cheats for testing a game by hand. Each is
 * a pure command like the rest of the rules (the input state is never
 * modified), so derived state follows: fog through `explored`, a new
 * dwelling's stock, Drill flags, guild spells for a hero in the town.
 * The UI offers them only in dev mode (src/ui/dev-mode.ts); no rule or AI
 * calls them.
 */
import { RESOURCE_IDS } from "../../data/economy.ts";
import { townTree } from "../../data/factions.ts";
import type { BuildingDef, Resources } from "../../data/types.ts";
import { learnInTown } from "../magic/adventure.ts";
import { maxMana } from "./effects.ts";
import { weeklyGrowth } from "./progression.ts";
import { addResources } from "./resources.ts";
import { heroInTownOf } from "./town.ts";
import {
  builtDefs,
  dwellingGrowth,
  checkPlaying,
  cloneState,
  fail,
  findHero,
  findPlayer,
  must,
  success,
  townsOf,
} from "./state.ts";
import type {
  CommandResult,
  GameEvent,
  GameState,
  TownState,
} from "./types.ts";

/** Gold the "add resources" cheat gives. */
export const DEV_GOLD = 10000;
/** Every other resource the "add resources" cheat gives. */
export const DEV_OTHER = 50;

/** The bundle the "add resources" cheat gives: +10000 gold, +50 of the rest. */
export function devResourceGift(): Resources {
  const out = {} as Resources;
  for (const r of RESOURCE_IDS) out[r] = r === "gold" ? DEV_GOLD : DEV_OTHER;
  return out;
}

/** Marks every map cell explored for the player (the whole map revealed). */
export function devRevealMap(state: GameState, player: number): CommandResult {
  const playing = checkPlaying(state);
  if (playing !== null) return playing;
  if (findPlayer(state, player) === undefined) {
    return fail("not-owner", `no player ${player}`);
  }
  const next = cloneState(state);
  const p = must(findPlayer(next, player), "player");
  p.explored = Array.from(
    { length: state.map.width * state.map.height },
    () => true,
  );
  return success(next);
}

/** Adds resources to the player's treasury (default devResourceGift()). */
export function devAddResources(
  state: GameState,
  player: number,
  gift: Resources = devResourceGift(),
): CommandResult {
  const playing = checkPlaying(state);
  if (playing !== null) return playing;
  if (findPlayer(state, player) === undefined) {
    return fail("not-owner", `no player ${player}`);
  }
  const next = cloneState(state);
  const p = must(findPlayer(next, player), "player");
  p.resources = addResources(p.resources, gift);
  return success(next);
}

/**
 * Builds every missing building of an owned town's tree in place, free and
 * ignoring requirements, the Keystone and the one-a-day rule (builtToday is
 * left as it was). Does what build() does for each: a new dwelling holds
 * one week's growth, a Drill sets its flag, and the owner's hero in the
 * town learns the guild's spells. Returns the ids built, in tree order.
 */
function buildAllInPlace(
  state: GameState,
  town: TownState,
  events: GameEvent[],
): string[] {
  const tree = townTree(town.faction);
  if (tree === undefined || town.isHold || town.owner === null) return [];
  const added: BuildingDef[] = [];
  for (const id of tree.order) {
    const def = tree.buildings[id];
    if (def === undefined || town.buildings.includes(id)) continue;
    added.push(def);
  }
  if (added.length === 0) return [];
  town.buildings = tree.order.filter(
    (id) => town.buildings.includes(id) || added.some((d) => d.id === id),
  );
  const stockade = builtDefs(town).some((d) => d.growthBonus === true);
  const player = must(findPlayer(state, town.owner), "player");
  for (const def of added) {
    if (
      def.dwelling !== undefined &&
      town.dwellings[def.dwelling] === undefined
    ) {
      const g = weeklyGrowth(dwellingGrowth(town, def.dwelling), stockade, 0);
      town.dwellings[def.dwelling] = {
        available: g.added,
        remainder: g.remainder,
      };
    }
    if (def.drill !== undefined) {
      const flag = `${def.drill.creature}:${def.drill.ability}`;
      const drills = player.drills ?? [];
      if (!drills.includes(flag)) {
        player.drills = [...drills, flag];
        events.push({
          type: "drill",
          player: player.id,
          creature: def.drill.creature,
          ability: def.drill.ability,
        });
      }
    }
  }
  if (added.some((d) => d.guildLevel !== undefined)) {
    const hero = heroInTownOf(state, town);
    if (hero !== undefined) learnInTown(state, hero, town.id, events);
  }
  return added.map((d) => d.id);
}

/** Builds every building of one owned town (see buildAllInPlace). */
export function devBuildAll(state: GameState, townId: string): CommandResult {
  const playing = checkPlaying(state);
  if (playing !== null) return playing;
  const town0 = state.towns[townId];
  if (town0 === undefined) return fail("unknown-town", `no town ${townId}`);
  if (town0.owner === null) return fail("not-owner", "the town is neutral");
  if (town0.isHold || townTree(town0.faction) === undefined) {
    return fail("cannot-build", "the town has no building tree");
  }
  const next = cloneState(state);
  const events: GameEvent[] = [];
  buildAllInPlace(next, must(next.towns[townId], "town"), events);
  return success(next, events);
}

/** Builds every building of every town the player owns. */
export function devBuildAllTowns(
  state: GameState,
  player: number,
): CommandResult {
  const playing = checkPlaying(state);
  if (playing !== null) return playing;
  if (findPlayer(state, player) === undefined) {
    return fail("not-owner", `no player ${player}`);
  }
  const next = cloneState(state);
  const events: GameEvent[] = [];
  for (const town of townsOf(next, player)) {
    buildAllInPlace(next, town, events);
  }
  return success(next, events);
}

/**
 * Refills a living hero: movement to at least today's maximum (maxMp) and
 * mana to at least maxMana (never lowers either).
 */
export function devRefillHero(state: GameState, heroId: string): CommandResult {
  const playing = checkPlaying(state);
  if (playing !== null) return playing;
  const hero0 = findHero(state, heroId);
  if (hero0 === undefined || !hero0.alive) {
    return fail("unknown-hero", `no hero ${heroId}`);
  }
  const next = cloneState(state);
  const hero = must(findHero(next, heroId), "hero");
  hero.mp = Math.max(hero.mp, hero.maxMp);
  hero.mana = Math.max(hero.mana, maxMana(hero));
  return success(next);
}
