/**
 * The battle screen's deployment phase (Vanguard, core/battle/deploy.ts):
 * before round 1 the player rearranges their stacks within the allowed
 * columns, by clicking a stack and then a hex, or by dragging. A friendly
 * stack on the chosen hex swaps places. The field shown is the engine's
 * `fieldState`, so nothing about the battle itself changes until the
 * player starts it; the battle-start rules then run on the deployed field.
 */

import {
  aiDeployment,
  deploy,
  deployColumns,
  deployZone,
  deployedHexes,
  fieldState,
  hexIndex,
  redeploy,
  sameHex,
} from "../../core/battle/index.ts";
import type {
  BattleSetup,
  BattleSide,
  BattleState,
  Hex,
} from "../../core/battle/index.ts";
import type { HexMark, Overlay } from "../../render/battle/scene.ts";
import { creatureName } from "./preview.ts";
import type { StatusLine } from "./status.ts";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text = "",
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

/** What the deployment phase needs from the battle screen. */
export interface DeployHost {
  /** The field changed: show it. */
  changed(state: BattleState): void;
  /** The player is done: start the battle from this setup. */
  done(setup: BattleSetup): void;
}

export class DeployPhase {
  private selected: number | null = null;
  private hover: Hex | null = null;
  private message = "";
  private readonly initial: BattleSetup;

  constructor(
    private setup: BattleSetup,
    readonly side: BattleSide,
    private readonly host: DeployHost,
  ) {
    this.initial = setup;
  }

  /** The setup as deployed so far. */
  current(): BattleSetup {
    return this.setup;
  }

  /** The field as deployed so far (round 0, no turn). */
  state(): BattleState {
    return fieldState(this.setup);
  }

  private hexes(): Hex[] {
    return deployedHexes(this.setup, this.side);
  }

  /** The index (setup order) of the player's stack on `h`, or null. */
  private stackAt(h: Hex | null): number | null {
    if (h === null) return null;
    const i = this.hexes().findIndex((x) => sameHex(x, h));
    return i < 0 ? null : i;
  }

  private inZone(h: Hex | null): boolean {
    return (
      h !== null && deployZone(this.setup, this.side).some((z) => sameHex(z, h))
    );
  }

  private set(next: BattleSetup | string): void {
    if (typeof next === "string") {
      this.message = next;
      return;
    }
    this.setup = next;
    this.message = "";
    this.host.changed(this.state());
  }

  /** Pointer over a hex (or off the field). */
  point(h: Hex | null): void {
    this.hover = h;
  }

  /** A click: pick a stack up, put it down, or swap two. */
  click(h: Hex | null): void {
    if (h === null) return;
    const here = this.stackAt(h);
    if (this.selected === null) {
      this.selected = here;
      this.message = "";
      return;
    }
    if (here === this.selected) {
      this.selected = null;
      return;
    }
    if (!this.inZone(h)) {
      this.message = "Only the highlighted columns.";
      return;
    }
    const from = this.selected;
    this.selected = null;
    this.set(redeploy(this.setup, this.side, from, h));
  }

  /** A drag from one hex to another. */
  drag(from: Hex | null, to: Hex | null): void {
    const i = this.stackAt(from);
    if (i === null || to === null || sameHex(from as Hex, to)) return;
    this.selected = null;
    if (!this.inZone(to)) {
      this.message = "Only the highlighted columns.";
      return;
    }
    this.set(redeploy(this.setup, this.side, i, to));
  }

  /** Whether a drag may start on this hex (one of the player's stacks). */
  canDrag(h: Hex | null): boolean {
    return this.stackAt(h) !== null;
  }

  reset(): void {
    this.selected = null;
    this.set(this.initial);
  }

  /** The battle AI's placement (shooters back, blockers forward). */
  suggest(): void {
    this.selected = null;
    this.set(
      deploy(this.setup, this.side, aiDeployment(this.setup, this.side)),
    );
  }

  start(): void {
    this.host.done(this.setup);
  }

  cancelSelection(): void {
    this.selected = null;
  }

  /** The zone, the picked-up stack and the hovered destination. */
  overlay(): Overlay {
    const marks = new Map<number, HexMark>();
    const own = this.hexes();
    for (const h of deployZone(this.setup, this.side)) {
      marks.set(hexIndex(h), "act-valid");
    }
    const hover = this.hover;
    const sel = this.selected === null ? null : (own[this.selected] ?? null);
    if (sel !== null) marks.set(hexIndex(sel), "chosen");
    if (hover !== null && this.inZone(hover)) {
      const there = this.stackAt(hover);
      if (sel === null) {
        if (there !== null) marks.set(hexIndex(hover), "act-hover");
      } else if (there !== this.selected) {
        marks.set(hexIndex(hover), there === null ? "move-target" : "swap");
      }
    }
    return { marks, active: null, strike: null };
  }

  /** The canvas cursor for the hovered hex. */
  cursor(): string {
    if (this.selected === null) {
      return this.stackAt(this.hover) !== null ? "grab" : "default";
    }
    return this.inZone(this.hover) ? "pointer" : "not-allowed";
  }

  /** The status line (UI2-05): what a click does now, or the refusal. */
  status(): StatusLine {
    const line = this.guide();
    return this.message === ""
      ? line
      : { text: `${this.message} ${line.text}`, tone: "warn" };
  }

  private guide(): StatusLine {
    const state = this.state();
    const picked =
      this.selected === null
        ? null
        : (state.stacks.find(
            (s) =>
              s.side === this.side &&
              sameHex(s.hex, this.hexes()[this.selected as number] as Hex),
          ) ?? null);
    if (picked !== null)
      return {
        text: `${creatureName(picked.creature, picked.count)} ×${picked.count}: click a highlighted hex to place them (Esc puts them back)`,
        tone: "go",
      };
    const cols = deployColumns(this.setup[this.side]);
    const where =
      cols === 1 ? "your deployment column" : `your first ${cols} columns`;
    return {
      text: `Deployment: click or drag a stack to a hex in ${where} (onto another to swap), then Start battle`,
      tone: "idle",
    };
  }

  /** The phase's buttons, shown in the action bar's place. */
  buttons(): HTMLElement {
    const row = el("div", "bm-deploy-buttons");
    const button = (
      label: string,
      title: string,
      fn: () => void,
      cls = "bm-btn",
    ): void => {
      const b = el("button", cls, label);
      b.type = "button";
      b.title = title;
      b.addEventListener("click", fn);
      row.append(b);
    };
    row.append(el("span", "bm-deploy-title", "Deployment (Vanguard)"));
    button("Reset", "Back to the starting positions", () => this.reset());
    button(
      "Suggest",
      "The battle AI's placement: shooters and casters back, blockers forward",
      () => this.suggest(),
    );
    button(
      "Start battle",
      "Begin round 1 (Enter)",
      () => this.start(),
      "bm-btn bm-primary",
    );
    return row;
  }
}
