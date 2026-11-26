/**
 * Inspectable things in dialogs (bead bzc.108): whenever an artifact is
 * found, won or bought, and whenever a skill or spell is gained or offered,
 * its dialog shows it as a tile with the same icon and the same card the
 * hero sheet, the backpack and the spellbook show. The cards are those
 * screens' own builders (artifactTipCard, skillTipCard, spellTip,
 * statTipCard), never a second copy of the text. A tile opens its card on
 * hover and keyboard focus, and pins it on a click, a tap or Enter
 * (setInspect in tooltip.ts).
 */
import { iconFor } from "../assets/icons.ts";
import { el } from "./dom.ts";
import { artifactTipCard, skillTipCard, statTipCard } from "./hero-screen.ts";
import { iconElement } from "./icons.ts";
import { spellTip } from "./info-tips.ts";
import { setInspect, type TipBody } from "./tooltip.ts";
import type { VisitIcon } from "./visit-results.ts";

/** The card of an inspectable thing: the inventory's or spellbook's own. */
export function inspectCard(icon: VisitIcon): TipBody {
  switch (icon.kind) {
    case "artifact":
      return artifactTipCard(icon.id);
    case "skill":
      return skillTipCard(icon.id, icon.rank ?? 1);
    case "spell":
      return spellTip(icon.id);
    case "stat":
      return statTipCard(icon.id);
    default:
      return iconFor(icon.kind, icon.id).name;
  }
}

/** "artifact:galoshes": what a tile inspects (tests, the browser check). */
export function inspectKey(icon: VisitIcon): string {
  return `${icon.kind}:${icon.id}`;
}

/**
 * The bare icon, inspectable: a choice row's picture. `focusable` false
 * when the row around it takes the focus (and shows the card itself).
 */
export function inspectIcon(
  icon: VisitIcon,
  options: { scale?: number; focusable?: boolean } = {},
): HTMLElement {
  const node = iconElement(icon.kind, icon.id, { scale: options.scale ?? 1 });
  node.removeAttribute("title");
  node.classList.add("gm-inspect");
  setInspect(node, () => inspectCard(icon), inspectKey(icon));
  if (options.focusable === false) node.tabIndex = -1;
  node.setAttribute(
    "aria-label",
    `${iconFor(icon.kind, icon.id).name}: details`,
  );
  return node;
}

/**
 * A result dialog's tile: the icon at 2x with the name under it, a button
 * that shows the thing's card on hover and focus and pins it on a click.
 */
export function inspectTile(icon: VisitIcon): HTMLElement {
  const name = iconFor(icon.kind, icon.id).name;
  const art = iconElement(icon.kind, icon.id, { scale: 2 });
  art.removeAttribute("title");
  const tile = el(
    "button.gm-result-icon.gm-inspect",
    art,
    el("span.gm-result-name", name),
  );
  tile.setAttribute("type", "button");
  tile.setAttribute("aria-label", `${name}: details`);
  return setInspect(tile, () => inspectCard(icon), inspectKey(icon));
}

/** A row of tiles, as result and learnt dialogs show what they gave. */
export function inspectTiles(icons: readonly VisitIcon[]): HTMLElement {
  return el("div.gm-result-icons", ...icons.map(inspectTile));
}
