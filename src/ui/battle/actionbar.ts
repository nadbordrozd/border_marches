/**
 * The action bar and the act panel (DOM only; the rules are in actions.ts
 * and targeting.ts): one button per action with its icon above a short
 * label that is never cut (UI2-05), its hotkey and use badge as corner
 * chips, a hover card with the full name, the exact rule text, when it may
 * be used and why it is disabled, and
 * the targeting panel of an act (prompt, condition choices, the exact
 * rehearsed chain, Use, Back and Cancel). Hit and Run's "then step to"
 * choice uses the same panel.
 */

import { iconElement } from "../icons.ts";
import { rulesText } from "../keywords.ts";
import { actionTooltip, shortLabel } from "./actions.ts";
import type { ActionIcon, BarAction } from "./actions.ts";
import type { CastPreview, ConditionOption } from "./magic.ts";

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

/** An action's icon: a content icon, or a glyph in the same 32 px box. */
export function actionIcon(icon: ActionIcon): HTMLElement {
  if ("glyph" in icon) {
    const g = el("span", "bm-act-glyph", icon.glyph);
    g.setAttribute("aria-hidden", "true");
    return g;
  }
  return iconElement(icon.icon, icon.id, {
    className: "bm-act-icon",
    framed: false,
  });
}

const GROUP_NAMES = { stack: "Stack", hero: "Hero", turn: "Turn" } as const;

export interface BarHandlers {
  onPress(a: BarAction): void;
  /** The pointer is on a button (null: left the bar). */
  onHover(a: BarAction | null, button: HTMLElement | null): void;
}

/** Fills `box` with the bar's buttons, grouped. */
export function renderActionBar(
  box: HTMLElement,
  actions: readonly BarAction[],
  active: ReadonlySet<string>,
  h: BarHandlers,
): void {
  box.replaceChildren();
  for (const group of ["stack", "hero", "turn"] as const) {
    const list = actions.filter((a) => a.group === group);
    if (list.length === 0) continue;
    const g = el("div", `bm-act-group bm-act-${group}`);
    g.append(el("span", "bm-act-caption", GROUP_NAMES[group]));
    for (const a of list) {
      const b = el("button", `bm-act bm-act-st-${a.state}`);
      b.type = "button";
      b.dataset["key"] = a.key;
      b.disabled = a.state !== "ready";
      b.setAttribute(
        "aria-label",
        `${a.label}${a.hotkey ? ` (${a.hotkey})` : ""}${a.reason ? `: ${a.reason}` : ""}`,
      );
      if (a.on !== undefined) b.classList.toggle("bm-on", a.on);
      if (active.has(a.key)) b.classList.add("bm-aiming");
      if (a.hotkey) b.append(el("span", "bm-act-key", a.hotkey));
      // The short label, whole on one or two lines (UI2-05); the hover
      // card has the full name.
      b.append(
        actionIcon(a.icon),
        el("span", "bm-act-label", a.short ?? shortLabel(a.label)),
      );
      if (a.badge) b.append(el("span", "bm-act-badge", a.badge));
      b.addEventListener("click", () => h.onPress(a));
      // Disabled buttons get no pointer events in some browsers: listen on
      // a wrapper so the tooltip still explains why.
      const wrap = el("span", "bm-act-wrap");
      wrap.append(b);
      wrap.addEventListener("pointerenter", () => h.onHover(a, wrap));
      wrap.addEventListener("pointerleave", () => h.onHover(null, null));
      g.append(wrap);
    }
    box.append(g);
  }
}

