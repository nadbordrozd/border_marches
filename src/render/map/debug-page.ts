/**
 * The map renderer's debug page: ?view=map
 *
 *   seed=N        render generateMap(N) (src/core/map/generate.ts)
 *   size=S|M|L    generator map size (default M)
 *   map=big       the fixture tiled to 48 x 48 (benchmarks)
 *   map=ranges    a test map of mountain ranges of many shapes
 *   fog=0|1       fog of war off / on (explored: round the hero and town)
 *   zoom=Z        0.75 (default), 1, 1.5 or 2
 *   cx=X&cy=Y     centre on a cell
 *   hud=0         hide the text overlay
 *   path=0        hide the path preview
 *   bench=N       render N frames after load and report the mean time
 *
 * Without seed or map, the page shows tests/fixtures/small-map.ts.
 */
import type { GameMap, MapCell, MapObject } from "../../core/map/types";
import { cellAt, isPassable, objectBlockedSet } from "../../core/map/types";
import type { Route } from "../../router";
import { buildSmallMap } from "../../../tests/fixtures/small-map";
import { generateMap } from "../../core/map/generate";
import { loadMapAssets } from "./assets";
import { DEFAULT_ZOOM, createMapView } from "./map-view";
import type { MapView, PathStep } from "./map-view";

declare global {
  interface Window {
    __mapView?: MapView;
    __mapReady?: boolean;
    __mapBench?: { frames: number; meanMs: number; maxMs: number };
  }
}

/** The fixture tiled `across` x `down` times and cropped to w x h. */
export function tiledFixture(w: number, h: number): GameMap {
  const base = buildSmallMap();
  const cells = [];
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      const from =
        base.cells[(y % base.height) * base.width + (x % base.width)];
      if (from !== undefined) cells.push({ ...from });
    }
  const objects: MapObject[] = [];
  for (let ty = 0; ty * base.height < h; ty += 1)
    for (let tx = 0; tx * base.width < w; tx += 1)
      for (const obj of base.objects) {
        const dx = tx * base.width;
        const dy = ty * base.height;
        const moved: MapObject = {
          ...obj,
          id: `${obj.id}@${tx},${ty}`,
          x: obj.x + dx,
          y: obj.y + dy,
          blocked: obj.blocked.map(([bx, by]) => [bx + dx, by + dy]),
        };
        const inside = [[moved.x, moved.y], ...moved.blocked].every(
          ([x = 0, y = 0]) => x < w && y < h,
        );
        if (inside) objects.push(moved);
      }
  return { width: w, height: h, seed: base.seed, cells, objects };
}

// prettier-ignore
const RANGES_GROUND = [
  "gggggggggggggggjjjjjjjjj",
  "gggggggggggggggjjjjjjjjj",
  "ggggggggggggggggjjjjjjjj",
  "gggggggggggggggggjjjjjjj",
  "gggggggggggggggggjjjjjjj",
  "gggggggggggggggggjjjjjjj",
  "ggggggggsssssssggjjjjjjj",
  "gggggggssssssssssjjjjjjj",
  "ggggggsssssssssssbbbbbbb",
  "gggggssssssssssssbbbbbbb",
  "~~~gsssssssssssbbbbbbbbb",
  "~~~~ssssssssssbbbbbbbbbb",
  "~==~~sssssssswwwwwbbbbbb",
  "~===~ssssssswwwwwwwbbbbb",
  "~==~~ssssssswwwwwwwwbbbb",
  "~~~~ssssssswwwwwwwwwwbbb",
  "~~~ssssssssswwwwwwwwwwbb",
  "~~ssssssssswwwwwwwwwwwww",
];

// M mountain, F forest, # road.
// prettier-ignore
const RANGES_OVERLAY = [
  "........................",
  ".MMMMMMMM.......FFF.....",
  "..................FFFF..",
  ".M.......MMM.....FFFFF..",
  ".M......MMMMM...MM..FF..",
  ".M.....MMMMMMM...MM.....",
  ".M......MMMMM.....MM....",
  "...........MM......MM...",
  "..FF...............MMM..",
  ".FFFF....##########.....",
  "....FF...#..............",
  ".........#....MMM.......",
  "....M....#...MM.M...FF..",
  "...MM....#..MM..MM..FFF.",
  "..MMM....#.........FFF..",
  "..........MMMMMM........",
  "....FFF....MMMM.........",
  "...FFFFF..........MMMM..",
];

