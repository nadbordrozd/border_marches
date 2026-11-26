/**
 * The magic wheel (bead border_marches-bzc.100), after the tavern wheel of
 * Heroes IV: one picture of the whole magic system. The five schools sit
 * around a ring in their colours, each in its spell frame; neighbours are
 * joined by the gold ring (allied), schools across by the red star
 * (opposed). Each faction sits outside the ring towards the schools its
 * Magic Guild teaches, tied to its main ones, with pips for every school;
 * the Lost World, without magic, stands apart. Every school, link and
 * faction is a button with a hover and focus card and lights what it
 * touches; a click keeps it lit.
 *
 * Opened from the spellbook's "Schools of magic" ribbon
 * ({@link installMagicWheel}), the hero sheet and the new-game faction
 * column ({@link magicWheelButton}). The model is magic-wheel-model.ts.
 */

import type { School } from "../core/battle/index.ts";
import type { FactionId } from "../data/types.ts";
import { dialog } from "./dialog.ts";
import { el, imageUrl } from "./dom.ts";
import { iconElement } from "./icons.ts";
import {
  FRAME_SIZE,
  frameKey,
  HOLES,
  setSchoolsOfMagic,
} from "./spellbook-spread.ts";
import type { SchoolRanks } from "./spellbook-spread.ts";
import { setTip, tipCard } from "./tooltip.ts";
import { magicWheelModel, pairName, rankWords } from "./magic-wheel-model.ts";
import type {
  MagicWheelModel,
  WheelFaction,
  WheelLink,
  WheelSchool,
} from "./magic-wheel-model.ts";
import "./magic-wheel.css";

/** Who the wheel is opened for: gilds the hero's schools, rings a faction. */
export interface WheelContext {
  /** The hero's school ranks: a gilded frame and pips where it has rank. */
  readonly ranks?: SchoolRanks;
  /** The faction to ring (the picked one, or the hero's). */
  readonly faction?: FactionId;
  /** The hero's name, for the caption ("Aldric's schools are gilded"). */
  readonly who?: string;
}

// ------------------------------------------------------------ geometry

/** The stage in design pixels; the dialog zooms it to fit the window. */
export const STAGE_W = 800;
export const STAGE_H = 600;
const CX = 400;
const CY = 292;
/** Outer edge of the gold rim, the coloured wedges, the school ring. */
const R_RIM = 232;
const R_WEDGE = 220;
const R_RING = 150;
/** Where the faction portraits sit. */
const R_FACTION = 280;
/** A faction's main schools (tied by a line when nothing is lit). */
export const MAIN_WEIGHT = 3;

/** The point at `deg` clockwise from the top, `r` from the centre. */
export function polar(deg: number, r: number): { x: number; y: number } {
  const a = (deg * Math.PI) / 180;
  return { x: CX + r * Math.sin(a), y: CY - r * Math.cos(a) };
}

/** Where the Lost World and other factions without magic stand. */
function apartPoint(i: number): { x: number; y: number } {
  return { x: 600 - i * 70, y: 548 };
}

// ------------------------------------------------------------ svg

const NS = "http://www.w3.org/2000/svg";

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Readonly<Record<string, string | number>>,
  ...children: SVGElement[]
): SVGElementTagNameMap[K] {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  n.append(...children);
  return n;
}

function fmt(n: number): string {
  return n.toFixed(1);
}

function wedgePath(deg: number): string {
  const half = 36;
  const a = polar(deg - half, R_WEDGE);
  const b = polar(deg + half, R_WEDGE);
  return `M${CX},${CY} L${fmt(a.x)},${fmt(a.y)} A${R_WEDGE},${R_WEDGE} 0 0 1 ${fmt(b.x)},${fmt(b.y)} Z`;
}

function arcPath(from: number, to: number, r: number): string {
  const a = polar(from, r);
  const b = polar(to, r);
  return `M${fmt(a.x)},${fmt(a.y)} A${r},${r} 0 0 1 ${fmt(b.x)},${fmt(b.y)}`;
}

// ------------------------------------------------------------ words

