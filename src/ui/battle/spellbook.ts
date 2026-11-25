/**
 * The battle spellbook and the cast panel (DOM only; the rules are in
 * magic.ts): pages by school with tier, mana and the effect at this cast's
 * Power, spent pages greyed with the reason, scrolls and a creature
 * caster's own pages; then the targeting prompt, the exact rehearsed chain
 * and the Echo and Fuel toggles with what each would do.
 */

import type { ConditionRef } from "../../core/battle/index.ts";
import { iconElement } from "../icons.ts";
import { SCHOOL_COLOURS, SCHOOL_NAMES } from "./magic.ts";
import type { BookEntry, CastPreview, ConditionOption } from "./magic.ts";

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

export interface BookView {
  readonly title: string;
  /** "Mana 34 / 40 · cast this round: ready" and similar. */
  readonly status: string;
  readonly pages: readonly BookEntry[];
  readonly scrolls: readonly BookEntry[];
  /** Item acts of the hero's worn artifacts (once per battle each). */
  readonly items?: readonly BookEntry[];
  /** The active stack's own pages (creature caster), with its name. */
  readonly creature: {
    readonly name: string;
    readonly pages: readonly BookEntry[];
  } | null;
}

function entryNode(e: BookEntry, onPick: (e: BookEntry) => void): HTMLElement {
  const item = e.source === "item";
  const b = el("button", `bm-spell bm-st-${e.status}${item ? " bm-item" : ""}`);
  b.type = "button";
  b.style.setProperty("--school", item ? "#c9a227" : SCHOOL_COLOURS[e.school]);
  b.disabled = e.status !== "ready";
  b.title = e.reason ?? `${e.name}: ${e.text}`;
  const head = el("div", "bm-spell-head");
  head.append(
    iconElement(item ? "artifact" : "spell", e.id, {
      className: "bm-spell-icon",
    }),
    el("span", "bm-spell-name", e.name + (e.count > 1 ? ` ×${e.count}` : "")),
    el(
      "span",
      "bm-spell-cost",
      item
        ? "item act"
        : e.source === "page" || e.mana > 0
          ? `${e.mana} mana`
          : e.source === "scroll"
            ? "scroll"
            : "page",
    ),
  );
  b.append(
    head,
    el(
      "div",
      "bm-spell-meta",
      item
        ? "Once per battle · before a friendly stack acts"
        : `Tier ${e.tier} · Power ${e.power}${e.fuel ? ` · Fuel doubles ${e.fuel.charAt(0).toLowerCase() + e.fuel.slice(1)}` : ""}`,
    ),
    el("div", "bm-spell-text", e.text),
  );
  if (e.reason) b.append(el("div", "bm-spell-why", e.reason));
  b.addEventListener("click", () => onPick(e));
  return b;
}

/** Fills `box` with the book. */
export function renderBook(
  box: HTMLElement,
  view: BookView,
  onPick: (e: BookEntry) => void,
  onClose: () => void,
): void {
  box.replaceChildren();
  const head = el("div", "bm-book-head");
  const close = el("button", "bm-btn bm-book-close", "Close (Esc)");
  close.type = "button";
  close.addEventListener("click", onClose);
  head.append(
    el("div", "bm-book-title", view.title),
    el("div", "bm-dim", view.status),
    close,
  );
  box.append(head);
  const cols = el("div", "bm-book-cols");
  const schools = ["bloom", "accord", "clock", "hush", "storm"] as const;
  for (const school of schools) {
    const pages = view.pages.filter((p) => p.school === school);
    if (pages.length === 0) continue;
    const col = el("div", "bm-book-col");
    const h = el("div", "bm-book-school", SCHOOL_NAMES[school]);
    h.style.color = SCHOOL_COLOURS[school];
    col.append(h, ...pages.map((p) => entryNode(p, onPick)));
    cols.append(col);
  }
  if (view.scrolls.length > 0) {
    const col = el("div", "bm-book-col");
    col.append(
      el("div", "bm-book-school", "Scrolls"),
      ...view.scrolls.map((p) => entryNode(p, onPick)),
    );
    cols.append(col);
  }
  if ((view.items ?? []).length > 0) {
    const col = el("div", "bm-book-col");
    col.append(
      el("div", "bm-book-school", "Items"),
      ...(view.items ?? []).map((p) => entryNode(p, onPick)),
    );
    cols.append(col);
  }
  if (view.creature && view.creature.pages.length > 0) {
    const col = el("div", "bm-book-col");
    col.append(
      el("div", "bm-book-school", `${view.creature.name}: own pages`),
      ...view.creature.pages.map((p) => entryNode(p, onPick)),
    );
    cols.append(col);
  }
  if (cols.childElementCount === 0)
    cols.append(el("div", "bm-dim", "No pages, no scrolls."));
  box.append(cols);
}

export interface CastPanelModel {
  readonly entry: BookEntry;
  readonly prompt: string;
  /** Conditions of a picked stack (condition steps). */
  readonly conditions: readonly ConditionOption[] | null;
  /** Named options (Wind: +2 / -2). */
  readonly choices: readonly string[] | null;
  /** The rehearsal of the complete cast, or of the hovered last target. */
  readonly preview: CastPreview | null;
  readonly hovered: boolean;
  readonly echo: readonly ConditionOption[];
  readonly fuel: readonly ConditionOption[];
  readonly echoOn: ConditionRef | null;
  readonly fuelOn: ConditionRef | null;
  readonly fuelLeft: boolean;
  readonly complete: boolean;
}

