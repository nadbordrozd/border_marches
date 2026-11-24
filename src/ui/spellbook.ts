/**
 * The adventure spellbook (RULES_V2 2.8): the hero's adventure pages and
 * scrolls by school with mana, the number at its Power and why one cannot
 * be cast; picking one asks for its target (an adjacent neutral stack, an
 * enemy hero or sealed site, an amount, or a cell on the map) and returns
 * the cast for the game screen to run. Battle pages are listed too, for
 * reference.
 */

import type { School } from "../core/battle/index.ts";
import type { GameState, HeroState } from "../core/game/index.ts";
import {
  ADVENTURE_SPELLS,
  adventureCastError,
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
import { el, modal } from "./dom.ts";
import { iconElement } from "./icons.ts";

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
  /** Ask the Dead: the next map click picks the cell. */
  | { readonly kind: "aim"; readonly spell: string; readonly scroll: boolean }
  | null;

function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/** Target options for spells with a list to pick from. */
function targetOptions(
  state: GameState,
  hero: HeroState,
  s: AdventureSpellDef,
  power: number,
): Array<{ label: string; target: AdventureTarget }> {
  if (s.target === "adjacentMonster") {
    return Object.values(state.monsters)
      .filter((m) => chebyshev(m.x, m.y, hero.x, hero.y) === 1)
      .map((m) => ({
        label: `${m.count} ${m.creature} at ${m.x},${m.y}`,
        target: { monsterId: m.id },
      }));
  }
  if (s.target === "sealed") {
    const range = 6 + power;
    const heroes = state.heroes
      .filter(
        (h) =>
          h.alive &&
          h.owner !== hero.owner &&
          chebyshev(h.x, h.y, hero.x, hero.y) <= range,
      )
      .map((h) => ({ label: h.name, target: { heroId: h.id } }));
    const sites = state.map.objects
      .filter(
        (o) =>
          o.data.sealed === true &&
          chebyshev(o.x, o.y, hero.x, hero.y) <= range,
      )
      .map((o) => ({ label: o.id, target: { objectId: o.id } }));
    return [...heroes, ...sites];
  }
  return [];
}

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
      const err = adventureCastError(state, hero, s.id, scroll);
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
          el("div", s.text(power)),
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
      else if (s.target === "exploredCell") {
        const b = el("button.gm-btn", "Choose a cell…");
        b.type = "button";
        b.disabled = err !== null;
        b.addEventListener("click", () =>
          finish({ kind: "aim", spell: s.id, scroll }),
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
        pick({});
      } else {
        const opts = targetOptions(state, hero, s, power);
        if (opts.length === 0)
          actions.append(el("span.gm-dim", "No target in range."));
        for (const o of opts) pick(o.target, o.label);
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
          "div.gm-dim",
          battle
            .map((id) => {
              const d = spellDef(id);
              return `${d.name} (${NAMES[d.school]} ${d.tier}, ${d.mana})`;
            })
            .join(" · "),
        ),
      );
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
