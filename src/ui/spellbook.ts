/**
 * The adventure spellbook (RULES_V2 2.8): the hero's adventure pages and
 * scrolls by school with mana, the number at its Power and why one cannot
 * be cast (no valid target included, bead bzc.47), each with its target
 * type; picking one returns the cast for the game screen to run, or an aim
 * whose valid targets (a neutral stack within 2 cells, an enemy hero or
 * sealed site, an explored cell) glow on the map for the next click. An
 * amount and a pylon are chosen in the book. Battle pages are listed too,
 * for reference.
 */

import type { School } from "../core/battle/index.ts";
import type { GameState, HeroState } from "../core/game/index.ts";
import {
  ADVENTURE_SPELLS,
  adventureManaCost,
  adventurePower,
  heroMagic,
  isBattleSpell,
  spellDef,
  storeOf,
} from "../core/magic/index.ts";
import type {
  AdventureSpellDef,
  AdventureTarget,
} from "../core/magic/index.ts";
import { setTip } from "./tooltip.ts";
import { spellTip } from "./info-tips.ts";
import { el, modal } from "./dom.ts";
import { iconElement } from "./icons.ts";
import { targetLine } from "./target-icon.ts";
import { adventureTargetKind, adventureUsable } from "./adventure-targets.ts";
import type { AdventureAim } from "./adventure-targets.ts";
import { rulesText } from "./keywords.ts";

const SCHOOLS: readonly School[] = [
  "bloom",
  "accord",
  "clock",
  "hush",
  "storm",
];
const NAMES: Record<School, string> = {
  bloom: "Bloom",
  accord: "Accord",
  clock: "Clock",
  hush: "Hush",
  storm: "Storm",
};
const COLOURS: Record<School, string> = {
  bloom: "#6fae4f",
  accord: "#d9b44a",
  clock: "#5a8fcf",
  hush: "#8a6bb8",
  storm: "#d0643c",
};

export type BookChoice =
  | {
      readonly kind: "cast";
      readonly spell: string;
      readonly scroll: boolean;
      readonly target: AdventureTarget;
    }
  /**
   * Aimed on the map: the valid targets glow and the next map click on
   * one casts (bead bzc.47).
   */
  | {
      readonly kind: "aim";
      readonly spell: string;
      readonly scroll: boolean;
      readonly aims: readonly AdventureAim[];
    }
  | null;

/** Target kinds aimed on the map rather than chosen in the book. */
const AIMED_ON_MAP: ReadonlySet<string> = new Set([
  "nearbyMonster",
  "sealed",
  "exploredCell",
]);

