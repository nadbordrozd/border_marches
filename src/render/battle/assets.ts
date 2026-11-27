/**
 * Image loading for the battle screen and the choice of art per obstacle.
 */

import { namedHeroPortrait, unitArt } from "../../assets/unit-art.ts";
import {
  FOREST_SETS,
  GROUND_TEXTURES,
  assetByKey,
  assetUrl,
  mountainPieces,
} from "../../assets/manifest.ts";
import type {
  GroundTerrain,
  ImageAsset,
  UnitAsset,
} from "../../assets/manifest.ts";
import type { Terrain } from "../../core/map/types.ts";
import { conditionKindIds, hexIndex } from "../../core/battle/index.ts";
import type { Hex } from "../../core/battle/index.ts";
import { hashInts } from "../../core/rng.ts";
import { MARKER_ICONS, iconFor } from "../../assets/icons.ts";

const cache = new Map<string, Promise<HTMLImageElement>>();

/** Ground icons by kind, once loaded (drawn on their hexes). */
const groundIcons = new Map<string, HTMLImageElement>();

/**
 * The 32 px icon of a ground kind (`iconFor("ground", kind)`), or null while
 * it loads; the first call starts the load. Unknown kinds get the ground
 * fallback icon.
 */
export function groundIcon(kind: string): HTMLImageElement | null {
  const have = groundIcons.get(kind);
  if (have) return have;
  if (typeof Image === "undefined") return null;
  void loadImage(iconFor("ground", kind).asset).then(
    (img) => groundIcons.set(kind, img),
    () => {},
  );
  return null;
}

/** Loads the icons of these ground kinds now. */
export async function preloadGroundIcons(
  kinds: readonly string[],
): Promise<void> {
  await Promise.all(
    kinds.map((kind) =>
      loadImage(iconFor("ground", kind).asset).then(
        (img) => void groundIcons.set(kind, img),
        () => {},
      ),
    ),
  );
}

/** The shell marker (FACTION_DWARVES 5, Lob) at 32 px, once loaded. */
let shellMarker: HTMLImageElement | null = null;
let shellMarkerAsked = false;

/**
 * The 32 px shell marker drawn on a shell's target hex, or null while it
 * loads; the first call starts the load.
 */
export function shellMarkerIcon(): HTMLImageElement | null {
  if (shellMarker !== null) return shellMarker;
  if (typeof Image === "undefined" || shellMarkerAsked) return null;
  shellMarkerAsked = true;
  void loadImage(MARKER_ICONS.shell[32]).then(
    (img) => void (shellMarker = img),
    () => {},
  );
  return null;
}

/** 16 px condition icons by kind, once loaded (badges under count chips). */
const conditionIcons = new Map<string, CanvasImageSource>();

/**
 * A condition's 16 px badge icon (`iconFor("condition", kind, 16)`), or
 * null while it loads; the first call starts the load. Every condition kind
 * has its own 16 px take; an unknown kind gets the condition fallback, which
 * the badge draws into its 16 px square.
 */
export function conditionIcon(kind: string): CanvasImageSource | null {
  const have = conditionIcons.get(kind);
  if (have) return have;
  if (typeof Image === "undefined") return null;
  void loadConditionIcon(kind);
  return null;
}

const conditionIconsAsked = new Set<string>();

async function loadConditionIcon(kind: string): Promise<void> {
  if (conditionIconsAsked.has(kind)) return;
  conditionIconsAsked.add(kind);
  const ref = iconFor("condition", kind, 16);
  try {
    const img = await loadImage(ref.asset);
    conditionIcons.set(kind, img);
  } catch {
    // Missing file: the badge plate is drawn empty.
  }
}

/** Loads the badge icons of these condition kinds now. */
export async function preloadConditionIcons(
  kinds: readonly string[],
): Promise<void> {
  await Promise.all(kinds.map(loadConditionIcon));
}

/** Every ground kind with an icon of its own. */
export const GROUND_ICON_KINDS = [
  "rock",
  "corpse",
  "bones",
  "wreck",
  "fire",
  "brambles",
  "mist",
  "sweets",
] as const;

