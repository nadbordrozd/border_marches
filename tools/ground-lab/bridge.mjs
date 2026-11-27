// The game modules the ground lab reads (bead bzc.127), loaded through
// Vite's module runner (the render code imports without extensions).
export {
  GROUND_CALM,
  GROUND_RANK,
  borderLevel,
  calmTexture,
  cellField,
  coastAt,
  coastThreshold,
  groundRankAt,
  paintGround,
  waterDepthShare,
} from "../../src/render/map/ground.ts";
export { COAST } from "../../src/render/map/ground.ts";
export { canopyTint } from "../../src/render/map/canopy.ts";
export {
  ROAD_COLOURS,
  ROAD_PIXEL,
  roadPixelAt,
} from "../../src/render/map/road.ts";
export { planTerrain } from "../../src/render/map/terrain-plan.ts";
export { hash4 } from "../../src/render/map/hash.ts";
export {
  DOODAD_ASSETS,
  GROUND_TEXTURES,
  WATER_TILES,
} from "../../src/assets/manifest.ts";
export { TREE_ASSETS } from "../../src/assets/trees.ts";
export { createMap } from "../../src/core/map/types.ts";