function names(model: MagicWheelModel, list: readonly School[]): string {
  return list
    .map((s) => model.schools.find((x) => x.id === s)?.name ?? s)
    .join(" and ");
}

function schoolOf(model: MagicWheelModel, id: School): WheelSchool {
  const s = model.schools.find((x) => x.id === id);
  if (s === undefined) throw new Error(`no school ${id}`);
  return s;
}

function factionName(model: MagicWheelModel, id: FactionId): string {
  return model.factions.find((f) => f.id === id)?.name ?? id;
}

/** "●●●○" for a weight out of 4. */
export function pipText(weight: number): string {
  return "●".repeat(weight) + "○".repeat(Math.max(0, 4 - weight));
}

/**
 * The wheel's hover card: a tip card without keyword boxes beside it (the
 * card already explains the schools, Echo and Fuel it names, and the boxes
 * would cover the caption and the wheel), so one card shows at a time.
 */
export function wheelTip(...args: Parameters<typeof tipCard>): HTMLElement {
  const card = tipCard(...args);
  card.setAttribute("data-kw-skip", "");
  card.classList.add("mw-tip");
  return card;
}

function schoolCard(
  model: MagicWheelModel,
  s: WheelSchool,
  ctx: WheelContext,
): HTMLElement {
  const rank = ctx.ranks?.[s.id];
  return wheelTip(
    s.name,
    [
      s.theme,
      el(
        "div.gm-tip-line",
        el("b.mw-tip-allied", "Allied "),
        `with ${names(model, s.allied)}: neighbours on the wheel. Echo keeps their conditions a round longer.`,
      ),
      el(
        "div.gm-tip-line",
        el("b.mw-tip-opposed", "Opposed "),
        `to ${names(model, s.opposed)}: across the wheel. Fuel burns their conditions to double a spell.`,
      ),
      el(
        "div.gm-tip-line",
        el("b", `Rank (${s.skill}): `),
        model.ranks.map((r) => `${r.rank} ${rankWords(r)}`).join(" · "),
      ),
      s.leaners.length === 0
        ? null
        : el(
            "div.gm-tip-line",
            el("b", "Guilds: "),
            s.leaners
              .map(
                (l) => `${factionName(model, l.faction)} ${pipText(l.weight)}`,
              )
              .join(", "),
          ),
      rank === undefined
        ? null
        : el(
            "div.gm-tip-line.gm-tip-dim",
            rank > 0
              ? `${ctx.who ?? "Your hero"}: ${s.name} rank ${rank} (gilded frame).`
              : `${ctx.who ?? "Your hero"}: no ${s.name} rank.`,
          ),
    ],
    {
      icon: iconElement("school", s.id, { framed: false }),
      subtitle: "School of magic",
    },
  );
}

function linkCard(model: MagicWheelModel, l: WheelLink): HTMLElement {
  const pair = pairName(l.a, l.b);
  if (l.kind === "allied")
    return wheelTip(
      `${pair}: allied`,
      [
        "Neighbours on the wheel (the gold ring).",
        el("div.gm-tip-line", el("b", "Echo: "), model.echo),
        "Level-ups offer a school allied to one the hero holds twice as often.",
      ],
      { subtitle: "Allied schools", className: "mw-tip-link-allied" },
    );
  const glove = model.opposedArtifacts;
  return wheelTip(
    `${pair}: opposed`,
    [
      "Across the wheel (the red star).",
      el("div.gm-tip-line", el("b", "Fuel: "), model.fuel),
      "Level-ups offer a school opposed to one the hero holds half as often.",
      glove.length === 0
        ? null
        : el(
            "div.gm-tip-line",
            el("b", "Artifacts that pay for it: "),
            glove.map((a) => a.name).join(", "),
            ". ",
            glove[0]?.text ?? "",
          ),
    ],
    { subtitle: "Opposed schools", className: "mw-tip-link-opposed" },
  );
}

