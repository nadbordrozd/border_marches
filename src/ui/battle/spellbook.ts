/**
 * The battle spellbook and the cast panel (DOM only; the rules are in
 * magic.ts): pages by school with tier, mana and the effect at this cast's
 * Power, spent pages greyed with the reason, scrolls and a creature
 * caster's own pages; then the targeting prompt, the exact rehearsed chain
 * and the Echo and Fuel toggles with what each would do.
 */

import type { ConditionRef } from "../../core/battle/index.ts";
import { isBattleSpell } from "../../core/magic/index.ts";
import { iconElement } from "../icons.ts";
import { targetLine } from "../target-icon.ts";
import { ANYWHERE, spellTargetKind } from "./spell-targets.ts";
import { spellTip } from "../info-tips.ts";
import { rulesText } from "../keywords.ts";
import { setTip, tipCard } from "../tooltip.ts";
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

/** A page's hover card: the spell card at this Power, then why not now. */
function entryTip(e: BookEntry): HTMLElement {
  const card =
    e.source !== "item" && isBattleSpell(e.id) ? spellTip(e.id, e.power) : null;
  const why = e.reason ? el("div", "gm-tip-line gm-tip-bad", e.reason) : null;
  if (card instanceof HTMLElement) {
    if (why) card.append(why);
    return card;
  }
  return tipCard(e.name, [e.text, why]);
}

function entryNode(e: BookEntry, onPick: (e: BookEntry) => void): HTMLElement {
  const item = e.source === "item";
  const b = el("button", `bm-spell bm-st-${e.status}${item ? " bm-item" : ""}`);
  b.type = "button";
  b.dataset["spell"] = e.id;
  b.style.setProperty("--school", item ? "#c9a227" : SCHOOL_COLOURS[e.school]);
  b.disabled = e.status !== "ready";
  setTip(b, () => entryTip(e));
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
        : `Tier ${e.tier} · Power ${e.power}${e.fuel ? ` · Fuel doubles ${e.fuel.replace(/^The /, "the ")}` : ""}`,
    ),
    rulesText(e.text, { tag: "div", className: "bm-spell-text" }),
  );
  const kind = spellTargetKind(e.id);
  if (kind) b.append(targetLine(kind, "bm-spell-target"));
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
  /** Conditions of a picked stack (condition steps); `valid` false greys one. */
  readonly conditions:
    | readonly (ConditionOption & {
        readonly valid?: boolean;
        /** Why it is greyed ("No effect: ..."). */
        readonly why?: string;
      })[]
    | null;
  /** Why the last click was refused, or null. */
  readonly notice?: string | null;
  /** Named options (Wind: +2 / -2). */
  readonly choices: readonly string[] | null;
  /** Options the cast refuses (Wind +2 on a Hold). */
  readonly badChoices?: readonly string[];
  /** How many valid targets glow on the field for this step, or null. */
  readonly valid?: number | null;
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
  box.append(
    head,
    rulesText(m.entry.text, {
      tag: "div",
      className: "bm-spell-text",
      hover: true,
    }),
  );
  const kind = spellTargetKind(m.entry.id);
  if (kind) box.append(targetLine(kind, "bm-spell-target"));
  if (!m.complete) box.append(el("div", "bm-cast-prompt", m.prompt));
  if (!m.complete && m.notice)
    box.append(el("div", "bm-cast-refused", m.notice));
  const n = m.valid;
  if (!m.complete && n !== undefined && n !== null && !m.conditions)
    box.append(
      el(
        "div",
        "bm-cast-valid",
        n === 0
          ? "Nothing valid left to choose: go Back or Cancel."
          : n >= ANYWHERE
            ? "Point anywhere on the field: the outline shows what it covers. Right-click or Esc cancels."
            : `${n} valid target${n === 1 ? "" : "s"} glow on the field. Right-click or Esc cancels.`,
      ),
    );
  if (m.conditions) {
    const row = el("div", "bm-cast-toggles");
    if (m.conditions.length === 0)
      row.append(el("span", "bm-dim", "No condition there."));
    for (const c of m.conditions) {
      const b = el("button", "bm-toggle", c.label);
      b.type = "button";
      b.title =
        c.valid === false ? (c.why ?? "This spell cannot take it") : c.effect;
      b.disabled = c.valid === false;
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
      b.disabled = m.badChoices?.includes(c) ?? false;
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
