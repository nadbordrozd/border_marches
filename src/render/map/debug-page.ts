/**
 * The map renderer's debug page: ?view=map
 *
 *   seed=N        render generateMap(N) (src/core/map/generate.ts);
 *                 without seed, named or map, seed 1
 *   named=ID      render a named map (src/core/map/named.ts)
 *   size=S|M|L    generator map size (default M)
 *   players=2..4  generator player starts (default per size)
 *   map=ranges    a test map of mountain ranges of many shapes
 *   map=decorations  every decoration and prop on each ground (bead bzc.48)
 *   fog=0|1       fog of war off / on (explored: round the hero and town)
 *   zoom=Z        0.75 (default), 1, 1.5 or 2
 *   cx=X&cy=Y     centre on a cell
 *   hud=0         hide the text overlay
 *   path=0        hide the path preview
 *   route=X,Y,TX,TY  put the hero on (X, Y) and preview the game's own
 *                 cheapest path to (TX, TY) (road costs, as a hero walks)
 *   motion=0      hold the animated terrain still (bead bzc.83; default on)
 *   bench=N       render N frames after load and report the mean time
 *
 * The page builds every map from the game's own code: nothing from tests/
 * (bead xaj.18 removed the test-fixture fallback; size=L is the big map
 * for benchmarks).
 */
import { CELL_PX } from "../../assets/manifest";
import type { GameMap, MapCell } from "../../core/map/types";
import { cellAt, isPassable, objectBlockedSet } from "../../core/map/types";
import type { Route } from "../../router";
import { generateMap } from "../../core/map/generate";
import { findPathInContext } from "../../core/game/pathfinding";
import { buildNamedMap } from "../../core/map/named";
import { playableFactions } from "../../data/factions";
import { loadMapAssets } from "./assets";
import { decorationShowcase } from "./decoration-showcase";
import { DEFAULT_ZOOM, createMapView } from "./map-view";
import type { MapView, PathStep } from "./map-view";

declare global {
  interface Window {
    __mapView?: MapView;
    /** The map shown (its objects, for scripted setObjects checks). */
    __mapData?: GameMap;
    __mapReady?: boolean;
    /** The whole map's size in world px (tools/map-poster.mjs). */
    __mapPixels?: { width: number; height: number };
    __mapBench?: { frames: number; meanMs: number; maxMs: number };
  }
}

/** The seed shown when the address names no map. */
export const DEFAULT_DEBUG_SEED = 1;

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

/** A test map of mountain ranges of many shapes (evidence for the peaks). */
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

/**
 * The game's cheapest path (src/core/game/pathfinding.ts, road costs and
 * all) for a hero with no native terrain and no fog, monsters ignored.
 */
export function debugRoute(
  map: GameMap,
  from: readonly [number, number],
  to: readonly [number, number],
  reach: number,
): PathStep[] {
  const steps = findPathInContext(
    {
      map,
      nativeTerrain: null,
      objectBlocked: objectBlockedSet(map),
      monsterAt: new Map(),
      enemyHeroAt: new Map(),
      friendAt: new Set(),
      guards: new Map(),
      stops: new Set(),
      buildings: new Map(),
      pickupAt: new Map(),
      explored: null,
      forestCost: null,
    },
    from[0],
    from[1],
    to[0],
    to[1],
  );
  return (steps ?? []).map((s, i) => ({
    x: s.x,
    y: s.y,
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
  const players = Number(params.get("players"));
  const named = params.get("named");
  const seed = route.seed ?? DEFAULT_DEBUG_SEED;
  const showcase = which === "decorations" ? decorationShowcase() : null;
  const map =
    named !== null
      ? buildNamedMap(named)
      : showcase !== null
        ? showcase.map
        : which === "ranges"
          ? rangesMap()
          : generateMap(seed, {
              size: size === "S" || size === "L" ? size : "M",
              ...(players === 2 || players === 3 || players === 4
                ? { players }
                : {}),
            });
  const source =
    named !== null
      ? `named ${named}`
      : showcase !== null
        ? "decorations showcase"
        : which === "ranges"
          ? "ranges test map"
          : `seed ${seed}${route.seed === null ? " (default)" : ""}`;
  // A generated map's start towns are drawn in the faction a new game
  // would seat there (the playable factions in seat order, as in setup); a
  // named map already carries its recommended factions.
  if (named === null) {
    const playable = playableFactions().map((f) => f.id);
    for (const o of map.objects) {
      const seat = o.data["start"];
      if (o.kind !== "town" || typeof seat !== "number") continue;
      const faction = playable[seat % Math.max(1, playable.length)];
      if (faction !== undefined) o.data = { ...o.data, faction };
    }
  }
  const view = createMapView(canvas, assets);
  view.setMap(map);
  view.setTerrainMotion(params.get("motion") !== "0");
  if (showcase !== null) view.setDecorations(showcase.decorations);
  const zoom = Number(params.get("zoom") ?? DEFAULT_ZOOM);
  view.setZoom(Number.isFinite(zoom) ? zoom : DEFAULT_ZOOM);
  const hero = map.objects.find((o) => o.kind === "hero-start");
  // A named map shows every start's hero; a generated map player 0's.
  const starts = map.objects.filter(
    (o) => o.kind === "hero-start" && (named !== null || o === hero),
  );
  const leg = (params.get("route") ?? "").split(",").map(Number);
  const [fromX = 0, fromY = 0, toX = 0, toY = 0] = leg;
  const routed =
    leg.length === 4 && leg.every((v) => Number.isInteger(v) && v >= 0);
  view.setHeroes(
    routed
      ? [{ id: "hero-0", x: fromX, y: fromY, unit: "dinosaur-chieftain" }]
      : starts.map((o, i) => ({
          id: `hero-${i}`,
          x: o.x,
          y: o.y,
          unit: "dinosaur-chieftain",
        })),
  );
  if (params.get("fog") === "1") view.setExplored(debugExplored(map));
  const target = map.objects.find((o) => o.kind === "monster");
  if (routed)
    view.setPathPreview(debugRoute(map, [fromX, fromY], [toX, toY], 12), {
      x: fromX,
      y: fromY,
    });
  else if (
    params.get("path") !== "0" &&
    hero !== undefined &&
    target !== undefined
  )
    view.setPathPreview(
      debugPath(map, [hero.x, hero.y], [target.x, target.y], 7),
      { x: hero.x, y: hero.y },
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
      `map ${map.width}x${map.height} ${source} zoom ${view.getZoom()}  ` +
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
  window.__mapData = map;
  window.__mapPixels = {
    width: map.width * CELL_PX,
    height: map.height * CELL_PX,
  };
  window.__mapReady = true;
}
