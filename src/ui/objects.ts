/**
 * What the adventure map view draws for a game state: the map's objects
 * minus collected pickups and defeated monsters, with live monster counts
 * and town art levels. Pure (unit-tested).
 */
import type { GameState, TownState } from "../core/game/types.ts";
import type { MapObject } from "../core/map/types.ts";

/** Town art level from its halls (1 village hall, 2 town hall, 3 city hall). */
export function townLevel(town: TownState): 1 | 2 | 3 {
  if (town.isHold) return 3;
  if (town.buildings.includes("city-hall")) return 3;
  if (town.buildings.includes("town-hall")) return 2;
  return 1;
}

/** Map objects as the view should draw them now. */
export function displayObjects(state: GameState): MapObject[] {
  const collected = new Set(state.collected);
  const out: MapObject[] = [];
  for (const o of state.map.objects) {
    if (o.kind === "hero-start") continue;
    if (o.kind === "pickup" && collected.has(o.id)) continue;
    if (o.kind === "monster") {
      const m = state.monsters[o.id];
      if (m === undefined) continue;
      out.push({ ...o, data: { ...o.data, count: m.count } });
      continue;
    }
    if (o.kind === "town") {
      const t = state.towns[o.id];
      if (t !== undefined && !t.isHold) {
        out.push({ ...o, data: { ...o.data, level: townLevel(t) } });
        continue;
      }
    }
    out.push(o);
  }
  return out;
}

/** A key that changes whenever {@link displayObjects} would draw differently. */
export function objectsSignature(objects: readonly MapObject[]): string {
  return objects
    .map(
      (o) =>
        `${o.id}:${String(o.data["count"] ?? "")}:${String(o.data["level"] ?? "")}`,
    )
    .join("|");
}