function factionCard(model: MagicWheelModel, f: WheelFaction): HTMLElement {
  const portrait = el("img.mw-tip-portrait");
  portrait.src = imageUrl(f.hero.portrait);
  portrait.alt = "";
  if (!f.magical)
    return wheelTip(
      f.name,
      [
        "No Magic Guild in its towns: its spells come only from what it finds.",
        `Its hero, the ${f.hero.name}, is a might hero.`,
        f.playable
          ? null
          : el("div.gm-tip-line.gm-tip-dim", "Not playable in this version."),
      ],
      { icon: portrait, subtitle: "Without magic" },
    );
  const never = model.schools.filter((s) => f.weights[s.id] === 0);
  return wheelTip(
    f.name,
    [
      el(
        "div.gm-tip-line",
        el("b", "Its guild teaches: "),
        f.schools
          .map((s) => `${schoolOf(model, s).name} ${pipText(f.weights[s])}`)
          .join(", "),
      ),
      never.length === 0
        ? null
        : `Never ${never.map((s) => s.name).join(" or ")}: learn those at shrines or in captured towns.`,
      el(
        "div.gm-tip-line.gm-tip-dim",
        "Pips: how often the guild draws that school's spells (out of 4).",
      ),
      f.hero.school === null
        ? null
        : `Magic hero: the ${f.hero.name}, starting with ${schoolOf(model, f.hero.school).name} rank 1.`,
      f.playable
        ? null
        : el("div.gm-tip-line.gm-tip-dim", "Not playable in this version."),
    ],
    { icon: portrait, subtitle: `Magic Guild up to level ${f.guildCap}` },
  );
}

/** The caption beside the wheel: how to read it. */
function caption(ctx: WheelContext): HTMLElement {
  const item = (swatch: string, head: string, text: string): HTMLElement =>
    el(
      "li.mw-key",
      el(`span.mw-swatch.mw-swatch-${swatch}`),
      el("span.mw-key-text", el("b", head), " ", text),
    );
  const list = el(
    "ul.mw-keys",
    item(
      "allied",
      "Allied:",
      "neighbours on the gold ring. Echo keeps an allied condition a round longer.",
    ),
    item(
      "opposed",
      "Opposed:",
      "across, on the red star. Fuel burns an opposed condition to double a spell.",
    ),
    item(
      "faction",
      "Factions",
      "sit by the schools their Magic Guild teaches; lines tie the main ones, pips count all.",
    ),
    item(
      "apart",
      "The Lost World",
      "stands apart: no Magic Guild, a might hero.",
    ),
  );
  if (ctx.ranks !== undefined)
    list.append(
      item(
        "gilded",
        "Gilded frame:",
        `${ctx.who ?? "your hero"} has rank in that school; pips show it.`,
      ),
    );
  return el(
    "aside.mw-aside",
    el("h3.mw-aside-title", "How to read it"),
    el(
      "p.mw-lead",
      "Five schools of magic around one wheel; each faction leans on some of them.",
    ),
    list,
    el(
      "p.mw-hint",
      "Point at or Tab to a school, a line's badge or a faction for details; click to keep it lit.",
    ),
  );
}

// ------------------------------------------------------------ the stage

/** The school's medallion: parchment, its frame, its icon (as the book). */
function schoolMedal(school: School, gilded: boolean): HTMLElement {
  const scale = 2;
  const size = FRAME_SIZE * scale;
  const m = el("span.mw-medal");
  m.style.width = `${size}px`;
  m.style.height = `${size}px`;
  const hole = HOLES[school];
  const parch = el("span.mw-parch");
  parch.style.left = `${hole.x * scale}px`;
  parch.style.top = `${hole.y * scale}px`;
  parch.style.width = `${hole.width * scale}px`;
  parch.style.height = `${hole.height * scale}px`;
  const frame = el("img.mw-frame");
  frame.src = imageUrl(frameKey(school, gilded));
  frame.width = size;
  frame.height = size;
  frame.alt = "";
  frame.draggable = false;
  const icon = iconElement("school", school, {
    scale,
    className: "mw-icon",
    framed: false,
  });
  icon.removeAttribute("title");
  m.append(parch, frame, icon);
  return m;
}