/** Fills the tooltip box for an action and places it above `anchor`. */
export function showActionTip(
  tip: HTMLElement,
  a: BarAction,
  anchor: HTMLElement,
  container: HTMLElement,
): void {
  const t = actionTooltip(a);
  tip.replaceChildren();
  const head = el("div", "bm-act-tip-head");
  head.append(actionIcon(a.icon), el("span", "bm-act-tip-title", t.title));
  tip.append(head);
  for (const line of t.lines)
    tip.append(rulesText(line, { tag: "div", className: "bm-act-tip-line" }));
  if (t.reason)
    tip.append(el("div", "bm-act-tip-why", `Unavailable: ${t.reason}`));
  tip.hidden = false;
  const r = anchor.getBoundingClientRect();
  const c = container.getBoundingClientRect();
  const w = tip.offsetWidth;
  const left = Math.min(
    Math.max(4, r.left - c.left + r.width / 2 - w / 2),
    c.width - w - 4,
  );
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(r.top - c.top - tip.offsetHeight - 8)}px`;
}

export interface ActPanelModel {
  readonly icon: ActionIcon;
  readonly name: string;
  /** "Ogres' ability · every turn" and the like. */
  readonly kind: string;
  readonly rule: string;
  readonly prompt: string;
  readonly conditions: readonly ConditionOption[] | null;
  readonly preview: CastPreview | null;
  /** The preview is of a hovered target, not of the chosen ones. */
  readonly hovered: boolean;
  /** The chosen targets, in order ("1 Squires", "2 Ghouls"). */
  readonly chosen: readonly string[];
  readonly canUse: boolean;
  /** The Use button's label ("Use (Enter)", "Stay (Enter)"). */
  readonly useLabel: string;
  readonly canBack: boolean;
}

export interface ActPanelHandlers {
  onCondition(o: ConditionOption): void;
  onUse(): void;
  onBack(): void;
  onCancel(): void;
}

/** Fills `box` with the act panel. */
export function renderActPanel(
  box: HTMLElement,
  m: ActPanelModel,
  h: ActPanelHandlers,
): void {
  box.replaceChildren();
  box.style.setProperty("--school", "#5fd3c4");
  const head = el("div", "bm-act-head");
  const title = el("div", "bm-act-title");
  title.append(el("div", "bm-cast-name", m.name), el("div", "bm-dim", m.kind));
  head.append(actionIcon(m.icon), title);
  box.append(
    head,
    rulesText(m.rule, { tag: "div", className: "bm-spell-text", hover: true }),
  );
  if (m.chosen.length > 0)
    box.append(el("div", "bm-act-chosen", `Chosen: ${m.chosen.join(" · ")}`));
  box.append(el("div", "bm-cast-prompt", m.prompt));
  if (m.conditions) {
    const list = el("div", "bm-act-conds");
    if (m.conditions.length === 0)
      list.append(el("span", "bm-dim", "No condition there can be chosen."));
    for (const c of m.conditions) {
      const b = el("button", "bm-toggle", c.label);
      b.type = "button";
      b.title = c.effect;
      b.addEventListener("click", () => h.onCondition(c));
      const row = el("div", "bm-act-cond");
      row.append(b, el("span", "bm-act-cond-effect", c.effect));
      list.append(row);
    }
    box.append(list);
  }
  const p = m.preview;
  if (p) {
    const pv = el("div", `bm-cast-preview${m.hovered ? " bm-hovered" : ""}`);
    if (!p.legal)
      pv.append(el("div", "bm-cast-refused", `Cannot: ${p.message ?? ""}`));
    else {
      for (const line of p.summary) pv.append(el("div", "bm-cast-sum", line));
      if (p.lines.length > 0)
        pv.append(el("div", "bm-pv-chain", p.lines.join(" → ")));
      if (p.summary.length === 0 && p.lines.length === 0)
        pv.append(el("div", "bm-dim", "No visible effect."));
    }
    box.append(pv);
  }
  const row = el("div", "bm-cast-buttons");
  const use = el("button", "bm-btn bm-primary", m.useLabel);
  use.type = "button";
  use.disabled = !m.canUse;
  use.addEventListener("click", h.onUse);
  const back = el("button", "bm-btn", "Back ⌫");
  back.type = "button";
  back.disabled = !m.canBack;
  back.addEventListener("click", h.onBack);
  const cancel = el("button", "bm-btn", "Cancel Esc");
  cancel.type = "button";
  cancel.addEventListener("click", h.onCancel);
  row.append(use, back, cancel);
  box.append(row);
}
