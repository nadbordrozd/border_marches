/**
 * The standalone battle view: `?view=battle&seed=N` fights a sample battle,
 * a Lost World army against a seeded mix of neutral stacks, on the seed's
 * terrain. Extra parameters set up hand-built states for screenshots:
 *
 *   steps=N        start after N AI actions (both sides), at the player's turn,
 *                  without the opening animation (steps=0: the opening state)
 *   hover=d0       point at stack d0 (or hover=col,row, or hover=melee|shoot:
 *                  the first enemy the active stack can attack); dir=W|NW|NE|E|SE|SW
 *                  nudges the pointer to that side of the hex (attack side)
 *   info=d1        open the info panel of stack d1
 *   auto=1         auto-resolve: AI on both sides, straight to the result
 *   speed=1|2|4    animation speed
 *   terrain=jungle battle ground
 */

import { GROUND_TERRAINS } from "../../assets/manifest.ts";
import {
  applyAction,
  chooseAiAction,
  createBattle,
  engineSetupFromGame,
  getStack,
  legalActions,
} from "../../core/battle/index.ts";
import type { BattleState, Hex } from "../../core/battle/index.ts";
import type {
  BattleSetup as GameBattleSetup,
  BattleStack as GameBattleStack,
} from "../../core/game/battle.ts";
import type { Terrain } from "../../core/map/types.ts";
import { createRng } from "../../core/rng.ts";
import { CREATURES } from "../../data/creatures.ts";
import type { NeutralCreatureId } from "../../data/types.ts";
import type { Route } from "../../router.ts";
import { HEX_SIZE, STAGE_W, hexToStage } from "../../render/battle/geometry.ts";
import { runBattleScreen } from "./screen.ts";
import type { Speed } from "./animate.ts";

const NEUTRALS: readonly NeutralCreatureId[] = [
  "goblin",
  "skeleton",
  "bomb-chucker",
  "wolf-rider",
  "orc-brute",
  "troll",
  "ogre",
  "orc-warboss",
];

/** The sample battle for a seed. */
export function sampleBattle(seed: number, terrain?: Terrain): GameBattleSetup {
  const rng = createRng(seed);
  const ground =
    terrain ?? (GROUND_TERRAINS[seed % GROUND_TERRAINS.length] as Terrain);
  const pool = [...NEUTRALS];
  const defenders: GameBattleStack[] = [];
  const n = rng.int(3, 4);
  for (let i = 0; i < n; i++) {
    const id = pool.splice(
      rng.int(0, pool.length - 1),
      1,
    )[0] as NeutralCreatureId;
    const budget = rng.int(700, 1500);
    defenders.push({
      creature: id,
      count: Math.max(1, Math.round(budget / CREATURES[id].fightValue)),
    });
  }
  return {
    seed,
    terrain: ground,
    attacker: {
      owner: 0,
      hero: { id: "debug-hero", attack: 2, defense: 1 },
      stacks: [
        { creature: "caveman", count: 24 },
        { creature: "spitter", count: 10 },
        { creature: "raptor", count: 7 },
        { creature: "shaman", count: 3 },
        { creature: "triceratops", count: 2 },
      ],
      defenseBonus: 0,
    },
    defender: { owner: null, hero: null, stacks: defenders, defenseBonus: 0 },
    battle: {
      kind: "monster",
      objectId: "debug-monster",
      heroId: "debug-hero",
    },
  };
}

const DIRS: Readonly<Record<string, readonly [number, number]>> = {
  E: [1, 0],
  W: [-1, 0],
  NE: [0.5, -0.87],
  NW: [-0.5, -0.87],
  SE: [0.5, 0.87],
  SW: [-0.5, 0.87],
};

function hoverHex(state: BattleState, spec: string): Hex | null {
  if (spec === "melee" || spec === "shoot") {
    const type = spec === "melee" ? "attack" : "shoot";
    const a = legalActions(state).find((x) => x.type === type);
    return a && "targetId" in a ? getStack(state, a.targetId).hex : null;
  }
  const m = /^(\d+),(\d+)$/.exec(spec);
  if (m) return { col: Number(m[1]), row: Number(m[2]) };
  try {
    return getStack(state, spec).hex;
  } catch {
    return null;
  }
}

function pointAt(
  canvas: HTMLCanvasElement,
  h: Hex,
  dir: string | null,
): {
  clientX: number;
  clientY: number;
} {
  const c = hexToStage(h);
  const d = dir ? DIRS[dir] : undefined;
  const sx = c.x + (d ? d[0] * HEX_SIZE * 0.6 : 0);
  const sy = c.y + (d ? d[1] * HEX_SIZE * 0.6 : 0);
  const rect = canvas.getBoundingClientRect();
  const k = rect.width / STAGE_W;
  return { clientX: rect.left + sx * k, clientY: rect.top + sy * k };
}

export function startBattleDebug(route: Route): void {
  const container = document.getElementById("ui") ?? document.body;
  const p = route.params;
  const seed = route.seed ?? 1;
  const terrainParam = p.get("terrain");
  const terrain = (GROUND_TERRAINS as readonly string[]).includes(
    terrainParam ?? "",
  )
    ? (terrainParam as Terrain)
    : undefined;
  const setup = sampleBattle(seed, terrain);
  let state: BattleState | undefined;
  const steps = Number(p.get("steps") ?? "0");
  if (p.has("steps")) {
    let s = createBattle(engineSetupFromGame(setup)).state;
    for (let i = 0; i < steps && s.winner === null; i++) {
      s = applyAction(s, chooseAiAction(s)).state;
    }
    // Then on to the player's next turn, so the screen opens waiting for input.
    while (s.winner === null && s.activeStackId?.startsWith("d")) {
      s = applyAction(s, chooseAiAction(s)).state;
    }
    state = s;
  }
  const speed = Number(p.get("speed") ?? "1");
  const hover = p.get("hover");
  const info = p.get("info");
  const run = (): void => {
    void runBattleScreen(container, setup, {
      autoResolve: p.get("auto") === "1",
      speed: ([1, 2, 4].includes(speed) ? speed : 1) as Speed,
      ...(state ? { startState: state } : {}),
      onReady: () => {
        // Scripted pointer for screenshots, once the opening has played.
        setTimeout(() => {
          const canvas = container.querySelector("canvas");
          if (!canvas) return;
          const cur = state ?? createBattle(engineSetupFromGame(setup)).state;
          if (hover) {
            const h = hoverHex(cur, hover);
            if (h) {
              canvas.dispatchEvent(
                new PointerEvent("pointermove", {
                  bubbles: true,
                  ...pointAt(canvas, h, p.get("dir")),
                }),
              );
            }
          }
          if (info) {
            const h = hoverHex(cur, info);
            if (h) {
              canvas.dispatchEvent(
                new MouseEvent("contextmenu", {
                  bubbles: true,
                  cancelable: true,
                  ...pointAt(canvas, h, null),
                }),
              );
            }
          }
        }, 700);
      },
    }).then(({ result, engine }) => {
      const out = document.createElement("pre");
      out.className = "bm-debug-result";
      out.style.cssText =
        "position:fixed;inset:0;margin:0;padding:24px;color:#f0e6c8;background:#1b1712;font:13px monospace;pointer-events:auto";
      out.textContent = `Battle over (seed ${seed}). Reload to fight again.\n\n${JSON.stringify({ result, engine }, null, 2)}`;
      container.append(out);
    });
  };
  run();
}
