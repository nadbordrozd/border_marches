/**
 * Loads the adventure map's art once (cached across games) and names the
 * hero sprite the map view draws for the Chieftain.
 */
import { loadMapAssets } from "../render/map/assets.ts";
import type { MapAssets } from "../render/map/assets.ts";

/** HERO_ASSETS key of the Chieftain riding a raptor. */
export const HERO_SPRITE = "dinosaur-chieftain";

/** The unit key passed to MapView.setHeroes for the Chieftain. */
export function heroMapUnit(): string {
  return HERO_SPRITE;
}

let cached: Promise<MapAssets> | null = null;

export function loadGameMapAssets(): Promise<MapAssets> {
  cached ??= loadMapAssets(import.meta.env.BASE_URL);
  cached.catch(() => {
    cached = null;
  });
  return cached;
}
