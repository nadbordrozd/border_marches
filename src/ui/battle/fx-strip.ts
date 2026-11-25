/**
 * Frame strips of battle animations, for review (bead bzc.26). A debug
 * route: `?view=battle&scenario=realm&magic=1&strip=<case>` applies one
 * real action to the debug battle, plays its events through the real
 * {@link Animator} on a manual clock and draws chosen moments side by side
 * at 2x. Deterministic: the same URL draws the same strip.
 *
 *   strip=cast&spell=jolt&targets=d0     a hero cast (targets: stack ids,
 *                                        hex:col.row, or none)
 *   strip=attack&target=d0               the active stack's melee attack
 *   strip=shoot&target=d0                the active stack's shot
 *   strip=wait | strip=defend
 *   strip=act&act=<id>&targets=...       any hero act (Command, item)
 *   frames=8  t0=0  t1=1000              moments drawn (ms at speed 1)
 *   crop=x,y,w,h                         stage rectangle (default: all)
 *   reduced=1                            reduced motion
 *   label=...                            a caption
 *
 * The page sets `document.body.dataset.strip = "done"` when drawn.
 */
import {
  activeStack,
  applyAction,
  blockingHexes,
  chooseAiAction,
  legalActions,
} from "../../core/battle/index.ts";
import type {
  ActTarget,
  BattleAction,
  BattleEvent,
  BattleState,
} from "../../core/battle/index.ts";
import type { BattleSetup as GameBattleSetup } from "../../core/game/battle.ts";
import { battleGround, loadBattleArt } from "../../render/battle/assets.ts";
import { STAGE_H, STAGE_W, feetPoint } from "../../render/battle/geometry.ts";
import { paintBackground, renderBattle } from "../../render/battle/renderer.ts";
import { createScene, pruneEffects } from "../../render/battle/scene.ts";
import { resetFxSeed } from "../../render/fx/emit.ts";
import { Animator } from "./animate.ts";

function parseTargets(raw: string | null): ActTarget[] {
  if (raw === null || raw === "" || raw === "none") return [];
  return raw.split(",").map((t) => {
    if (t.startsWith("hex:")) {
      const [col = "0", row = "0"] = t.slice(4).split(".");
      return { hex: { col: Number(col), row: Number(row) } };
    }
    if (t.startsWith("choice:")) return { choice: t.slice(7) };
    return { stack: t };
  });
}

function buildAction(state: BattleState, p: URLSearchParams): BattleAction {
  const a = activeStack(state);
  if (!a) throw new Error("no active stack");
  const kind = p.get("strip") ?? "cast";
  const target = p.get("target");
  const legal = legalActions(state);
  switch (kind) {
    case "attack": {
      const found = legal.find(
        (x) =>
          x.type === "attack" && (target === null || x.targetId === target),
      );
      if (!found) throw new Error(`no legal attack on ${target ?? "anyone"}`);
      return found;
    }
    case "shoot": {
      const found = legal.find(
        (x) => x.type === "shoot" && (target === null || x.targetId === target),
      );
      if (!found) throw new Error(`no legal shot at ${target ?? "anyone"}`);
      return found;
    }
    case "move": {
      const found = legal.find((x) => x.type === "move");
      if (!found) throw new Error("no legal move");
      return found;
    }
    case "wait":
    case "defend":
      return { type: kind, stackId: a.id };
    case "act":
      return {
        type: "heroAct",
        stackId: a.id,
        act: p.get("act") ?? "",
        targets: parseTargets(p.get("targets")),
      };
    default:
      return {
        type: "heroAct",
        stackId: a.id,
        act: p.get("spell") ?? "jolt",
        targets: parseTargets(p.get("targets")),
      };
  }
}

/** Debug only: the casting side knows every page and has mana to spare. */
function withPage(state: BattleState, spell: string): BattleState {
  const a = activeStack(state);
  if (!a) return state;
  const side = state.sides[a.side];
  const magic = side.magic;
  if (!magic) return state;
  return {
    ...state,
    sides: {
      ...state.sides,
      [a.side]: {
        ...side,
        magic: {
          ...magic,
          pages: magic.pages.includes(spell)
            ? magic.pages
            : [...magic.pages, spell],
          mana: Math.max(magic.mana, 200),
        },
      },
    },
  };
}

/** A stage rectangle round every stack and hex the action touches. */
function autoCrop(
  state: BattleState,
  events: readonly BattleEvent[],
  action: BattleAction,
): number[] {
  const pts: { x: number; y: number }[] = [];
  const addStack = (id: string): void => {
    const s = state.stacks.find((x) => x.id === id);
    if (s) pts.push(feetPoint(s.hex));
  };
  if ("targets" in action)
    for (const t of action.targets) {
      if ("stack" in t) addStack(t.stack);
      else if ("hex" in t) pts.push(feetPoint(t.hex));
    }
  if (action.type !== "heroAct") addStack(action.stackId);
  if ("targetId" in action) addStack(action.targetId);
  for (const e of events) {
    if (e.type === "harm" || e.type === "damage") addStack(e.targetId);
    if (e.type === "move") pts.push(feetPoint(e.to));
    if (e.type === "condition" || e.type === "death") addStack(e.stackId);
  }
  if (pts.length === 0) return [0, 0, STAGE_W, STAGE_H];
  let x0 = Math.min(...pts.map((p) => p.x)) - 80;
  let x1 = Math.max(...pts.map((p) => p.x)) + 80;
  let y0 = Math.min(...pts.map((p) => p.y)) - 120;
  let y1 = Math.max(...pts.map((p) => p.y)) + 30;
  if (x1 - x0 < 280) {
    const c = (x0 + x1) / 2;
    x0 = c - 140;
    x1 = c + 140;
  }
  if (y1 - y0 < 220) y0 = y1 - 220;
  x0 = Math.max(0, Math.round(x0));
  y0 = Math.max(0, Math.round(y0));
  x1 = Math.min(STAGE_W, Math.round(x1));
  y1 = Math.min(STAGE_H, Math.round(y1));
  return [x0, y0, x1 - x0, y1 - y0];
}