/** A test map of mountain ranges of many shapes (evidence for the massifs). */
export function rangesMap(): GameMap {
  const codes: Record<string, MapCell["terrain"]> = {
    g: "grass",
    j: "jungle",
    s: "steppe",
    b: "badlands",
    w: "wasteland",
    "~": "water",
    "=": "water",
  };
  const cells: MapCell[] = [];
  RANGES_GROUND.forEach((row, y) =>
    [...row].forEach((g, x) => {
      const o = RANGES_OVERLAY[y]?.charAt(x) ?? ".";
      const terrain = codes[g] ?? "grass";
      const cell: MapCell = {
        terrain,
        obstacle:
          terrain === "water"
            ? "none"
            : o === "M"
              ? "mountain"
              : o === "F"
                ? "forest"
                : "none",
        road: o === "#" && terrain !== "water",
      };
      if (g === "=") cell.deep = true;
      cells.push(cell);
    }),
  );
  return {
    width: 24,
    height: 18,
    seed: 0,
    cells,
    objects: [
      {
        id: "hero-start-0",
        kind: "hero-start",
        x: 9,
        y: 8,
        footprint: { w: 1, h: 1 },
        blocked: [],
        data: { player: 0 },
      },
      {
        id: "town-1",
        kind: "town",
        x: 6,
        y: 11,
        footprint: { w: 2, h: 2 },
        blocked: [
          [5, 10],
          [6, 10],
          [5, 11],
        ],
        data: { faction: "warlord", owner: null },
      },
      {
        id: "monster-1",
        kind: "monster",
        x: 15,
        y: 9,
        footprint: { w: 1, h: 1 },
        blocked: [],
        data: { creature: "troll", count: 4 },
      },
    ],
  };
}

/** Explored cells: discs round the hero starts and the towns. */
export function debugExplored(map: GameMap, radius = 5.5): Uint8Array {
  const mask = new Uint8Array(map.width * map.height);
  const centres = map.objects
    .filter(
      (o) =>
        o.kind === "hero-start" ||
        (o.kind === "town" && o.data["owner"] !== null),
    )
    .map((o) => [o.x, o.y] as const);
  for (let y = 0; y < map.height; y += 1)
    for (let x = 0; x < map.width; x += 1)
      if (centres.some(([cx, cy]) => Math.hypot(x - cx, y - cy) <= radius))
        mask[y * map.width + x] = 1;
  return mask;
}

/** A shortest 8-way path over passable cells (BFS), without the start. */
export function debugPath(
  map: GameMap,
  from: readonly [number, number],
  to: readonly [number, number],
  reach: number,
): PathStep[] {
  const blocked = objectBlockedSet(map);
  const occupied = new Set(
    map.objects
      .filter((o) => o.kind !== "hero-start")
      .map((o) => o.y * map.width + o.x),
  );
  const goal = to[1] * map.width + to[0];
  const start = from[1] * map.width + from[0];
  const previous = new Map<number, number>([[start, -1]]);
  const queue = [start];
  while (queue.length > 0) {
    const at = queue.shift() ?? 0;
    if (at === goal) break;
    const x = at % map.width;
    const y = Math.floor(at / map.width);
    for (let dy = -1; dy <= 1; dy += 1)
      for (let dx = -1; dx <= 1; dx += 1) {
        const cell = cellAt(map, x + dx, y + dy);
        const next = (y + dy) * map.width + x + dx;
        if (cell === undefined || previous.has(next) || !isPassable(cell))
          continue;
        if (blocked.has(next) || (occupied.has(next) && next !== goal))
          continue;
        previous.set(next, at);
        queue.push(next);
      }
  }
  if (!previous.has(goal)) return [];
  const steps: number[] = [];
  for (let at = goal; at !== start && at >= 0; at = previous.get(at) ?? -1)
    steps.unshift(at);
  return steps.map((at, i) => ({
    x: at % map.width,
    y: Math.floor(at / map.width),
    reachable: i < reach,
  }));
}