export interface CastPanelHandlers {
  onCondition(ref: ConditionRef): void;
  onChoice(choice: string): void;
  onEcho(ref: ConditionRef | null): void;
  onFuel(ref: ConditionRef | null): void;
  onCast(): void;
  onBack(): void;
  onCancel(): void;
}

const sameRef = (a: ConditionRef | null, b: ConditionRef): boolean =>
  a !== null && a.stack === b.stack && a.condition === b.condition;

function toggles(
  label: string,
  options: readonly ConditionOption[],
  on: ConditionRef | null,
  pick: (ref: ConditionRef | null) => void,
): HTMLElement {
  const row = el("div", "bm-cast-toggles");
  row.append(el("span", "bm-pv-label", `${label}: `));
  for (const o of options) {
    const b = el("button", "bm-toggle", o.label);
    b.type = "button";
    b.title = o.effect;
    const active = sameRef(on, o.ref);
    b.classList.toggle("bm-on", active);
    b.addEventListener("click", () => pick(active ? null : o.ref));
    row.append(b);
  }
  const chosen = options.find((o) => sameRef(on, o.ref));
  if (chosen) row.append(el("div", "bm-cast-effect", chosen.effect));
  return row;
}

/** Fills `box` with the cast panel. */
export function renderCastPanel(
  box: HTMLElement,
  m: CastPanelModel,
  h: CastPanelHandlers,
): void {
  box.replaceChildren();
  const item = m.entry.source === "item";
  box.style.setProperty(
    "--school",
    item ? "#c9a227" : SCHOOL_COLOURS[m.entry.school],
  );
  const head = el("div", "bm-cast-head");
  head.append(
    iconElement(item ? "artifact" : "spell", m.entry.id, {
      className: "bm-spell-icon",
    }),
    el("span", "bm-cast-name", m.entry.name),
    el(
      "span",
      "bm-dim",
      item
        ? " Item act · once per battle"
        : ` ${SCHOOL_NAMES[m.entry.school]} ${m.entry.tier} · Power ${m.entry.power}` +
            (m.entry.source === "page"
              ? ` · ${m.entry.mana} mana`
              : m.entry.source === "scroll"
                ? " · scroll"
                : " · the stack's action"),
    ),
  );
  box.append(head, el("div", "bm-spell-text", m.entry.text));
  if (!m.complete) box.append(el("div", "bm-cast-prompt", m.prompt));
  if (m.conditions) {
    const row = el("div", "bm-cast-toggles");
    if (m.conditions.length === 0)
      row.append(el("span", "bm-dim", "No condition there."));
    for (const c of m.conditions) {
      const b = el("button", "bm-toggle", c.label);
      b.type = "button";
      b.title = c.effect;
      b.addEventListener("click", () => h.onCondition(c.ref));
      row.append(b);
    }
    box.append(row);
  }
  if (m.choices) {
    const row = el("div", "bm-cast-toggles");
    for (const c of m.choices) {
      const b = el("button", "bm-toggle", c);
      b.type = "button";
      b.addEventListener("click", () => h.onChoice(c));
      row.append(b);
    }
    box.append(row);
  }
  const p = m.preview;
  if (p) {
    const pv = el("div", `bm-cast-preview${m.hovered ? " bm-hovered" : ""}`);
    if (!p.legal)
      pv.append(
        el("div", "bm-cast-refused", `Cannot cast: ${p.message ?? ""}`),
      );
    else {
      for (const line of p.summary) pv.append(el("div", "bm-cast-sum", line));
      if (p.lines.length > 0)
        pv.append(el("div", "bm-pv-chain", p.lines.join(" → ")));
    }
    box.append(pv);
  }
  if (m.complete && m.entry.source !== "creature" && !item) {
    if (m.echo.length > 0)
      box.append(toggles("Echo (free)", m.echo, m.echoOn, h.onEcho));
    else
      box.append(
        el(
          "div",
          "bm-dim",
          "Echo: no allied-school condition with a clock on a touched stack.",
        ),
      );
    if (m.entry.fuel === null)
      box.append(el("div", "bm-dim", "Fuel: this spell has no size."));
    else if (!m.fuelLeft)
      box.append(el("div", "bm-dim", "Fuel: used for this battle."));
    else if (m.fuel.length > 0)
      box.append(toggles("Fuel (once a battle)", m.fuel, m.fuelOn, h.onFuel));
    else
      box.append(
        el(
          "div",
          "bm-dim",
          "Fuel: no opposed-school condition on a touched stack.",
        ),
      );
  }
  const row = el("div", "bm-cast-buttons");
  const cast = el("button", "bm-btn bm-primary", item ? "Use ⏎" : "Cast ⏎");
  cast.type = "button";
  cast.disabled = !m.complete || !(m.preview?.legal ?? false) || m.hovered;
  cast.addEventListener("click", h.onCast);
  const back = el("button", "bm-btn", "Back ⌫");
  back.type = "button";
  back.addEventListener("click", h.onBack);
  const cancel = el("button", "bm-btn", "Cancel Esc");
  cancel.type = "button";
  cancel.addEventListener("click", h.onCancel);
  row.append(cast, back, cancel);
  box.append(row);
}