/** Opens the book; resolves with the chosen cast, or null. */
export function openAdventureBook(
  state: GameState,
  hero: HeroState,
): Promise<BookChoice> {
  const m = heroMagic(hero);
  const cast = storeOf(state, hero.id).castToday;
  return new Promise((resolve) => {
    let done: ((c: BookChoice) => void) | null = null;
    const body = el("div.gm-book");
    body.append(
      el(
        "div.gm-book-status",
        `Mana ${m.mana} / ${m.maxMana} · Power ${m.power} · ` +
          `${m.scrolls.length} of ${m.scrollCase} scrolls` +
          (cast.length > 0 ? ` · cast today: ${cast.join(", ")}` : ""),
      ),
    );
    const finish = (c: BookChoice): void => done?.(c);
    const entry = (s: AdventureSpellDef, scroll: boolean): HTMLElement => {
      const power = adventurePower(hero, s.id, scroll);
      // Greyed with the reason when it cannot be cast or has no target.
      const usable = adventureUsable(state, hero, s.id, scroll);
      const err = usable.reason;
      const row = el("div.gm-book-spell");
      row.style.setProperty("--school", COLOURS[s.school]);
      if (err) row.classList.add("gm-book-off");
      const cost = scroll ? "scroll" : `${adventureManaCost(hero, s.id)} mana`;
      row.append(
        iconElement("spell", s.id),
        el(
          "div.gm-book-text",
          el("b", `${s.name}${scroll ? " (scroll)" : ""}`),
          el(
            "span.gm-dim",
            ` ${NAMES[s.school]} ${s.tier} · ${cost}${s.moveCost === undefined ? "" : s.moveCost === "all" ? " · all movement" : s.moveCost > 0 ? ` · ${s.moveCost} movement` : ""}`,
          ),
          rulesText(s.text(power), { tag: "div", hover: true }),
          targetLine(adventureTargetKind(s.target), "gm-book-target"),
          err ? el("div.gm-book-why", err) : null,
        ),
      );
      const actions = el("div.gm-book-actions");
      const pick = (target: AdventureTarget, label = "Cast"): void => {
        const b = el("button.gm-btn", label);
        b.type = "button";
        b.disabled = err !== null;
        b.addEventListener("click", () =>
          finish({ kind: "cast", spell: s.id, scroll, target }),
        );
        actions.append(b);
      };
      if (s.target === "none") pick({});
      else if (AIMED_ON_MAP.has(s.target)) {
        const n = usable.aims?.length ?? 0;
        const b = el("button.gm-btn.gm-book-aim", "Aim on the map…");
        b.type = "button";
        b.disabled = err !== null;
        b.title =
          err ??
          (s.target === "exploredCell"
            ? "The cells in reach glow on the map; click one to cast."
            : `${n} valid target${n === 1 ? "" : "s"} glow on the map; click one to cast.`);
        b.addEventListener("click", () =>
          finish({ kind: "aim", spell: s.id, scroll, aims: usable.aims ?? [] }),
        );
        actions.append(b);
      } else if (s.target === "amount") {
        const input = el("input.gm-book-amount");
        input.type = "number";
        input.min = "1";
        const max = Math.min(hero.mp, 200 + 50 * power);
        input.max = String(max);
        input.value = String(max);
        const b = el("button.gm-btn", "Save");
        b.type = "button";
        b.disabled = err !== null || max < 1;
        b.addEventListener("click", () =>
          finish({
            kind: "cast",
            spell: s.id,
            scroll,
            target: { amount: Number(input.value) },
          }),
        );
        actions.append(input, b);
      } else if (s.target === "pylon") {
        // Destinations may lie anywhere on the map: chosen from a list.
        for (const o of usable.aims ?? []) pick(o.target, `To the ${o.label}`);
      }
      row.append(actions);
      return row;
    };
    const known = new Set(m.knownSpells);
    const scrolls = new Set(m.scrolls);
    let any = false;
    for (const school of SCHOOLS) {
      const mine = ADVENTURE_SPELLS.filter(
        (s) => s.school === school && (known.has(s.id) || scrolls.has(s.id)),
      );
      if (mine.length === 0) continue;
      any = true;
      const h = el("h3.gm-book-school", NAMES[school]);
      h.style.color = COLOURS[school];
      body.append(h);
      for (const s of mine) {
        if (known.has(s.id)) body.append(entry(s, false));
        if (scrolls.has(s.id)) body.append(entry(s, true));
      }
    }
    if (!any)
      body.append(
        el(
          "div.gm-dim",
          "No adventure spells yet: a Magic Guild or a shrine teaches them.",
        ),
      );
    const battle = m.knownSpells.filter(isBattleSpell);
    if (battle.length > 0) {
      body.append(
        el("h3.gm-book-school", "Battle pages"),
        el(
          "div.gm-dim.gm-book-note",
          "Cast in battle from the action bar. Hover a page for its effect.",
        ),
      );
      const grid = el("div.gm-book-pages");
      for (const school of SCHOOLS) {
        const ids = battle.filter((id) => spellDef(id).school === school);
        if (ids.length === 0) continue;
        const col = el("div.gm-book-pagecol");
        const head = el("div.gm-book-pagehead", NAMES[school]);
        head.style.color = COLOURS[school];
        col.append(head);
        for (const id of ids) {
          const d = spellDef(id);
          const page = el(
            "div.gm-book-page",
            iconElement("spell", id),
            el("span.gm-book-page-name", d.name),
            el("span.gm-book-page-mana", String(d.mana)),
          );
          page.tabIndex = 0;
          setTip(page, () => spellTip(id, m.power));
          col.append(page);
        }
        grid.append(col);
      }
      body.append(grid);
    }
    let picked: BookChoice = null;
    void modal<BookChoice>({
      title: `${hero.name}'s spellbook`,
      className: "gm-book-dialog",
      body,
      buttons: [{ label: "Close", value: null, primary: true }],
      cancel: null,
      onOpen: (buttons) => {
        done = (c) =>
          buttons[0]?.dispatchEvent(new CustomEvent("bm-pick", { detail: c }));
        buttons[0]?.addEventListener("bm-pick", (ev) => {
          const c = (ev as CustomEvent<BookChoice>).detail;
          picked = c;
          buttons[0]?.click();
        });
      },
    }).then(() => resolve(picked));
  });
}
