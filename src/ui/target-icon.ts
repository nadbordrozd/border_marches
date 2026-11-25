/**
 * The target-type line of a spell (bead bzc.47): a small code-drawn
 * pictogram (enemy, friendly, any stack, hex, line, area, condition,
 * remains, all, self) and the plain words, shared by the battle and the
 * adventure spellbooks. Interface chrome, not content art.
 */

import type { TargetIcon, TargetKind } from "./battle/spell-targets.ts";

const SVG_NS = "http://www.w3.org/2000/svg";
const HEX = "7,1 12.2,4 12.2,10 7,13 1.8,10 1.8,4";
const ENEMY = "#e0533c";
const FRIEND = "#5aa0e6";

function node(
  tag: string,
  attrs: Readonly<Record<string, string | number>>,
): SVGElement {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

function parts(icon: TargetIcon): SVGElement[] {
  const outline = { fill: "none", stroke: "currentColor", "stroke-width": 1.2 };
  switch (icon) {
    case "enemy":
      return [node("polygon", { points: HEX, fill: ENEMY, stroke: "#1a1208" })];
    case "friendly":
      return [
        node("polygon", { points: HEX, fill: FRIEND, stroke: "#1a1208" }),
      ];
    case "stack":
      return [
        node("polygon", { points: "7,1 7,13 1.8,10 1.8,4", fill: FRIEND }),
        node("polygon", { points: "7,1 12.2,4 12.2,10 7,13", fill: ENEMY }),
        node("polygon", { points: HEX, fill: "none", stroke: "#1a1208" }),
      ];
    case "hex":
      return [node("polygon", { points: HEX, ...outline })];
    case "line":
      return [2.5, 7, 11.5].map((cx) =>
        node("circle", { cx, cy: 7, r: 2.2, ...outline }),
      );
    case "area":
      return [
        node("polygon", { points: HEX, ...outline }),
        node("circle", { cx: 7, cy: 7, r: 2.2, fill: "#ffa04a" }),
      ];
    case "condition":
      return [
        node("circle", { cx: 7, cy: 7, r: 5.2, ...outline }),
        node("circle", { cx: 7, cy: 7, r: 2.2, fill: "currentColor" }),
      ];
    case "remains":
      return [
        node("path", {
          d: "M3 3 L11 11 M11 3 L3 11",
          stroke: "currentColor",
          "stroke-width": 2,
          "stroke-linecap": "round",
        }),
      ];
    case "all":
      return [
        [4, 4.5],
        [10, 4.5],
        [7, 10],
      ].map(([cx, cy]) =>
        node("circle", {
          cx: cx as number,
          cy: cy as number,
          r: 2.6,
          fill: FRIEND,
        }),
      );
    case "self":
      return [
        node("polygon", {
          points:
            "7,1 8.8,5.2 13,5.4 9.7,8.2 10.8,12.6 7,10.2 3.2,12.6 4.3,8.2 1,5.4 5.2,5.2",
          fill: "#ffd65c",
          stroke: "#1a1208",
          "stroke-width": 0.8,
        }),
      ];
  }
}

/** A 14 px pictogram of a target type. */
export function targetIconSvg(icon: TargetIcon): SVGElement {
  const svg = node("svg", {
    viewBox: "0 0 14 14",
    width: 14,
    height: 14,
    "aria-hidden": "true",
  });
  svg.classList.add("bm-target-icon");
  svg.dataset["icon"] = icon;
  svg.append(...parts(icon));
  return svg;
}

/** "⬢ An enemy stack": the target line of a spell entry. */
export function targetLine(kind: TargetKind, className: string): HTMLElement {
  const line = document.createElement("div");
  line.className = className;
  line.dataset["target"] = kind.icon;
  const words = document.createElement("span");
  words.textContent = `Target: ${kind.label}`;
  line.append(targetIconSvg(kind.icon), words);
  return line;
}