function baseUrl(): string {
  return import.meta.env.BASE_URL;
}

/**
 * URL of the 48x48 portrait of the hero leading a side: the named hero's own
 * portrait, else its class's (bead bzc.29).
 */
export function heroPortraitUrl(hero: {
  readonly defId?: string;
  readonly heroClass?: string;
}): string {
  return assetUrl(
    namedHeroPortrait(hero.defId ?? "", hero.heroClass),
    baseUrl(),
  );
}

export function loadImage(
  asset: Pick<ImageAsset, "path">,
): Promise<HTMLImageElement> {
  const url = assetUrl(asset, baseUrl());
  let p = cache.get(url);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`cannot load ${url}`));
      img.src = url;
    });
    cache.set(url, p);
  }
  return p;
}

/** The battle ground for a map terrain (water never hosts a battle). */
export function battleGround(terrain: Terrain): GroundTerrain {
  return terrain === "water" ? "grass" : terrain;
}

/**
 * The sprite of a creature id. Kept for callers of the battle module: it is
 * {@link unitArt}, the one lookup for every screen (bead border_marches-9is),
 * whose table agrees with each creature's data sprite (tests/assets).
 */
export function unitAssetFor(creatureId: string): UnitAsset {
  return unitArt(creatureId);
}

/** Art for one obstacle hex: a small tree clump or a lone low rock. */
export interface ObstacleArt {
  readonly asset: ImageAsset;
  readonly kind: "trees" | "rock";
}

/**
 * Obstacle art by battle seed and hex (deterministic, rendering only): the
 * terrain's forest seam clumps (small single clumps) and the low single
 * mountain pieces, drawn 1:1. Two thirds trees, one third rocks.
 */
export function obstacleArt(
  terrain: GroundTerrain,
  seed: number,
  h: Hex,
): ObstacleArt {
  const roll = hashInts(seed, hexIndex(h), 0xb47);
  const seams = FOREST_SETS[terrain].seams;
  const rocks = mountainPieces("low-single");
  if (roll % 3 !== 0 && seams.length > 0) {
    const asset = seams[(roll >>> 4) % seams.length] as ImageAsset;
    return { asset, kind: "trees" };
  }
  const asset = rocks[(roll >>> 4) % rocks.length] as ImageAsset;
  return { asset, kind: "rock" };
}

export interface BattleArt {
  readonly ground: HTMLImageElement;
  readonly units: ReadonlyMap<
    string,
    { img: HTMLImageElement; asset: UnitAsset }
  >;
  readonly obstacles: ReadonlyMap<
    number,
    { img: HTMLImageElement; art: ObstacleArt }
  >;
  readonly portraits: ReadonlyMap<string, string>;
}

/** Loads everything one battle draws. */
export async function loadBattleArt(
  terrain: GroundTerrain,
  seed: number,
  creatureIds: readonly string[],
  obstacles: readonly Hex[],
): Promise<BattleArt> {
  const groundP = loadImage(GROUND_TEXTURES[terrain]);
  const iconsP = Promise.all([
    preloadGroundIcons(GROUND_ICON_KINDS),
    preloadConditionIcons(conditionKindIds()),
  ]);
  const unitEntries = await Promise.all(
    [...new Set(creatureIds)].map(async (id) => {
      const asset = unitArt(id);
      const img = await loadImage(asset);
      return [id, { img, asset }] as const;
    }),
  );
  const obstacleEntries = await Promise.all(
    obstacles.map(async (h) => {
      const art = obstacleArt(terrain, seed, h);
      const img = await loadImage(art.asset);
      return [hexIndex(h), { img, art }] as const;
    }),
  );
  const portraits = new Map<string, string>();
  for (const id of creatureIds) {
    const asset = unitArt(id);
    portraits.set(id, assetUrl(assetByKey(asset.portrait), baseUrl()));
  }
  const units = new Map<string, { img: HTMLImageElement; asset: UnitAsset }>();
  for (const [id, entry] of unitEntries) units.set(id, entry);
  await iconsP;
  return {
    ground: await groundP,
    units,
    obstacles: new Map(obstacleEntries),
    portraits,
  };
}