function place(node: HTMLElement, x: number, y: number): void {
  node.style.left = `${fmt(x)}px`;
  node.style.top = `${fmt(y)}px`;
}

/** The wheel's DOM (unattached): the stage and the caption. */
export function magicWheelView(
  model: MagicWheelModel,
  ctx: WheelContext = {},
): HTMLElement {
  const root = el("div.mw");
  const stage = el("div.mw-stage");
  stage.style.width = `${STAGE_W}px`;
  stage.style.height = `${STAGE_H}px`;

  // Highlighting: each part carries tags; lighting a set of tags dims the
  // rest of the parts.
  const parts: Array<{ node: Element; tags: ReadonlySet<string> }> = [];
  const tag = (node: Element, ...tags: string[]): void => {
    node.setAttribute("data-hl", "");
    parts.push({ node, tags: new Set(tags) });
  };
  let locked: string[] | null = null;
  let lockedBy: Element | null = null;
  const light = (tags: readonly string[] | null): void => {
    const on = new Set(tags ?? []);
    root.classList.toggle("mw-lit", tags !== null);
    for (const p of parts) {
      const hits = [...p.tags].filter((t) => on.has(t));
      p.node.classList.toggle("mw-on", tags !== null && hits.length > 0);
      // A school lit as the partner of another: gold allied, red opposed.
      p.node.classList.toggle(
        "mw-as-allied",
        hits.some((t) => t.startsWith("allied-of:")),
      );
      p.node.classList.toggle(
        "mw-as-opposed",
        hits.some((t) => t.startsWith("opposed-of:")),
      );
    }
  };
  const interactive = (node: HTMLElement, tags: string[]): void => {
    const enter = (): void => light(tags);
    const leave = (): void => light(locked);
    node.addEventListener("pointerenter", enter);
    node.addEventListener("focus", enter);
    node.addEventListener("pointerleave", leave);
    node.addEventListener("blur", leave);
    node.addEventListener("click", () => {
      if (lockedBy === node) {
        locked = null;
        lockedBy = null;
        node.setAttribute("aria-pressed", "false");
      } else {
        lockedBy?.setAttribute("aria-pressed", "false");
        locked = tags;
        lockedBy = node;
        node.setAttribute("aria-pressed", "true");
      }
      light(locked ?? tags);
    });
    node.setAttribute("aria-pressed", "false");
  };

  // ---- the drawing: wedges, rim, ring, star, tethers
  const draw = svg("svg", {
    class: "mw-svg",
    viewBox: `0 0 ${STAGE_W} ${STAGE_H}`,
    width: STAGE_W,
    height: STAGE_H,
    "aria-hidden": "true",
  });
  const defs = svg("defs", {});
  for (const s of model.schools) {
    defs.append(
      svg(
        "radialGradient",
        {
          id: `mw-grad-${s.id}`,
          cx: CX,
          cy: CY,
          r: R_WEDGE,
          gradientUnits: "userSpaceOnUse",
        },
        svg("stop", {
          offset: "0%",
          "stop-color": s.colour,
          "stop-opacity": 0.12,
        }),
        svg("stop", {
          offset: "55%",
          "stop-color": s.colour,
          "stop-opacity": 0.42,
        }),
        svg("stop", {
          offset: "100%",
          "stop-color": s.colour,
          "stop-opacity": 0.8,
        }),
      ),
    );
  }
  draw.append(defs);
  draw.append(
    svg("circle", { cx: CX, cy: CY, r: R_RIM + 6, class: "mw-shadow" }),
    svg("circle", { cx: CX, cy: CY, r: R_WEDGE, class: "mw-disc" }),
  );
  const wedges = svg("g", { class: "mw-wedges" });
  for (const s of model.schools) {
    const w = svg("path", {
      d: wedgePath(s.angle),
      fill: `url(#mw-grad-${s.id})`,
      class: "mw-wedge",
    });
    tag(w, `school:${s.id}`);
    wedges.append(w);
  }
  for (const s of model.schools) {
    const a = polar(s.angle + 36, R_WEDGE);
    wedges.append(
      svg("line", {
        x1: CX,
        y1: CY,
        x2: fmt(a.x),
        y2: fmt(a.y),
        class: "mw-spoke",
      }),
    );
  }
  draw.append(wedges);
  draw.append(
    svg("circle", { cx: CX, cy: CY, r: R_RIM - 6, class: "mw-rim" }),
    svg("circle", { cx: CX, cy: CY, r: R_RIM - 6, class: "mw-rim-braid" }),
    svg("circle", { cx: CX, cy: CY, r: R_RIM, class: "mw-rim-edge" }),
    svg("circle", { cx: CX, cy: CY, r: R_WEDGE, class: "mw-rim-edge" }),
  );

  // Tethers under the links: faction to school, width by weight.
  const tethers = svg("g", { class: "mw-tethers" });
  const magical = model.factions.filter((f) => f.magical);
  for (const f of magical) {
    const p = polar(f.angle ?? 0, R_FACTION);
    for (const sid of f.schools) {
      const s = schoolOf(model, sid);
      const q = polar(s.angle, R_RING);
      const weight = f.weights[sid];
      const g = svg(
        "g",
        {
          class: `mw-tether${weight < MAIN_WEIGHT ? " mw-minor" : ""}`,
          "data-faction": f.id,
          "data-school": sid,
        },
        svg("line", {
          x1: fmt(p.x),
          y1: fmt(p.y),
          x2: fmt(q.x),
          y2: fmt(q.y),
          class: "mw-tether-under",
          "stroke-width": 3 + weight * 2,
        }),
        svg("line", {
          x1: fmt(p.x),
          y1: fmt(p.y),
          x2: fmt(q.x),
          y2: fmt(q.y),
          stroke: f.colour,
          "stroke-width": 1 + weight * 2,
          class: "mw-tether-line",
        }),
      );
      tag(g, `faction:${f.id}`, `school:${sid}:${f.id}`);
      tethers.append(g);
    }
  }
  draw.append(tethers);

  // The links: allied arcs on the ring, opposed chords across.
  const links = svg("g", { class: "mw-links" });
  const linkKey = (l: WheelLink): string => `link:${l.a}-${l.b}`;
  const opposed = model.links.filter((l) => l.kind === "opposed");
  const allied = model.links.filter((l) => l.kind === "allied");
  for (const l of opposed) {
    const a = polar(schoolOf(model, l.a).angle, R_RING);
    const b = polar(schoolOf(model, l.b).angle, R_RING);
    const g = svg(
      "g",
      { class: "mw-link mw-opposed" },
      svg("line", {
        x1: fmt(a.x),
        y1: fmt(a.y),
        x2: fmt(b.x),
        y2: fmt(b.y),
        class: "mw-opposed-under",
      }),
      svg("line", {
        x1: fmt(a.x),
        y1: fmt(a.y),
        x2: fmt(b.x),
        y2: fmt(b.y),
        class: "mw-opposed-line",
      }),
    );
    tag(g, linkKey(l), "kind:opposed");
    links.append(g);
  }
  for (const l of allied) {
    let from = schoolOf(model, l.a).angle;
    let to = schoolOf(model, l.b).angle;
    // Clockwise from one to the next (Storm to Bloom wraps).
    if ((to - from + 360) % 360 > 180) [from, to] = [to, from];
    if (to < from) to += 360;
    const d = arcPath(from, to, R_RING);
    const g = svg(
      "g",
      { class: "mw-link mw-allied" },
      svg("path", { d, class: "mw-allied-under" }),
      svg("path", { d, class: "mw-allied-line" }),
      svg("path", { d, class: "mw-allied-shine" }),
    );
    tag(g, linkKey(l), "kind:allied");
    links.append(g);
  }
  draw.append(links);
  draw.append(
    svg("circle", { cx: CX, cy: CY, r: 20, class: "mw-hub" }),
    svg("circle", { cx: CX, cy: CY, r: 7, class: "mw-hub-pin" }),
  );
  stage.append(draw);

  // ---- link badges (buttons): allied on the ring between the two,
  // opposed where the chord passes nearest the centre.
  for (const l of model.links) {
    const sa = schoolOf(model, l.a);
    const sb = schoolOf(model, l.b);
    let mid: { x: number; y: number };
    if (l.kind === "allied") {
      let from = sa.angle;
      let to = sb.angle;
      if ((to - from + 360) % 360 > 180) [from, to] = [to, from];
      if (to < from) to += 360;
      mid = polar((from + to) / 2, R_RING);
    } else {
      const a = polar(sa.angle, R_RING);
      const b = polar(sb.angle, R_RING);
      mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
    const b = el(
      `button.mw-badge.mw-badge-${l.kind}`,
      l.kind === "allied" ? "+" : "×",
    );
    b.type = "button";
    b.dataset["link"] = `${l.a}-${l.b}`;
    b.setAttribute(
      "aria-label",
      `${pairName(l.a, l.b)}: ${l.kind === "allied" ? "allied" : "opposed"}`,
    );
    place(b, mid.x, mid.y);
    setTip(b, () => linkCard(model, l));
    tag(b, linkKey(l));
    interactive(b, [linkKey(l), `school:${l.a}`, `school:${l.b}`]);
    stage.append(b);
  }

  // ---- school medallions
  for (const s of model.schools) {
    const rank = ctx.ranks?.[s.id] ?? 0;
    const p = polar(s.angle, R_RING);
    const b = el("button.mw-school", schoolMedal(s.id, rank > 0));
    b.type = "button";
    b.dataset["school"] = s.id;
    b.style.setProperty("--mw-school", s.colour);
    const label = el("span.mw-school-name", s.name);
    if (rank > 0) {
      const pips = el("span.mw-rank-pips");
      for (let i = 0; i < Math.min(3, rank); i++)
        pips.append(el("span.mw-rank-pip"));
      label.append(pips);
      b.classList.add("mw-ranked");
    }
    b.append(label);
    b.setAttribute(
      "aria-label",
      `${s.name}${rank > 0 ? `, rank ${rank}` : ""}: allied with ${names(model, s.allied)}, opposed to ${names(model, s.opposed)}`,
    );
    place(b, p.x, p.y);
    setTip(b, () => schoolCard(model, s, ctx));
    const touching = model.links
      .filter((l) => l.a === s.id || l.b === s.id)
      .map(linkKey);
    tag(
      b,
      `school:${s.id}`,
      ...s.allied.map((x) => `allied-of:${x}`),
      ...s.opposed.map((x) => `opposed-of:${x}`),
    );
    interactive(b, [
      `school:${s.id}`,
      `allied-of:${s.id}`,
      `opposed-of:${s.id}`,
      ...touching,
      ...s.leaners.map((l) => `school:${s.id}:${l.faction}`),
      ...s.leaners.map((l) => `faction:${l.faction}:portrait`),
    ]);
    stage.append(b);
  }

  // ---- factions
  const apart = model.factions.filter((f) => !f.magical);
  if (apart.length > 0) {
    const box = el("div.mw-apart");
    box.append(el("span.mw-apart-label", "Without magic"));
    stage.append(box);
  }
  const factionNode = (f: WheelFaction, x: number, y: number): void => {
    const portrait = el("img.mw-portrait");
    portrait.src = imageUrl(f.hero.portrait);
    portrait.width = 48;
    portrait.height = 48;
    portrait.alt = "";
    portrait.draggable = false;
    const b = el("button.mw-faction", el("span.mw-ring", portrait));
    b.type = "button";
    b.dataset["faction"] = f.id;
    b.style.setProperty("--mw-faction", f.colour);
    if (!f.magical) b.classList.add("mw-nomagic");
    if (ctx.faction === f.id) b.classList.add("mw-chosen");
    const left = x < CX && f.magical;
    const card = el(`span.mw-fcard${left ? ".mw-fcard-left" : ""}`);
    card.append(el("span.mw-fname", f.name));
    if (f.magical) {
      const grid = el("span.mw-pips");
      for (const sid of f.schools) {
        const icon = iconElement("school", sid, { framed: false });
        icon.removeAttribute("title");
        grid.append(
          el(
            "span.mw-pip-row",
            icon,
            el("span.mw-pip-dots", pipText(f.weights[sid])),
          ),
        );
      }
      card.append(grid, el("span.mw-fnote", `Guild to level ${f.guildCap}`));
    } else {
      card.append(
        el("span.mw-fnote", "No Magic Guild"),
        el("span.mw-fnote", `${f.hero.name}: might`),
      );
    }
    b.append(card);
    b.setAttribute(
      "aria-label",
      f.magical
        ? `${f.name}: its guild teaches ${f.schools
            .map((s) => `${schoolOf(model, s).name} ${f.weights[s]}`)
            .join(", ")}`
        : `${f.name}: no magic`,
    );
    place(b, x, y);
    setTip(b, () => factionCard(model, f));
    tag(b, `faction:${f.id}`, `faction:${f.id}:portrait`);
    interactive(b, [`faction:${f.id}`, ...f.schools.map((s) => `school:${s}`)]);
    stage.append(b);
  };
  for (const f of magical) {
    const p = polar(f.angle ?? 0, R_FACTION);
    factionNode(f, p.x, p.y);
  }
  apart.forEach((f, i) => {
    const p = apartPoint(i);
    factionNode(f, p.x, p.y);
  });

  const frame = el("div.mw-stage-frame", stage);
  root.append(frame, caption(ctx));
  return root;
}

// ------------------------------------------------------------ the dialog

/** Space the dialog's own parts take around the stage. */
const CHROME_H = 160;
const ASIDE_W = 250;
const CHROME_W = 80;

/** The stage's zoom for a window: fits it, between 0.5 and 1.5. */
export function stageZoom(vw: number, vh: number): number {
  const z = Math.min(
    (vw - CHROME_W - ASIDE_W) / STAGE_W,
    (vh - CHROME_H) / STAGE_H,
  );
  return Math.max(0.5, Math.min(1.5, Math.floor(z * 20) / 20));
}

/** Opens the wheel as a dialog; resolves when it closes (Escape, Close). */
export function openMagicWheel(ctx: WheelContext = {}): Promise<void> {
  const view = magicWheelView(magicWheelModel(), ctx);
  const frame = view.querySelector<HTMLElement>(".mw-stage-frame");
  const stage = view.querySelector<HTMLElement>(".mw-stage");
  const fit = (): void => {
    if (frame === null || stage === null) return;
    const z = stageZoom(window.innerWidth, window.innerHeight);
    stage.style.transform = `scale(${z})`;
    frame.style.width = `${Math.round(STAGE_W * z)}px`;
    frame.style.height = `${Math.round(STAGE_H * z)}px`;
  };
  fit();
  window.addEventListener("resize", fit);
  return dialog<undefined>({
    title: "The wheel of magic",
    body: view,
    buttons: [{ label: "Close", value: undefined, primary: true }],
    cancel: undefined,
    className: "mw-dialog",
  }).then(() => {
    window.removeEventListener("resize", fit);
  });
}

/**
 * A small button that opens the wheel, for the hero sheet and the setup
 * screen; `context` is read when it is pressed.
 */
export function magicWheelButton(
  context: () => WheelContext = () => ({}),
  label = "Magic wheel",
): HTMLButtonElement {
  const b = el(
    "button.gm-btn.mw-open",
    el("span.mw-open-mark", el("span.mw-open-star")),
    el("span.mw-open-label", label),
  );
  b.type = "button";
  b.setAttribute("aria-label", label);
  b.addEventListener("click", () => void openMagicWheel(context()));
  setTip(b, () =>
    wheelTip("The wheel of magic", [
      "The five schools, which are allied and which opposed, and where each faction's Magic Guild leans.",
    ]),
  );
  return b;
}

/** Gives every spellbook opened from now on its "Schools of magic" ribbon. */
export function installMagicWheel(): void {
  setSchoolsOfMagic((ranks) => void openMagicWheel({ ranks }));
}
