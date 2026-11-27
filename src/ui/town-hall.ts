/**
 * The town's build grid as a Heroes hall (bead border_marches-bzc.60,
 * docs/design/UI_V2.md UI2-09): the pure part, with no DOM, so the unit
 * tier can check it.
 *
 * - {@link hallLayout} sorts a faction's buildings into the rows Hall,
 *   Fort, Economy, Magic and Specials and the dwellings' tier columns (each
 *   column a dwelling with its Drills under it, as Heroes III puts a
 *   dwelling's upgrade under it). Every building lands in exactly one
 *   place.
 * - {@link tileState} turns a building's {@link BuildStatus} into one of
 *   the four tile colours: green "can build today", amber "missing
 *   resources", red "missing requirements", gold "built".
 */
import { buildStatus, buildingShown, canAfford } from "../core/game/index.ts";
import type { BuildStatus, GameState } from "../core/game/index.ts";
import { getCreature } from "../data/creatures.ts";
import { buildingDef } from "../data/factions.ts";
import type { TownTreeDef } from "../data/factions.ts";
import type { BuildingDef, BuildingId, CreatureId } from "../data/types.ts";

export type HallGroupId =
  "hall" | "fort" | "economy" | "magic" | "specials" | "harbour";

export const HALL_GROUP_LABEL: Readonly<Record<HallGroupId, string>> = {
  hall: "Hall",
  fort: "Fort",
  economy: "Economy",
  magic: "Magic",
  specials: "Specials",
  harbour: "Harbour",
};

export const HALL_GROUP_ORDER: readonly HallGroupId[] = [
  "hall",
  "fort",
  "economy",
  "magic",
  "specials",
  "harbour",
];

export interface HallGroup {
  readonly id: HallGroupId;
  readonly label: string;
  readonly buildings: readonly BuildingId[];
}

/** One tier column: the dwelling first, then the Drills of its creature. */
export interface DwellingColumn {
  readonly tier: number;
  readonly creature: CreatureId;
  readonly buildings: readonly BuildingId[];
}

export interface HallLayout {
  /** The five rows in {@link HALL_GROUP_ORDER}, empty ones included. */
  readonly groups: readonly HallGroup[];
  /** The dwellings in tier order. */
  readonly dwellings: readonly DwellingColumn[];
}

/**
 * The row of a building that is not a dwelling or a Drill. The Keystone
 * building is a Special (the faction's Keystone power), although it also
 * pays gold; a town special that pays (Tithe Barn, Essence Still) is a
 * Special too. Anything unrecognised falls into Specials.
 */
export function hallGroupOf(def: BuildingDef): HallGroupId {
  if (def.harbour !== undefined) return "harbour";
  if (def.needsKeystone === true || def.special !== undefined)
    return "specials";
  if (def.hallIncome !== undefined) return "hall";
  if (def.fortLevel !== undefined) return "fort";
  if (def.guildLevel !== undefined) return "magic";
  if (
    def.marketplace === true ||
    def.tavern === true ||
    def.income !== undefined ||
    def.evenDayIncome !== undefined ||
    def.growthBonus === true
  )
    return "economy";
  return "specials";
}

/**
 * The town tree as this game's town screen shows it: the harbour
 * buildings (NAVAL 5.7) only on a naval map, so a dry map's hall looks
 * exactly as it always did.
 */
export function shownTree(
  state: GameState,
  faction: string,
  tree: Pick<TownTreeDef, "buildings" | "order">,
): Pick<TownTreeDef, "buildings" | "order"> {
  const order = tree.order.filter((id) =>
    buildingShown(state.map, faction, id),
  );
  return order.length === tree.order.length
    ? tree
    : { buildings: tree.buildings, order };
}