const tickOnce = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

export async function startFxStrip(
  container: HTMLElement,
  setup: GameBattleSetup,
  state: BattleState,
  p: URLSearchParams,
): Promise<void> {
  const note = document.createElement("pre");
  note.style.cssText =
    "color:#f0e6c8;font:12px monospace;margin:6px 8px;white-space:pre-wrap";
  container.append(note);
  try {
    let before =
      (p.get("strip") ?? "cast") === "cast"
        ? withPage(state, p.get("spell") ?? "jolt")
        : state;
    let action = buildAction(before, p);
    let step = applyAction(before, action);
    const until = p.get("until");
    if (until !== null) {
      // Play on (AI on both sides, a few actions) until the batch that
      // holds the wanted event, and draw that batch instead.
      let s = step.state;
      for (let i = 0; i < 60 && s.winner === null; i++) {
        const a = chooseAiAction(s);
        const st = applyAction(s, a);
        if (st.events.some((e) => e.type === until)) {
          before = s;
          action = a;
          step = st;
          break;
        }
        s = st.state;
      }
    }
    const art = await loadBattleArt(
      battleGround(setup.terrain),
      before.seed,
      before.stacks.map((s) => s.creature.id),
      blockingHexes(before),
    );
    const background = paintBackground(art);
    const scene = createScene(before);
    resetFxSeed(7);
    const animator = new Animator(scene, {
      onTurn: () => {},
      onRound: () => {},
      onLog: () => {},
    });
    animator.reduced = p.get("reduced") === "1";
    scene.reduced = animator.reduced;
    const frames = Math.max(1, Number(p.get("frames") ?? "8"));
    const t0 = Number(p.get("t0") ?? "0");
    const t1 = Number(p.get("t1") ?? "1000");
    const [cx = 0, cy = 0, cw = STAGE_W, ch = STAGE_H] =
      p.get("crop") === null || p.get("crop") === "auto"
        ? autoCrop(before, step.events, action)
        : (p.get("crop") ?? "").split(",").map(Number);
    const zoom = Number(p.get("zoom") ?? (cw > 420 ? "1" : "2"));
    const cols = Number(p.get("cols") ?? String(Math.min(frames, 4)));
    const rows = Math.ceil(frames / cols);
    const labelH = 16;
    const out = document.createElement("canvas");
    out.width = cols * cw * zoom + (cols + 1) * 4;
    const head = 20;
    out.height = head + rows * (ch * zoom + labelH) + (rows + 1) * 4;
    out.style.cssText =
      "display:block;margin:4px 8px;image-rendering:pixelated";
    const octx = out.getContext("2d");
    const stage = document.createElement("canvas");
    stage.width = STAGE_W;
    stage.height = STAGE_H;
    const sctx = stage.getContext("2d");
    if (!octx || !sctx) throw new Error("no canvas");
    octx.fillStyle = "#14110c";
    octx.fillRect(0, 0, out.width, out.height);
    octx.imageSmoothingEnabled = false;
    octx.fillStyle = "#f0e6c8";
    octx.font = "bold 13px monospace";
    octx.fillText(
      `${p.get("label") ?? p.get("strip") ?? ""}${p.get("reduced") === "1" ? " (reduced motion)" : ""}  [${zoom}x]`,
      6,
      15,
    );
    const moments = Array.from({ length: frames }, (_, i) =>
      Math.round(frames === 1 ? t0 : t0 + ((t1 - t0) * i) / (frames - 1)),
    );
    scene.now = 0;
    const playing = animator.play(step.events, before, step.state, action);
    let done = false;
    void playing.then(() => {
      done = true;
    });
    let next = 0;
    let peak = 0;
    for (let t = 0; next < moments.length; t += 8) {
      scene.now = t;
      animator.tick(t);
      for (let i = 0; i < 4; i++) await tickOnce();
      pruneEffects(scene);
      peak = Math.max(peak, scene.fx.size);
      if (t >= (moments[next] ?? Infinity)) {
        sctx.setTransform(1, 0, 0, 1, 0, 0);
        sctx.clearRect(0, 0, STAGE_W, STAGE_H);
        renderBattle(sctx, {
          scene,
          art,
          background,
          obstacles: blockingHexes(before),
          activeId: null,
        });
        const col = next % cols;
        const row = Math.floor(next / cols);
        const x = 4 + col * (cw * zoom + 4);
        const y = head + 4 + row * (ch * zoom + labelH + 4);
        octx.drawImage(stage, cx, cy, cw, ch, x, y, cw * zoom, ch * zoom);
        octx.fillStyle = "#f0e6c8";
        octx.font = "11px monospace";
        octx.fillText(`${moments[next]} ms`, x + 2, y + ch * zoom + 12);
        next++;
      }
      if (t > 20000) break;
    }
    container.append(out);
    note.textContent = `${p.get("label") ?? p.get("strip")}: ${action.type}${
      "act" in action ? ` ${action.act}` : ""
    } — ${step.events.length} events (${step.events
      .map((e) => e.type)
      .join(
        ", ",
      )}); fx peak ${peak}, dropped ${scene.fx.dropped}; ${done ? "batch done" : "batch still playing"}${animator.reduced ? "; reduced motion" : ""}`;
  } catch (err) {
    note.textContent = `strip failed: ${String(err)}`;
  }
  document.body.dataset["strip"] = "done";
}
