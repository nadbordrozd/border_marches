/**
 * The hover card of a stack's conditions (UI_V2 UI2-04): one row per
 * condition with its icon, name, "Bloom bane, size 3, 2 rounds left" and
 * what it does now, in the order its badges are drawn (Holds, links, banes,
 * boons), with the keyword boxes (bead bzc.46) of the conditions and the
 * terms their texts use beside it.
 */
import {
  conditionKind,
  isAdjacent,
  pendingShells,
  sameHex,
} from "../../core/battle/index.ts";
import type {
  BattleStack,
  BattleState,
  GroundFeature,
  Hex,
} from "../../core/battle/index.ts";
import { MARKER_ICONS } from "../../assets/icons.ts";
import { assetUrl } from "../../assets/manifest.ts";
import { badgeOrder, pipOf } from "../../render/battle/grammar-view.ts";
import { el } from "../dom.ts";
import { iconElement } from "../icons.ts";
import { highlightKeywords, keywordColumn } from "../keywords.ts";
import { conditionParts, groundTooltip } from "./grammar.ts";
import { creatureName } from "./preview.ts";

/** Keyword boxes beside the card at most (the field stays visible). */
export const CONDITION_CARD_BOXES = 3;

/**
 * The shells in the air that will hit `hex` (FACTION_DWARVES 5, Lob): one
 * line each, for the target hex or a hex of its splash.
 */
export function shellLines(state: BattleState, hex: Hex): string[] {
  const out: string[] = [];
  for (const p of pendingShells(state)) {
    const by = state.stacks.find((x) => x.id === p.stackId);
    const who = by ? `the ${creatureName(by.creature, by.count)}'` : "a";
    if (sameHex(p.hex, hex))
      out.push(
        `Shell: ${who} shell lands here at the start of round ${p.round}, a shot on whatever stands here, friend or foe.`,
      );
    else if (isAdjacent(p.hex, hex))
      out.push(
        `Splash: ${who} shell lands next door at the start of round ${p.round}; half a shot on whatever stands here.`,
      );
  }
  return out;
}

/** The conditions of `stack` (and the ground under it) as a hover card. */
export function conditionCard(
  state: BattleState,
  stack: BattleStack | null,
  ground: GroundFeature | null,
  hex: Hex | null = null,
): HTMLElement | null {
  const rows: HTMLElement[] = [];
  if (stack) {
    const order = badgeOrder(stack.conditions.map((c) => ({ ...pipOf(c), c })));
    for (const { c } of order) {
      const p = conditionParts(state, c);
      const def = conditionKind(c.kind);
      const icon = iconElement("condition", c.kind, { framed: false });
      icon.removeAttribute("title");
      const meta = el("span.bm-cond-meta", ` · ${p.meta}`);
      meta.dataset["kwSkip"] = "";
      const row = el(
        "div.bm-cond-row",
        icon,
        el(
          "div.bm-cond-body",
          el(
            "div.bm-cond-head",
            el(`span.bm-cond-name.bm-cond-${def.polarity}`, p.name),
            meta,
          ),
          el("div.bm-cond-text", p.text),
        ),
      );
      row.dataset["condition"] = c.kind;
      rows.push(row);
    }
    if (stack.wary > 0)
      rows.push(
        el(
          "div.bm-cond-row.bm-cond-plain",
          el("div.bm-cond-text", `Wary: refuses Holds (${stack.wary})`),
        ),
      );
  }
  if (ground && ground.class !== "blocking")
    rows.push(
      el(
        "div.bm-cond-row.bm-cond-plain",
        el("div.bm-cond-text", groundTooltip(ground)),
      ),
    );
  for (const line of hex === null ? [] : shellLines(state, hex)) {
    const img = el("img");
    img.src = assetUrl(MARKER_ICONS.shell[16], import.meta.env.BASE_URL);
    img.alt = "";
    img.width = 16;
    img.height = 16;
    rows.push(
      el(
        "div.bm-cond-row.bm-cond-shell",
        el("span.gm-icon", img),
        el("div.bm-cond-text", line),
      ),
    );
  }
  if (rows.length === 0) return null;
  const card = el("div.bm-cond-card", ...rows);
  // The names are the conditions' own keywords; the meta line is skipped so
  // the boxes explain the conditions and their effects, not "size" or a
  // school on every hover.
  const found = highlightKeywords(card);
  const kinds = new Set((stack?.conditions ?? []).map((c) => c.kind));
  // The stack's conditions' own boxes first (rows are in badge order, so
  // they are found in that order), then the terms their texts use.
  const ids = [
    ...found.filter((id) => kinds.has(id)),
    ...found.filter((id) => !kinds.has(id)),
  ];
  const col = keywordColumn(ids, CONDITION_CARD_BOXES);
  return el(
    "div.gm-kw-wrap",
    el("div.gm-kw-main", card),
    ...(col === null ? [] : [col]),
  );
}
