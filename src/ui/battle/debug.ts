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
 *   grammar=1      decorate the start with conditions, a link, ground and a
 *                  scheduled event (battle grammar UI check, RULES_V2 1)
 *   magic=1        the hero brings a spellbook (pages of every school,
 *                  scrolls, 60 mana) and Shamans cast Mend and Thunderclap
 *   book=1         open the spellbook once the field is on screen
 *   items=1        the hero wears every item-act artifact (Tinderbox, Cider
 *                  Flask, The Bellhop's Cap, A Pinch of Sand) and its
 *                  strongest stack starts Ripening 20 (the Flask's target)
 *   auto=1         auto-resolve: AI on both sides, straight to the result
 *   speed=1|2|4    animation speed
 *   terrain=jungle battle ground
 *   scenario=realm|horde|restless  a hand-built v0.2 faction battle with a
 *                  hero's Command and item act (scenarios.ts)
 *   active=a2      hand the turn to that stack
 *   do=steps       a screenshot script, e.g. do=key:1;hover:d0 (runScript)
 *   armies=humans,undead   a faction battle with heroes (debug-armies.ts);
 *                  lean=magic gives both heroes the magic classes;
 *                  vanguard=1|2|3 opens with the deployment phase
 *   naval=deck|open-water|pier-deck|pier-water|beach   a naval sample
 *                  battle on that layout (debug-naval.ts, NAVAL.md 3.2)
 */

import { GROUND_TERRAINS } from "../../assets/manifest.ts";
import {
  applyAction,
  chooseAiAction,
  createBattle,
  engineSetupFromGame,
  getStack,
  hasConditionKind,
  legalActions,
  registerConditionKind,
  registerEffect,
  registerGroundKind,
} from "../../core/battle/index.ts";
import { Draft, Resolver } from "../../core/battle/resolve.ts";
import type {
  BattleSetup as EngineBattleSetup,
  BattleState,
  Hex,
  MagicSetup,
} from "../../core/battle/index.ts";
import { casterOf, registerCreatureCaster } from "../../core/battle/index.ts";
import { registerSpells } from "../../core/magic/index.ts";
import { ITEM_ACT_IDS, startRuleRefs } from "../../core/battle/hero-effects.ts";

const CREATURE_STUB = {
  id: "",
  tier: 1,
  hp: 1,
  attack: 0,
  defense: 0,
  damage: 1,
  speed: 1,
  abilities: [],
};
import type {
  BattleSetup as GameBattleSetup,
  BattleStack as GameBattleStack,
} from "../../core/game/battle.ts";
import type { Terrain } from "../../core/map/types.ts";
import { createRng } from "../../core/rng.ts";
import { CREATURES } from "../../data/creatures.ts";
import type { NeutralCreatureId } from "../../data/types.ts";
import type { Route } from "../../router.ts";
import {
  HEX_SIZE,
  STAGE_W,
  hexToStage,
  stageToView,
} from "../../render/battle/geometry.ts";
import { factionBattleSetup } from "./debug-armies.ts";
import { navalSampleBattle } from "./debug-naval.ts";
import { runBattleScreen } from "./screen.ts";
import { installTooltips } from "../tooltip.ts";
import { installMagicWheel } from "../magic-wheel.ts";
import { decorateScenario, giveTurn, scenarioSetup } from "./scenarios.ts";
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
  // The screen's stage view (layout() in screen.ts): zoom and stage origin.
  const view = canvas.dataset;
  const v = stageToView(
    { x: sx, y: sy },
    {
      zoom: Number(view.zoom ?? rect.width / STAGE_W),
      x: Number(view.x ?? 0),
      y: Number(view.y ?? 0),
    },
  );
  return { clientX: rect.left + v.x, clientY: rect.top + v.y };
}

/** The debug hero's book (magic=1): a few pages of each school. */
const DEBUG_BOOK: MagicSetup = {
  power: 3,
  mana: 60,
  schoolRanks: { bloom: 2, accord: 1, clock: 1, hush: 2, storm: 3 },
  pages: [
    "regrow",
    "nettle",
    "orchard-day",
    "scapegoat",
    "sign-here",
    "soft-words",
    "late-bell",
    "wind",
    "encore",
    "lullaby",
    "pass-on",
    "deadline",
    "jolt",
    "broadside",
    "cold-snap",
    "the-sky-falls",
  ],
  scrolls: ["set-off", "set-off", "change-places"],
};

const CAVE_SHAMAN = { ...CREATURE_STUB, id: "shaman" };

/** Demo-only content kinds for the grammar view (real content comes later). */
function registerDemoContent(): void {
  if (hasConditionKind("demo-guard")) return;
  registerConditionKind({
    id: "demo-guard",
    name: "Guarded",
    school: "accord",
    polarity: "boon",
    link: "redirect",
    defaultClock: 3,
    text: () => "Damage to this stack is carried to the far end as Harm.",
  });
  registerGroundKind({
    id: "demo-embers",
    name: "Embers",
    class: "hazard",
    school: "storm",
    defaultClock: 2,
    text: (f) => `Harm ${f.size} on entry and at turn start.`,
    onEnter: (fx, id, f) => void fx.harm(id, f.size),
    onTurnStart: (fx, id, f) => void fx.harm(id, f.size),
  });
  registerEffect("demo-shell", () => {});
}

/** Conditions, a link, ground and an event on a fresh battle (UI check). */
function decorate(state: BattleState): BattleState {
  registerDemoContent();
  const d = new Draft(state);
  const fx = new Resolver(d, () => false);
  d.beginStep();
  d.within(null, "debug", () => {
    const ids = state.stacks.map((s) => s.id);
    const has = (id: string): boolean => ids.includes(id);
    if (has("a0"))
      fx.addCondition("a0", { kind: "burning", size: 4, clock: 3 });
    if (has("a1")) fx.delay("a1", 2);
    if (has("a2")) {
      fx.addCondition("a2", { kind: "lucky" });
      fx.addCondition("a2", { kind: "heartened" });
    }
    if (has("a4") && has("a0"))
      fx.link("a4", "a0", { kind: "demo-guard", clock: 3 });
    if (has("d0")) {
      fx.addCondition("d0", {
        kind: "frozen",
        clock: 2,
        gate: { measure: "hp", max: 2000 },
      });
      fx.addCondition("d0", { kind: "jinxed", size: 25, clock: 3 });
    }
    if (has("d1")) {
      fx.addCondition("d1", { kind: "venomed", size: 3, clock: 2 });
      // Four conditions: three badges and a "+1" (UI2-04).
      fx.addCondition("d1", { kind: "shaken", clock: 2 });
      fx.addCondition("d1", { kind: "burning", size: 2, clock: 2 });
      fx.addCondition("d1", { kind: "lucky" });
    }
    fx.addGround({ hex: { col: 6, row: 5 }, kind: "demo-embers", size: 5 });
    fx.addGround({ hex: { col: 7, row: 4 }, kind: "demo-embers", size: 5 });
    fx.addGround({ hex: { col: 5, row: 8 }, kind: "corpse" });
    fx.schedule({
      round: 2,
      phase: "start",
      effect: { id: "demo-shell" },
      side: "attacker",
    });
  });
  return d.toState();
}

/**
 * A screenshot script (`do=`): steps separated by ";", each one of
 * key:<key>, hover:<at>, click:<at>, rclick:<at>, bar:<action key> (point
 * at a bar button for its tooltip), cast:<spell id> (open the book and pick
 * that page) or wait:<ms>. <at> is a stack id or
 * "col.row", optionally "@W" (a side of the hex, as `dir`).
 */
async function runScript(
  container: HTMLElement,
  canvas: HTMLCanvasElement,
  state: BattleState,
  script: string,
): Promise<void> {
  const pause = (ms: number): Promise<void> =>
    new Promise((r) => setTimeout(r, ms));
  for (const step of script.split(";")) {
    const i = step.indexOf(":");
    const verb = i < 0 ? step : step.slice(0, i);
    const arg = i < 0 ? "" : step.slice(i + 1);
    const [where = "", dir = null] = arg.split("@");
    const h = hoverHex(state, where.replace(".", ","));
    const at = h ? pointAt(canvas, h, dir) : null;
    switch (verb) {
      case "key":
        window.dispatchEvent(new KeyboardEvent("keydown", { key: arg }));
        break;
      case "hover":
        if (at)
          canvas.dispatchEvent(
            new PointerEvent("pointermove", { bubbles: true, ...at }),
          );
        break;
      case "click":
        if (at) {
          canvas.dispatchEvent(
            new PointerEvent("pointermove", { bubbles: true, ...at }),
          );
          canvas.dispatchEvent(
            new MouseEvent("click", { bubbles: true, ...at }),
          );
        }
        break;
      case "rclick":
        if (at)
          canvas.dispatchEvent(
            new MouseEvent("contextmenu", {
              bubbles: true,
              cancelable: true,
              ...at,
            }),
          );
        break;
      case "bar": {
        const b = container.querySelector(
          `.bm-act[data-key="${CSS.escape(arg)}"]`,
        );
        b?.parentElement?.dispatchEvent(new PointerEvent("pointerenter"));
        break;
      }
      case "cast": {
        // Open the book and pick the page (bead bzc.47 screenshots).
        if (!container.querySelector(".bm-book:not([hidden])"))
          window.dispatchEvent(new KeyboardEvent("keydown", { key: "b" }));
        await pause(120);
        container
          .querySelector<HTMLButtonElement>(
            `.bm-spell[data-spell="${CSS.escape(arg)}"]`,
          )
          ?.click();
        break;
      }
      case "wait":
        await pause(Number(arg) || 200);
        break;
    }
    await pause(120);
  }
}

export function startBattleDebug(route: Route): void {
  installTooltips();
  installMagicWheel();
  const container = document.getElementById("ui") ?? document.body;
  const p = route.params;
  const seed = route.seed ?? 1;
  const terrainParam = p.get("terrain");
  const terrain = (GROUND_TERRAINS as readonly string[]).includes(
    terrainParam ?? "",
  )
    ? (terrainParam as Terrain)
    : undefined;
  const scenario = p.get("scenario");
  const sc = scenario === null ? null : scenarioSetup(scenario, seed);
  const navalName = p.get("naval");
  const naval = navalName === null ? null : navalSampleBattle(navalName, seed);
  const setup =
    sc?.game ??
    naval ??
    factionBattleSetup(
      p,
      seed,
      terrain ?? (GROUND_TERRAINS[seed % GROUND_TERRAINS.length] as Terrain),
    ) ??
    sampleBattle(seed, terrain);
  if (p.has("armies") || naval !== null) registerSpells();
  const magic = p.get("magic") === "1" || sc !== null;
  if (magic) {
    registerSpells();
    if (!casterOf({ ...CAVE_SHAMAN }))
      registerCreatureCaster("shaman", {
        pages: ["mend", "thunderclap"],
        castPower: 1,
        castDivisor: 2,
        castCap: 8,
      });
  }
  const items = p.get("items") === "1";
  if (items) registerSpells();
  const withItems = (base: EngineBattleSetup): EngineBattleSetup =>
    items && base.attacker.hero !== null
      ? {
          ...base,
          attacker: {
            ...base.attacker,
            hero: { ...base.attacker.hero, itemActs: ITEM_ACT_IDS },
            startRules: [
              ...(base.attacker.startRules ?? []),
              ...startRuleRefs([
                {
                  rule: {
                    side: "own",
                    selector: "strongest",
                    condition: "ripening",
                    size: 20,
                    clock: 4,
                  },
                  source: "Late-Harvest Cordial",
                },
              ]),
            ],
          },
        }
      : base;
  const engineSetup = (): EngineBattleSetup => {
    const base = withItems(sc?.engine ?? engineSetupFromGame(setup));
    return magic
      ? { ...base, attacker: { ...base.attacker, magic: DEBUG_BOOK } }
      : base;
  };
  let state: BattleState | undefined =
    magic || items ? createBattle(engineSetup()).state : undefined;
  const steps = Number(p.get("steps") ?? "0");
  if (p.has("steps")) {
    let s = createBattle(engineSetup()).state;
    for (let i = 0; i < steps && s.winner === null; i++) {
      s = applyAction(s, chooseAiAction(s)).state;
    }
    // Then on to the player's next turn, so the screen opens waiting for input.
    while (s.winner === null && s.activeStackId?.startsWith("d")) {
      s = applyAction(s, chooseAiAction(s)).state;
    }
    state = s;
  }
  if (p.get("grammar") === "1") {
    state = decorate(state ?? createBattle(engineSetup()).state);
  }
  if (scenario !== null && sc !== null) {
    state = decorateScenario(
      scenario,
      state ?? createBattle(engineSetup()).state,
    );
  }
  const activeParam = p.get("active");
  if (activeParam !== null) {
    try {
      state = giveTurn(state ?? createBattle(engineSetup()).state, activeParam);
    } catch {
      // Unknown stack id: leave the turn order alone.
    }
  }
  if (p.has("strip")) {
    const start = state ?? createBattle(engineSetup()).state;
    void import("./fx-strip.ts").then((m) =>
      m.startFxStrip(container, setup, start, p),
    );
    return;
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
          const cur = state ?? createBattle(engineSetup()).state;
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
          if (p.get("book") === "1")
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "b" }));
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
          const script = p.get("do");
          if (script) void runScript(container, canvas, cur, script);
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
