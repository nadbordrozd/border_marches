/**
 * Loads the images the adventure map draws (from src/assets/manifest.ts)
 * and reads the pixels of the rasters the ground painter samples (the
 * textured grounds and the water tiles).
 */
import {
  GROUND_TERRAINS,
  GROUND_TEXTURES,
  HERO_ASSETS,
  MOUNTAIN_PIECES,
  MASSIF_PIECES,
  TOWN_3X2_ASSETS,
  DOODAD_ASSETS,
  OBJECT_ASSETS,
  TOWN_ASSETS,
  UNIT_ASSETS,
  WATER_TILES,
  assetUrl,
} from "../../assets/manifest";
import type { GroundTerrain, ImageAsset } from "../../assets/manifest";
import { TREE_ASSETS } from "../../assets/trees";
import { GROUND_CALM, blockMask, calmTexture } from "./ground";
import type { GroundSources, PixelImage } from "./ground";

export interface MapAssets {
  /** Every loaded image by manifest key. */
  readonly images: ReadonlyMap<string, CanvasImageSource>;
  readonly ground: GroundSources;
}

export type Surface = HTMLCanvasElement | OffscreenCanvas;

/** A 2D surface of the given size (an OffscreenCanvas where available). */
export function createSurface(width: number, height: number): Surface {
  if (typeof OffscreenCanvas !== "undefined")
    return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function context2d(
  surface: Surface,
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const context = surface.getContext("2d", { willReadFrequently: false }) as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (context === null) throw new Error("map renderer: no 2D context");
  return context;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`map renderer: cannot load ${url}`));
    image.src = url;
  });
}

function readPixels(
  image: CanvasImageSource,
  width: number,
  height: number,
): PixelImage {
  const surface = createSurface(width, height);
  const context = context2d(surface);
  context.drawImage(image, 0, 0);
  return {
    width,
    height,
    data: context.getImageData(0, 0, width, height).data,
  };
}

/** The manifest entries the map draws. */
export function mapAssetList(): ImageAsset[] {
  return [
    ...Object.values(GROUND_TEXTURES),
    ...WATER_TILES,
    ...MOUNTAIN_PIECES,
    ...MASSIF_PIECES,
    ...TOWN_3X2_ASSETS,
    ...DOODAD_ASSETS,
    ...TREE_ASSETS,
    ...TOWN_ASSETS,
    ...UNIT_ASSETS,
    ...HERO_ASSETS,
    ...OBJECT_ASSETS,
  ];
}

/** Loads everything the map draws; `base` is Vite's BASE_URL. */
export async function loadMapAssets(base = "/"): Promise<MapAssets> {
  const list = mapAssetList();
  const loaded = await Promise.all(
    list.map(
      async (asset) =>
        [asset.key, await loadImage(assetUrl(asset, base))] as const,
    ),
  );
  const images = new Map<string, CanvasImageSource>(loaded);
  const get = (asset: ImageAsset): CanvasImageSource => {
    const image = images.get(asset.key);
    if (image === undefined)
      throw new Error(`map renderer: missing ${asset.key}`);
    return image;
  };
  const textures = Object.fromEntries(
    GROUND_TERRAINS.map((terrain) => {
      const asset = GROUND_TEXTURES[terrain];
      const pixels = readPixels(get(asset), asset.w, asset.h);
      // Calmer textures where the source is too busy (bead xaj.27).
      const calm = GROUND_CALM[terrain];
      return [terrain, calm === undefined ? pixels : calmTexture(pixels, calm)];
    }),
  ) as Record<GroundTerrain, PixelImage>;
  const water = (depth: "shallow" | "deep"): PixelImage[] =>
    WATER_TILES.filter((tile) => tile.depth === depth).map((tile) =>
      readPixels(get(tile), tile.w, tile.h),
    );
  // The massif pieces' silhouettes for the scree (bead xaj.21).
  const pieceMasks = new Map(
    MASSIF_PIECES.map((asset) => [
      asset.key,
      blockMask(readPixels(get(asset), asset.w, asset.h)),
    ]),
  );
  return {
    images,
    ground: {
      textures,
      water: { shallow: water("shallow"), deep: water("deep") },
      pieceMasks,
    },
  };
}