/** Sorts a town tree into the hall's rows and tier columns. */
export function hallLayout(
  tree: Pick<TownTreeDef, "buildings" | "order">,
): HallLayout {
  const rows = new Map<HallGroupId, BuildingId[]>(
    HALL_GROUP_ORDER.map((g) => [g, []]),
  );
  const columns: Array<{
    tier: number;
    creature: CreatureId;
    buildings: BuildingId[];
  }> = [];
  const drills: BuildingDef[] = [];
  for (const id of tree.order) {
    const def = tree.buildings[id];
    if (def === undefined) continue;
    if (def.dwelling !== undefined) {
      columns.push({
        tier: getCreature(def.dwelling).tier,
        creature: def.dwelling,
        buildings: [id],
      });
    } else if (def.drill !== undefined) {
      drills.push(def);
    } else {
      rows.get(hallGroupOf(def))?.push(id);
    }
  }
  // Stable sort: two dwellings of one tier keep their tree order.
  columns.sort((a, b) => a.tier - b.tier);
  for (const d of drills) {
    const column = columns.find((c) => c.creature === d.drill?.creature);
    if (column !== undefined) column.buildings.push(d.id);
    else rows.get("specials")?.push(d.id);
  }
  return {
    groups: HALL_GROUP_ORDER.map((id) => ({
      id,
      label: HALL_GROUP_LABEL[id],
      buildings: rows.get(id) ?? [],
    })),
    dwellings: columns,
  };
}

/** Every building of a layout, rows first, then the columns. */
export function hallBuildings(layout: HallLayout): BuildingId[] {
  return [
    ...layout.groups.flatMap((g) => g.buildings),
    ...layout.dwellings.flatMap((c) => c.buildings),
  ];
}

/**
 * The four tile colours, and grey for a harbour building of a town with
 * no dock (NAVAL 5.7: "landlocked").
 */
export type TileState =
  "can" | "resources" | "requirements" | "built" | "landlocked";

export const TILE_STATE_LABEL: Readonly<Record<TileState, string>> = {
  can: "Can build",
  resources: "Missing resources",
  requirements: "Missing requirements",
  built: "Built",
  landlocked: "Landlocked",
};

/**
 * The tile colour of a build status. "built-today" has no colour of its
 * own: the tile shows the lasting state (requirements first, then
 * resources), and a building that would otherwise be ready stays green;
 * the screen dims green tiles while the town has built today, and the
 * header says so once. A start-only building that is missing, a Keystone
 * building without the Keystone, someone else's town and another
 * faction's building all count as missing requirements.
 */
export function tileStateOf(
  status: BuildStatus,
  lasting: { requirementsMet: boolean; affordable: boolean },
): TileState {
  switch (status) {
    case "built":
      return "built";
    case "ok":
      return "can";
    case "resources":
      return "resources";
    case "landlocked":
      return "landlocked";
    case "built-today":
      if (!lasting.requirementsMet) return "requirements";
      if (!lasting.affordable) return "resources";
      return "can";
    case "requirements":
    case "keystone":
    case "start-only":
    case "not-owner":
    case "wrong-faction":
    case "not-naval":
      return "requirements";
  }
}

/** A building's tile state in a town, with the status it came from. */
export function tileState(
  state: GameState,
  townId: string,
  id: BuildingId,
): { state: TileState; status: BuildStatus } {
  const status = buildStatus(state, townId, id);
  const town = state.towns[townId];
  const def = town === undefined ? undefined : buildingDef(town.faction, id);
  const have = state.players.find((p) => p.id === town?.owner)?.resources;
  const requirementsMet =
    def !== undefined &&
    town !== undefined &&
    def.requires.every((r) => town.buildings.includes(r));
  const affordable =
    def !== undefined && have !== undefined && canAfford(have, def.cost);
  return {
    state: tileStateOf(status, { requirementsMet, affordable }),
    status,
  };
}

/** Why a building cannot be built now, in a few words (null when it can). */
export function blockedReason(status: BuildStatus): string | null {
  switch (status) {
    case "ok":
      return null;
    case "built":
      return "Built";
    case "start-only":
      return "Cannot be built during play";
    case "not-owner":
      return "Not your town";
    case "wrong-faction":
      return "Cannot be built here";
    case "built-today":
      return "One building a day: built today";
    case "requirements":
      return "Missing requirements";
    case "keystone":
      return "A hero must carry the Keystone into the town";
    case "resources":
      return "Missing resources";
    case "not-naval":
      return "There is no sea on this map";
    case "landlocked":
      return "Landlocked: no sea within reach of the town for a dock";
  }
}
