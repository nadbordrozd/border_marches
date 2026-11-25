/**
 * Keywords in rules text, Slay the Spire style (bead border_marches-bzc.46):
 * the words of the glossary (src/data/keywords.ts) are highlighted wherever
 * rules text is shown, and a tooltip that mentions any lists their
 * definitions in boxes beside it, with the keywords those definitions use
 * one level down.
 *
 *   - `rulesText(text)` builds a span with the keywords highlighted; with
 *     `hover` each keyword shows its own box on hover (panels that are not
 *     themselves tooltips: the battle info panel, the cast panel);
 *   - `highlightKeywords(node)` highlights the text already inside a node;
 *   - `withKeywordBoxes(card)` highlights a tooltip card and returns it with
 *     the column of boxes beside it. The shared tooltip (tooltip.ts) does
 *     this for every card it shows, so every hover card in the game gets it.
 */
import { iconFor } from "../assets/icons.ts";
import {
  explainKeywords,
  findKeywords,
  keyword,
  type KeywordDef,
} from "../data/keywords.ts";
import { el } from "./dom.ts";
import { iconElement } from "./icons.ts";
import "./keywords.css";

const SCHOOL_TONE: Readonly<Record<string, string>> = {
  "school-bloom": "#8fd06a",
  "school-accord": "#e9c75a",
  "school-clock": "#7fb0ee",
  "school-hush": "#b597e4",
  "school-storm": "#ef8a5c",
};

/** Text inside these is never highlighted: titles, names, keywords. */
const SKIP =
  ".gm-tip-head, .gm-tip-ability, .gm-kw, .gm-kw-box, [data-kw-skip]";

/** Boxes shown beside one card at most. */
export const MAX_BOXES = 6;

function keywordSpan(id: string, word: string, hover: boolean): HTMLElement {
  const def = keyword(id);
  const span = el("span.gm-kw", word);
  span.dataset["kw"] = id;
  if (def.tone !== undefined) span.classList.add(`gm-kw-${def.tone}`);
  const tone = SCHOOL_TONE[id];
  if (tone !== undefined) span.style.color = tone;
  if (hover) span.dataset["kwTip"] = "";
  return span;
}

/** `text` as nodes: plain runs and keyword spans. */
function keywordNodes(text: string, hover: boolean): Node[] {
  const out: Node[] = [];
  let at = 0;
  for (const m of findKeywords(text)) {
    if (m.start > at)
      out.push(document.createTextNode(text.slice(at, m.start)));
    out.push(keywordSpan(m.id, text.slice(m.start, m.end), hover));
    at = m.end;
  }
  if (at < text.length) out.push(document.createTextNode(text.slice(at)));
  return out;
}

/**
 * A rules text with its keywords highlighted, in a `tag` element with
 * `className`. With `hover`, each keyword shows its box when pointed at.
 */
export function rulesText(
  text: string,
  options: { className?: string; tag?: "span" | "div"; hover?: boolean } = {},
): HTMLElement {
  const node = el(
    options.tag ?? "span",
    ...keywordNodes(text, options.hover ?? false),
  );
  if (options.className) node.className = options.className;
  return node;
}

/**
 * Highlights the keywords in the text under `root` (in place, idempotent)
 * and returns their ids in order of first appearance.
 */
export function highlightKeywords(root: Node, hover = false): string[] {
  const found: string[] = [];
  const texts: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
    const parent = n.parentElement;
    if (parent !== null && parent.closest(SKIP) !== null) continue;
    texts.push(n as Text);
  }
  if (root instanceof Element)
    for (const kw of root.querySelectorAll<HTMLElement>(".gm-kw[data-kw]"))
      found.push(kw.dataset["kw"] ?? "");
  for (const t of texts) {
    const value = t.nodeValue ?? "";
    if (findKeywords(value).length === 0) continue;
    const nodes = keywordNodes(value, hover);
    for (const n of nodes)
      if (n instanceof HTMLElement) found.push(n.dataset["kw"] ?? "");
    t.replaceWith(...nodes);
  }
  return [...new Set(found.filter((id) => id !== ""))];
}

/** One keyword's box: icon, term, tag line and definition. */
export function keywordBox(def: KeywordDef): HTMLElement {
  const icon =
    def.icon !== undefined && !iconFor(def.icon.kind, def.icon.id).fallback
      ? iconElement(def.icon.kind, def.icon.id, { framed: false })
      : null;
  icon?.removeAttribute("title");
  const term = el("div.gm-kw-term", def.term);
  const tone = SCHOOL_TONE[def.id];
  if (tone !== undefined) term.style.color = tone;
  else if (def.tone !== undefined) term.classList.add(`gm-kw-${def.tone}`);
  const box = el(
    "div.gm-kw-box",
    el(
      "div.gm-kw-head",
      icon,
      el(
        "div",
        term,
        def.tag === undefined ? null : el("div.gm-kw-tag", def.tag),
      ),
    ),
    rulesText(def.text, { tag: "div", className: "gm-kw-text" }),
  );
  box.dataset["kwBox"] = def.id;
  return box;
}

/** The column of boxes for keywords `ids` and, one level down, theirs. */
export function keywordColumn(
  ids: readonly string[],
  max = MAX_BOXES,
): HTMLElement | null {
  const defs = explainKeywords(ids, max);
  if (defs.length === 0) return null;
  return el("div.gm-kw-col", ...defs.map(keywordBox));
}

/** What a hovered keyword shows: its box, then those it uses. */
export function keywordCard(id: string): HTMLElement {
  return keywordColumn([id]) ?? el("div");
}

/**
 * Highlights a tooltip card's keywords and returns it with their boxes
 * beside it (or the card alone when it mentions none).
 */
export function withKeywordBoxes(card: Node): Node {
  if (!(card instanceof HTMLElement)) return card;
  if (card.classList.contains("gm-kw-col")) return card;
  const ids = highlightKeywords(card);
  const col = keywordColumn(ids);
  if (col === null) return card;
  return el("div.gm-kw-wrap", el("div.gm-kw-main", card), col);
}