export async function startMapDebug(
  canvas: HTMLCanvasElement,
  route: Route,
): Promise<void> {
  const params = route.params;
  const assets = await loadMapAssets(import.meta.env.BASE_URL);
  const which = params.get("map");
  const size = params.get("size");
  const map =
    which === "big"
      ? tiledFixture(48, 48)
      : which === "ranges"
        ? rangesMap()
        : route.seed !== null
          ? generateMap(route.seed, {
              size: size === "S" || size === "L" ? size : "M",
            })
          : buildSmallMap();
  const view = createMapView(canvas, assets);
  view.setMap(map);
  const zoom = Number(params.get("zoom") ?? DEFAULT_ZOOM);
  view.setZoom(Number.isFinite(zoom) ? zoom : DEFAULT_ZOOM);
  const hero = map.objects.find((o) => o.kind === "hero-start");
  if (hero !== undefined)
    view.setHeroes([
      { id: "hero-0", x: hero.x, y: hero.y, unit: "dinosaur-chieftain" },
    ]);
  if (params.get("fog") === "1") view.setExplored(debugExplored(map));
  const target = map.objects.find((o) => o.kind === "monster");
  if (params.get("path") !== "0" && hero !== undefined && target !== undefined)
    view.setPathPreview(
      debugPath(map, [hero.x, hero.y], [target.x, target.y], 7),
    );
  const cx = Number(params.get("cx"));
  const cy = Number(params.get("cy"));
  if (
    params.has("cx") &&
    params.has("cy") &&
    Number.isFinite(cx) &&
    Number.isFinite(cy)
  )
    view.centerOn(cx, cy);
  else if (params.get("fog") === "1" && hero !== undefined)
    view.centerOn(hero.x, hero.y);

  const hud = document.getElementById("ui");
  const showHud = params.get("hud") !== "0" && hud !== null;
  const label = document.createElement("div");
  label.style.cssText =
    "position:absolute;left:8px;bottom:8px;padding:4px 8px;font:12px monospace;" +
    "color:#f4e6c0;background:rgba(12,10,8,0.7);border-radius:4px;white-space:pre";
  if (showHud) hud.appendChild(label);
  const describe = (extra = ""): void => {
    const s = view.stats();
    label.textContent =
      `map ${map.width}x${map.height} seed ${map.seed} ${route.seed !== null ? "(generated)" : "(fixture)"} zoom ${view.getZoom()}  ` +
      `frame ${s.lastFrameMs.toFixed(2)} ms, ${s.drawnEntries} sprites, ` +
      `${s.chunksBuilt} chunks in ${s.chunkBuildMs.toFixed(0)} ms${extra}`;
  };
  let hovered = "";
  view.onHover((cell) => {
    hovered = cell === null ? "" : `  cell ${cell.x},${cell.y}`;
    describe(hovered);
  });
  view.onClick((cell) => view.setSelected(cell));

  view.render();
  describe();
  const benchFrames = Number(params.get("bench") ?? 0);
  if (benchFrames > 0) {
    view.prebuild();
    let total = 0;
    let max = 0;
    for (let i = 0; i < benchFrames; i += 1) {
      view.render();
      const ms = view.stats().lastFrameMs;
      total += ms;
      max = Math.max(max, ms);
    }
    window.__mapBench = {
      frames: benchFrames,
      meanMs: total / benchFrames,
      maxMs: max,
    };
    describe(
      `  bench ${benchFrames} frames mean ${(total / benchFrames).toFixed(2)} ms max ${max.toFixed(2)} ms`,
    );
    document.title = `bench ${JSON.stringify(window.__mapBench)} ${JSON.stringify(view.stats())}`;
  }
  window.__mapView = view;
  window.__mapReady = true;
}
