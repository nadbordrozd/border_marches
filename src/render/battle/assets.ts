/**
 * Image loading for the battle screen and the choice of art per obstacle.
 */

import {
  FOREST_SETS,
  GROUND_TEXTURES,
  UNIT_ASSETS,
  assetByKey,
  assetUrl,
  mountainPieces,
} from "../../assets/manifest.ts";
import type {
  GroundTerrain,
  ImageAsset,
  UnitAsset,
} from "../../assets/manifest.ts";
import { CREATURES, isCreatureId } from "../../data/creatures.ts";
import type { Terrain } from "../../core/map/types.ts";
import { hexIndex } from "../../core/battle/index.ts";
import type { Hex } from "../../core/battle/index.ts";
import { hashInts } from "../../core/rng.ts";

const cache = new Map<string, Promise<HTMLImageElement>>();

function baseUrl(): string {
  return import.meta.env.BASE_URL;
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

const UNIT_BY_KEY = new Map(UNIT_ASSETS.map((u) => [u.key, u]));

/** The sprite of a creature id, or null for an unknown creature. */
export function unitAssetFor(creatureId: string): UnitAsset | null {
  if (!isCreatureId(creatureId)) return null;
  return UNIT_BY_KEY.get(CREATURES[creatureId].sprite) ?? null;
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
  const unitEntries = await Promise.all(
    [...new Set(creatureIds)].map(async (id) => {
      const asset = unitAssetFor(id);
      if (!asset) return null;
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
    const asset = unitAssetFor(id);
    if (asset) {
      portraits.set(id, assetUrl(assetByKey(asset.portrait), baseUrl()));
    }
  }
  const units = new Map<string, { img: HTMLImageElement; asset: UnitAsset }>();
  for (const e of unitEntries) if (e) units.set(e[0], e[1]);
  return {
    ground: await groundP,
    units,
    obstacles: new Map(obstacleEntries),
    portraits,
  };
}
