/**
 * The kingdom overview's rows (bead border_marches-bzc.62, docs/design/
 * UI_V2.md UI2-12): the pure part, with no DOM, so the unit tier can check
 * it. src/ui/kingdom.ts draws the dialog from it.
 *
 * - Heroes as rows: portrait, level and class, movement and mana bars, the
 *   army as small portraits with counts.
 * - Towns as rows: crest, name, fort and hall, income, garrison portraits
 *   with counts, the creatures waiting in the dwellings, the BUILD badge.
 * - Income as one row: per resource "+N per day" and the by-source split
 *   for its hover card.
 */
import {
  dailyIncome,
  fortLevel,
  heroesOf,
  townIncome,
  townsOf,
} from "../core/game/index.ts";
import type { GameState, HeroState, TownState } from "../core/game/index.ts";
import type { ArmySlots } from "../core/game/types.ts";
import type { ResourceId } from "../core/map/types.ts";
import { getCreature, isCreatureId } from "../data/creatures.ts";
import { RESOURCE_IDS } from "../data/economy.ts";
import { buildingDef, findFaction, townTree } from "../data/factions.ts";
import { getHeroClass } from "../data/hero.ts";
import { playerColour } from "../data/players.ts";
import type { BuildingId, CreatureId, Resources } from "../data/types.ts";
import { buildableTowns, incomeBreakdown, minesOf } from "./hints.ts";
import { heroRow, townRow, type HeroRow } from "./side-panel.ts";
import { dwellingStrip } from "./town-dwellings.ts";

/** One stack as a small portrait with its count. */
export interface KingdomStack {
  readonly creature: CreatureId;
  readonly count: number;
  /** The creature's portrait asset key. */
  readonly portrait: string;
}

/** The filled slots of an army, in slot order. */
export function armyStacks(army: ArmySlots): KingdomStack[] {
  const out: KingdomStack[] = [];
  for (const s of army) {
    if (s === null || s.count <= 0 || !isCreatureId(s.creature)) continue;
    out.push({
      creature: s.creature,
      count: s.count,
      portrait: `portrait-${getCreature(s.creature).sprite}`,
    });
  }
  return out;
}

export interface KingdomHero extends HeroRow {
  readonly hero: HeroState;
  readonly level: number;
  /** "Level 9 Enchanter". */
  readonly title: string;
  readonly army: KingdomStack[];
  /** The hero selected on the map. */
  readonly selected: boolean;
}

/** The town's best hall: the building that pays its gold. */
export interface KingdomHall {
  readonly building: BuildingId;
  readonly name: string;
  readonly gold: number;
}

export interface KingdomTown {
  readonly id: string;
  readonly name: string;
  /** The crest's colour (the faction's flag). */
  readonly colour: string;
  readonly factionName: string;
  readonly faction: string;
  /** Fort level 0..3; the Warlord's Hold has its own walls instead. */
  readonly fort: number;
  readonly hold: boolean;
  readonly hall: KingdomHall | null;
  /** Every-day income (towns earn gold from the hall, more from specials). */
  readonly income: Resources;
  readonly garrison: KingdomStack[];
  /** Creatures waiting in the built dwellings, tier order, none at 0. */
  readonly available: KingdomStack[];
  /** Something can be built today. */
  readonly build: boolean;
  readonly builtToday: boolean;
  /** The town has a building tree at all (the Hold has none). */
  readonly hasTree: boolean;
}

/** One resource of the income row. */
export interface KingdomIncome {
  readonly resource: ResourceId;
  readonly perDay: number;
  readonly towns: number;
  readonly mines: number;
  /** Owned mines of this resource. */
  readonly mineCount: number;
  /** Heroes' skills, artifacts and specialties. */
  readonly heroes: number;
}

export interface KingdomRival {
  readonly id: number;
  readonly colour: string;
  readonly colourName: string;
  readonly factionName: string;
  readonly computer: boolean;
  readonly towns: number;
  readonly eliminated: boolean;
}

export interface KingdomModel {
  readonly heroes: KingdomHero[];
  readonly towns: KingdomTown[];
  readonly income: KingdomIncome[];
  readonly rivals: KingdomRival[];
}

export function kingdomHero(
  hero: HeroState,
  selectedId: string | null = null,
): KingdomHero {
  return {
    ...heroRow(hero),
    hero,
    level: hero.level,
    title: `Level ${hero.level} ${getHeroClass(hero.heroClass).name}`,
    army: armyStacks(hero.army),
    selected: hero.id === selectedId,
  };
}

/** The best hall of the town, or null (the Hold, a town with no hall). */
export function bestHall(town: TownState): KingdomHall | null {
  let best: KingdomHall | null = null;
  for (const b of town.buildings) {
    const def = buildingDef(town.faction, b);
    const gold = def?.hallIncome;
    if (def === undefined || gold === undefined) continue;
    if (best === null || gold > best.gold)
      best = { building: b, name: def.name, gold };
  }
  return best;
}

export function kingdomTown(
  state: GameState,
  town: TownState,
  buildable: boolean,
): KingdomTown {
  const row = townRow(state, town.id, buildable);
  return {
    id: town.id,
    name: town.name,
    colour: row?.colour ?? "#6b5a3e",
    factionName: town.isHold ? "Fortress" : (row?.factionName ?? "Town"),
    faction: town.faction,
    fort: fortLevel(town),
    hold: town.isHold,
    hall: bestHall(town),
    income: townIncome(town, state.day),
    garrison: armyStacks(town.garrison),
    available: dwellingStrip(town)
      .filter((d) => d.built && d.available > 0)
      .map((d) => ({
        creature: d.creature,
        count: d.available,
        portrait: `portrait-${getCreature(d.creature).sprite}`,
      })),
    build: buildable,
    builtToday: town.builtToday,
    hasTree: townTree(town.faction) !== undefined,
  };
}

export function kingdomIncome(
  state: GameState,
  player: number,
): KingdomIncome[] {
  const total = dailyIncome(state, player);
  const parts = incomeBreakdown(state, player, total);
  return RESOURCE_IDS.map((r) => ({
    resource: r,
    perDay: total[r],
    towns: parts.towns[r],
    mines: parts.mines[r],
    mineCount: minesOf(state, player, r),
    heroes: parts.heroes[r],
  }));
}

/** The whole overview of `player`'s kingdom. */
export function kingdomModel(
  state: GameState,
  player: number,
  selectedHeroId: string | null = null,
): KingdomModel {
  const buildable = new Set(buildableTowns(state, player));
  const heroes = heroesOf(state, player).map((h) =>
    kingdomHero(h, selectedHeroId),
  );
  const towns = townsOf(state, player).map((t) =>
    kingdomTown(state, t, buildable.has(t.id)),
  );
  const rivals = state.players
    .filter((p) => p.id !== player)
    .map((p) => ({
      id: p.id,
      colour: playerColour(p.id).hex,
      colourName: playerColour(p.id).name,
      factionName: findFaction(p.faction)?.name ?? "",
      computer: p.kind === "ai",
      towns: townsOf(state, p.id).length,
      eliminated: p.eliminated,
    }));
  return { heroes, towns, income: kingdomIncome(state, player), rivals };
}

/** "+2000 per day", "+0 per day". */
export function perDayText(n: number): string {
  return `+${n} per day`;
}
