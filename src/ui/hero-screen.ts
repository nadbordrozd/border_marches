/**
 * Hero screens (RULES_V2 3 and 4): the hero sheet (bead bzc.82, Heroes II
 * style: every number an icon with its sources in the hover card, skills
 * and feats as icon rows, the paper doll of eleven worn slots with the
 * spellbook button under it, the backpack and the scroll case; click or
 * drag to equip; the army travelling with the hero, rearranged by clicks)
 * and the level-up draft dialog; the meeting screen (meeting.ts) reuses its pieces. Icons are
 * content icons (src/ui/icons.ts), with initials on a grade colour as the
 * fallback for content without an icon.
 */
import {
  armyLuck,
  armyMorale,
  assemblable,
  assemble,
  backpackSize,
  chooseUnspentPage,
  commandStrength,
  destroyArtifact,
  effectsOf,
  equip,
  heroSpecialty,
  heroStats,
  holdsUnspentPage,
  manaRegen,
  maxMana,
  movementBreakdown,
  patternStat,
  pendingLevel,
  SCHOOL_RANK_POWER,
  schoolRank,
  scrollCaseSize,
  sightRadius,
  specialtyText,
  statBreakdown,
  transferStack,
  unequip,
  unspentPageChoices,
  unspentPageOf,
  useConsumable,
  wearError,
  xpForLevel,
  xpPercent,
  type CommandResult,
  type GameState,
  type HeroState,
  type LevelUpOffer,
  type SkillOffer,
} from "../core/game/index.ts";
import type { ArmySlots } from "../core/game/types.ts";
import { getCreature, isCreatureId } from "../data/creatures.ts";
import {
  CONSUMABLES_PER_SLOT,
  SLOT_NAMES,
  WORN_SLOTS,
  findArtifact,
  gradeLabel,
  isCursed,
  wornDef,
  type ArtifactDef,
  type SlotKind,
} from "../data/artifacts.ts";
import {
  namedHeroPortrait,
  unitArt,
  unitPortrait,
} from "../assets/unit-art.ts";
import { COMMANDS, getHeroClass, type Specialty } from "../data/classes.ts";
import {
  PRIMARY_STATS,
  SCHOOLS,
  SCHOOL_NAMES,
  STAT_NAMES,
  type PrimaryStat,
} from "../data/effects.ts";
import { findFeat } from "../data/feats.ts";
import {
  NATIVE_MOVE_COST,
  ROAD_MOVE_COST,
  TERRAIN_MOVE_COST,
} from "../data/movement.ts";
import { MAX_SKILLS, findSkill } from "../data/skills.ts";
import { iconFor, type IconKind } from "../assets/icons.ts";
import { isSpell, spellInfo } from "../core/magic/catalog.ts";
import { button, el, img, kbd, modal, resourceIcon } from "./dom.ts";
import { iconElement } from "./icons.ts";
import { armyValue } from "./hints.ts";
import { creatureTip, spellTip } from "./info-tips.ts";
import { magicWheelButton } from "./magic-wheel.ts";
import { openAdventureBook, type BookChoice } from "./spellbook.ts";
import {
  setInspect,
  setTip,
  tipCard,
  titleCard,
  type TipBody,
} from "./tooltip.ts";
import "./hero.css";

/** What the hero screens need from the game screen. */
export interface HeroScreenHost {
  state(): GameState;
  /** Applies a command; false (with a message shown) when it failed. */
  run(result: CommandResult): boolean;
  /**
   * Whether the hero may cast adventure spells from the sheet's spellbook
   * now (the owner's turn on the map). Without it the book is read only.
   */
  canCast?(heroId: string): boolean;
}

const STAT_TEXT: Readonly<Record<PrimaryStat, string>> = {
  attack: "Added to the Attack of every stack in the hero's army.",
  defense: "Added to the Defense of every stack in the hero's army.",
  power: "The P in every spell: bigger Harm, heals and summons.",
  lore: "Maximum mana is 10 per point; each day 1 + a third of it (rounded down) returns.",
};

/** Two letters for a placeholder icon. */
function initials(name: string): string {
  const words = name
    .replace(/^(The|A|An)\s+/i, "")
    .split(/[\s-]+/)
    .filter((w) => w.length > 0);
  const a = words[0]?.[0] ?? "?";
  const b = words[1]?.[0] ?? words[0]?.[1] ?? "";
  return (a + b).toUpperCase();
}

function gradeClass(def: ArtifactDef): string {
  if (def.kind === "consumable") return "hs-consumable";
  if (def.kind === "relic") return "hs-marvel";
  if (def.pieceOf !== undefined) return "hs-piece";
  return `hs-${def.grade}`;
}

/** The tooltip text of an artifact. */
export function itemTooltip(id: string): string {
  const def = findArtifact(id);
  if (def === undefined) return id;
  const head = `${def.name} (${gradeLabel(def)}${
    def.kind === "worn" ? `, ${SLOT_NAMES[def.slot]}` : ""
  }${def.kind === "worn" && def.cursed === true ? ", CURSED" : ""})`;
  const piece =
    def.kind === "worn" && def.pieceOf !== undefined
      ? `\nPiece of ${wornDef(def.pieceOf)?.name ?? def.pieceOf}.`
      : "";
  return `${head}\n${def.text}${piece}\nValue ${def.value} gold.`;
}

/**
 * A content icon (bead bzc.17 art, src/ui/icons.ts) when the content has
 * its own, else null so the caller keeps its initials fallback.
 */
function ownIcon(kind: IconKind, id: string): HTMLElement | null {
  if (iconFor(kind, id).fallback) return null;
  const icon = iconElement(kind, id);
  icon.removeAttribute("title");
  return icon;
}

/**
 * An artifact icon: its PixelLab icon in its grade frame, or initials on
 * the grade colour when it has none.
 */
export function itemIcon(id: string, count = 1): HTMLElement {
  const def = findArtifact(id);
  const icon = ownIcon("artifact", id);
  const node =
    icon === null
      ? el("div.hs-item", initials(def?.name ?? id))
      : el("div.hs-item.hs-has-icon", icon);
  if (def !== undefined) node.classList.add(gradeClass(def));
  if (def?.kind === "worn" && def.cursed === true) {
    node.classList.add("hs-cursed");
  }
  if (count > 1) node.append(el("span.hs-count", String(count)));
  node.title = itemTooltip(id);
  return node;
}

/** A spell scroll icon: the spell's icon on parchment, or its initials. */
export function scrollIcon(spell: string): HTMLElement {
  const name = isSpell(spell) ? spellInfo(spell).name : spell;
  const icon = ownIcon("spell", spell);
  const node =
    icon === null
      ? el("div.hs-item.hs-scroll", initials(name.replace(/-/g, " ")))
      : el("div.hs-item.hs-scroll.hs-has-icon", icon);
  node.title = `Scroll: ${name}. Any hero may cast it once, at no mana.`;
  return node;
}

/**
 * An item's hover card with a last line saying what clicks do with it on
 * the hero sheet (bead bzc.69: the sheet's instruction line moved here).
 */
export function itemCard(id: string, hint: string): TipBody {
  return withHint(artifactTipCard(id), hint);
}

/**
 * An artifact's card (bead bzc.108): the backpack's and the doll's hover
 * card without the click hint, and the card a found, won or bought
 * artifact opens in its dialog. Its icon heads the card.
 */
export function artifactTipCard(id: string): TipBody {
  const [head = id, ...rest] = itemTooltip(id)
    .split("\n")
    .filter((l) => l.trim() !== "");
  if (findArtifact(id) === undefined) return titleCard(itemTooltip(id));
  return tipCard(head, rest, { icon: ownIcon("artifact", id) });
}

/** A primary stat's card: what the stat does (a stat shrine's gift). */
export function statTipCard(stat: string): TipBody {
  if (!(PRIMARY_STATS as readonly string[]).includes(stat)) return stat;
  const s = stat as PrimaryStat;
  return tipCard(`${STAT_NAMES[s]}`, [STAT_TEXT[s]], {
    icon: ownIcon("stat", s),
    subtitle: "Primary stat",
  });
}

/**
 * Which worn slots a backpack item goes in (bead bzc.108), slot by slot in
 * WORN_SLOTS order: "fits" (empty and allowed), "swap" (allowed; what is
 * there goes to the backpack), "barred" (its kind, but a vow, the one-Marvel
 * rule or a cursed item in the way forbids it) or "off" (another kind, or
 * the item is not worn at all). `target` marks the slot a double-click
 * fills (core equip's default); `why` is the line for the slot's card.
 */
export type SlotFit = "fits" | "swap" | "barred" | "off";

export interface SlotFitView {
  readonly fit: SlotFit;
  readonly target: boolean;
  readonly why: string | null;
}

export function slotFits(hero: HeroState, id: string): SlotFitView[] {
  const def = wornDef(id);
  const off: SlotFitView = { fit: "off", target: false, why: null };
  if (def === undefined) return WORN_SLOTS.map(() => off);
  const kind = WORN_SLOTS.map((k, i) => (k === def.slot ? i : -1)).filter(
    (i) => i >= 0,
  );
  const target =
    kind.find((i) => (hero.worn[i] ?? null) === null) ?? kind[0] ?? -1;
  return WORN_SLOTS.map((k, i): SlotFitView => {
    if (k !== def.slot) return off;
    const why = wearError(hero, id, i);
    if (why !== null)
      return { fit: "barred", target: false, why: `${capital(why.message)}.` };
    const there = hero.worn[i] ?? null;
    if (there !== null && isCursed(there))
      return {
        fit: "barred",
        target: false,
        why: `${findArtifact(there)?.name ?? there} is cursed and cannot come off.`,
      };
    if (there !== null)
      return {
        fit: "swap",
        target: i === target,
        why: `Swap: ${def.name} goes on, ${findArtifact(there)?.name ?? there} goes to the backpack.`,
      };
    return {
      fit: "fits",
      target: i === target,
      why: `${def.name} goes here.`,
    };
  });
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const FITS: readonly SlotFit[] = ["fits", "swap", "barred", "off"];

/**
 * Lights the doll's cells (WORN_SLOTS order) for `fits` (bead bzc.108):
 * `pick` for an item picked or dragged (strong: a glow that pulses unless
 * motion is reduced, the other slots dimmed, a swap mark), `hint` for one
 * hovered or focused (a lighter outline). Null clears that mode. Classes:
 * `hs-<mode>-<fit>`, `hs-<mode>-target`, and `hs-doll-<mode>` on the doll.
 */
export function paintSlotFits(
  doll: HTMLElement,
  cells: readonly HTMLElement[],
  fits: readonly SlotFitView[] | null,
  mode: "pick" | "hint",
): void {
  cells.forEach((cell, i) => {
    for (const f of FITS) cell.classList.remove(`hs-${mode}-${f}`);
    cell.classList.remove(`hs-${mode}-target`);
    const v = fits?.[i];
    if (v === undefined) return;
    cell.classList.add(`hs-${mode}-${v.fit}`);
    if (v.target) cell.classList.add(`hs-${mode}-target`);
  });
  if (fits === null) doll.classList.remove(`hs-doll-${mode}`);
  else doll.classList.add(`hs-doll-${mode}`);
}

/** Where a picked backpack item goes, in words (the details pane). */
export function fitNote(hero: HeroState, id: string): string {
  const def = findArtifact(id);
  if (def === undefined) return "";
  if (def.kind === "consumable")
    return "Not worn: double-click it, or Use, to drink or read it.";
  if (def.kind !== "worn") return "Carried, not worn.";
  const fits = slotFits(hero, id);
  const open = fits.filter((f) => f.fit === "fits" || f.fit === "swap");
  const where = SLOT_NAMES[def.slot];
  if (open.length === 0) {
    const why = fits.find((f) => f.why !== null)?.why ?? "it is barred.";
    return `Worn on the ${where} slot, but ${why.charAt(0).toLowerCase()}${why.slice(1)}`;
  }
  return open.length > 1
    ? `Worn on a ${where} slot: click a lit slot on the doll to wear it there.`
    : `Worn on the ${where} slot: click the lit slot on the doll to wear it.`;
}

/** What a double-click or drag does with a worn or carried item. */
export function itemHint(place: "worn" | "backpack", id: string): string {
  const def = findArtifact(id);
  if (place === "worn") {
    return def?.kind === "worn" && def.cursed === true
      ? "Cursed: it cannot be taken off. Click for details."
      : "Double-click, or drag it to the backpack, to take it off. Click for details.";
  }
  return def?.kind === "consumable"
    ? "Double-click to use it. Click for details."
    : "Double-click, or drag it onto the doll, to wear it. Click for details.";
}

/** Rank words of a skill, as Heroes labels them ("Expert Archery"). */
export const RANK_WORDS = ["Basic", "Advanced", "Expert"] as const;

const FAMILY_WORDS: Readonly<Record<string, string>> = {
  school: "school skill",
  army: "army skill",
  journey: "journey skill",
};

/** The 32 px content icon of a tile or card, or null when it has none. */
function tileIcon(kind: IconKind, id: string): HTMLElement | null {
  const icon = ownIcon(kind, id);
  icon?.classList.add("hs-tile-icon");
  return icon;
}

/**
 * Every rank's rule of a skill, one line each ("Advanced: ..."), rank
 * `rank` bright and the others dim: the hero sheet's skill card and the
 * level-up cards (bead bzc.108) share them.
 */
export function skillRankLines(id: string, rank: number): HTMLElement[] {
  const def = findSkill(id);
  if (def === undefined) return [];
  return def.ranks.map((r, k) => {
    const line = el("div.gm-tip-line", el("b", `${RANK_WORDS[k]}: `), r.text);
    if (k + 1 !== rank) line.classList.add("gm-tip-dim");
    return line;
  });
}

/** A skill's hover card: every rank's rule, the held one bright. */
export function skillTipCard(id: string, rank: number): TipBody {
  const def = findSkill(id);
  if (def === undefined) return id;
  const word = RANK_WORDS[rank - 1] ?? "";
  return tipCard(def.name, skillRankLines(id, rank), {
    icon: ownIcon("skill", id),
    subtitle: `${word} ${FAMILY_WORDS[def.family] ?? "skill"}`.trim(),
  });
}

/** A feat's or vow's hover card: its rule and, for a vow, the restriction. */
export function featTipCard(id: string): TipBody {
  const def = findFeat(id);
  if (def === undefined) return id;
  const vowed = def.restriction !== undefined;
  return tipCard(
    def.name,
    [
      def.text,
      def.restrictionText === undefined
        ? null
        : el(
            "div.gm-tip-line.gm-tip-bad",
            el("b", "Restriction: "),
            def.restrictionText,
          ),
    ],
    {
      icon: ownIcon(vowed ? "vow" : "feat", id),
      subtitle: vowed ? "Vow: binds the hero for good" : "Feat",
    },
  );
}

/**
 * The skill slots as icon tiles (bead bzc.69, Heroes III style): the icon,
 * the name under it and the rank word; every rank's rule in the hover card.
 */
export function skillTiles(h: HeroState): HTMLElement {
  const box = el("div.hs-tiles.hs-skills");
  for (let i = 0; i < MAX_SKILLS; i++) {
    const s = h.skills[i];
    if (s === undefined) {
      const empty = el("div.hs-tile.hs-tile-empty");
      empty.setAttribute("aria-label", "Empty skill slot");
      setTip(
        empty,
        "Empty skill slot: a level-up may offer a new skill to fill it.",
      );
      box.append(empty);
      continue;
    }
    const def = findSkill(s.id);
    const tile = el(
      "div.hs-tile.hs-skill",
      tileIcon("skill", s.id),
      el("span.hs-tile-name", def?.name ?? s.id),
      el("span.hs-tile-sub", RANK_WORDS[s.rank - 1] ?? ""),
    );
    tile.tabIndex = 0;
    if (def !== undefined) tile.classList.add(`hs-family-${def.family}`);
    setTip(tile, () => skillTipCard(s.id, s.rank));
    box.append(tile);
  }
  return box;
}

/**
 * The feats and vows as icon tiles like the skills (bead bzc.69): the icon
 * and the name; the rule, with its keywords explained, in the hover card.
 */
export function featTiles(h: HeroState): HTMLElement {
  const box = el("div.hs-tiles.hs-feats");
  if (h.feats.length === 0) {
    box.append(el("div.gm-dim", "No feats yet: one every third level."));
  }
  for (const id of h.feats) {
    const def = findFeat(id);
    const vowed = def?.restriction !== undefined;
    const tile = el(
      "div.hs-tile.hs-feat",
      tileIcon(vowed ? "vow" : "feat", id),
      el("span.hs-tile-name", def?.name ?? id),
      el("span.hs-tile-sub", vowed ? "Vow" : "Feat"),
    );
    tile.tabIndex = 0;
    if (vowed) tile.classList.add("hs-vow");
    setTip(tile, () => featTipCard(id));
    box.append(tile);
  }
  return box;
}

/** Backpack entries grouped as slots: consumables stack three a slot. */
export function backpackSlots(
  hero: HeroState,
): Array<{ id: string; index: number; count: number }> {
  const out: Array<{ id: string; index: number; count: number }> = [];
  hero.backpack.forEach((id, index) => {
    if (findArtifact(id)?.kind === "consumable") {
      const open = out.find(
        (o) => o.id === id && o.count < CONSUMABLES_PER_SLOT,
      );
      if (open !== undefined) {
        open.count++;
        return;
      }
    }
    out.push({ id, index, count: 1 });
  });
  return out;
}

/**
 * Paper-doll grid positions of the eleven worn slots (column, row): four
 * rows of three, the middle of the third row left open (bead bzc.45 keeps
 * the sheet within a 1280x800 window).
 */
const DOLL: ReadonlyArray<[number, number]> = [
  [2, 1], // head
  [3, 1], // neck
  [2, 2], // torso
  [1, 1], // cloak
  [1, 2], // weapon
  [3, 2], // shield
  [1, 3], // ring
  [3, 3], // ring
  [2, 4], // feet
  [1, 4], // pocket
  [3, 4], // pocket
];

/**
 * One paper-doll slot (bead bzc.69): an empty slot shows a faint outline
 * of what goes there (helmet, amulet, ring, boots; drawn in hero.css from
 * `data-outline`) and no caption; a filled one shows the item. The slot's
 * name and what clicks do are in the hover card.
 */
export function dollSlot(kind: SlotKind, id: string | null): HTMLElement {
  const cell = el("div.hs-slot");
  cell.dataset["outline"] = kind;
  if (id === null) {
    cell.classList.add("hs-slot-empty");
    cell.setAttribute("aria-label", `${SLOT_NAMES[kind]} (empty)`);
    setTip(cell, () =>
      tipCard(
        SLOT_NAMES[kind],
        [
          `Empty. Drag ${SLOT_ITEMS[kind]} here from the backpack, or double-click it there.`,
        ],
        { subtitle: "Worn slot" },
      ),
    );
    return cell;
  }
  const icon = itemIcon(id);
  setTip(icon, () => itemCard(id, itemHint("worn", id)));
  cell.append(icon);
  return cell;
}

/** What a slot holds, for the empty slot's hover card. */
const SLOT_ITEMS: Readonly<Record<SlotKind, string>> = {
  head: "a helmet or crown",
  neck: "an amulet",
  torso: "armour",
  cloak: "a cloak",
  weapon: "a weapon",
  shield: "a shield",
  ring: "a ring",
  feet: "boots",
  pocket: "a pocket item",
};
type Selection =
  | { place: "worn"; index: number }
  | { place: "backpack"; index: number }
  | null;

// ------------------------------------------------------------------ numbers

/** A stat icon (public/assets/icons/stats, bead bzc.82) with no title. */
function statIcon(id: string, scale = 1): HTMLElement {
  const icon = iconElement("stat", id, { scale });
  icon.removeAttribute("title");
  return icon;
}

/** A line of a stat card that is a source, not rules (no keyword boxes). */
function sourceLine(text: string): HTMLElement {
  const line = el("div.gm-tip-line.gm-tip-dim", text);
  line.dataset["kwSkip"] = "";
  return line;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/**
 * One number of the hero sheet (bead bzc.82, Heroes II style): the icon,
 * the number under or beside it, a bar for the numbers that run out or
 * fill up, and the explanation in its hover card (right-click pins it).
 */
export interface StatTileView {
  /** The stat icon's id; a specialty brings its own picture instead. */
  readonly icon: string;
  readonly label: string;
  readonly value: string;
  /** 0..100: a bar under the value (mana, movement, experience). */
  readonly pct?: number;
  readonly tone?: "good" | "bad";
  readonly card: () => TipBody;
  /** A picture to show instead of the stat icon (the specialty's). */
  readonly picture?: () => HTMLElement;
}

/** The four primary stats with the sources that make them up. */
export function primaryStatViews(h: HeroState): StatTileView[] {
  const stats = heroStats(h);
  return PRIMARY_STATS.map((stat) => {
    return {
      icon: stat,
      label: STAT_NAMES[stat],
      value: String(stats[stat]),
      card: () =>
        tipCard(
          `${STAT_NAMES[stat]} ${stats[stat]}`,
          [
            STAT_TEXT[stat],
            ...statBreakdown(h, stat).map((c) =>
              sourceLine(
                c.label === "Base"
                  ? `Base ${c.amount}`
                  : `${c.label} ${signed(c.amount)}`,
              ),
            ),
          ],
          { icon: statIcon(stat), subtitle: "Primary stat" },
        ),
    };
  });
}

/** Grass steps a number of movement points buys. */
export function moveSteps(points: number): number {
  return Math.max(0, Math.floor(points / NATIVE_MOVE_COST));
}

/** What a step costs where, from the movement table (data/movement.ts). */
function stepCosts(): string {
  const by = new Map<number, string[]>();
  for (const [terrain, cost] of Object.entries(TERRAIN_MOVE_COST)) {
    if (cost === null) continue;
    by.set(cost, [...(by.get(cost) ?? []), terrain]);
  }
  const parts = [...by.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([cost, names]) => `${cost} on ${names.join(" and ")}`);
  return `A step costs ${ROAD_MOVE_COST} on a road, ${parts.join(", ")}; a diagonal step 1.4 times as much.`;
}

/** Sources of a summed hero effect (morale, luck, sight) as card lines. */
function effectLines(
  h: HeroState,
  kind: "morale" | "luck" | "sight",
): HTMLElement[] {
  return effectsOf(h, kind).map((e) =>
    sourceLine(`${e.source.label} ${signed(e.effect.amount)}`),
  );
}

/** The specialty's picture: its spell, skill, creature, resource or Command. */
function specialtyPicture(spec: Specialty): HTMLElement {
  switch (spec.kind) {
    case "spell":
      return iconElement("spell", spec.spell, { framed: false });
    case "skill":
      return iconElement("skill", spec.skill, { framed: false });
    case "creature":
      return el(
        "span.hs-mini-portrait",
        img(unitPortrait(spec.creature).key, "hs-mini-portrait-img"),
      );
    case "resource":
      return el(
        "span.hs-mini-res",
        resourceIcon(
          spec.resource === "wood-ore" ? "wood" : spec.resource,
          "hs-mini-res-img",
        ),
      );
    case "command":
      return statIcon("command");
  }
}

/** The specialty in two words, for under its picture. */
function specialtyWord(spec: Specialty): string {
  switch (spec.kind) {
    case "spell":
      return isSpell(spec.spell) ? spellInfo(spec.spell).name : spec.spell;
    case "skill":
      return findSkill(spec.skill)?.name ?? spec.skill;
    case "creature":
      return isCreatureId(spec.creature)
        ? getCreature(spec.creature).plural
        : spec.creature;
    case "resource":
      return spec.resource === "gold"
        ? "+250 gold"
        : spec.resource === "wood-ore"
          ? "Wood, ore"
          : "Essence";
    case "command":
      return "C +1";
  }
}

/**
 * The other numbers (bead bzc.82): level, experience, mana, movement,
 * morale, luck, sight, the Command and the specialty, each an icon with its
 * number; what it means and where it comes from in the hover card.
 */
export function otherStatViews(h: HeroState): StatTileView[] {
  const next = xpForLevel(h.level + 1);
  const prev = xpForLevel(h.level);
  const xpPct = Math.max(
    0,
    Math.min(100, ((h.xp - prev) / Math.max(1, next - prev)) * 100),
  );
  const max = maxMana(h);
  const move = movementBreakdown(h);
  const morale = armyMorale(h);
  const luck = armyLuck(h);
  const cls = getHeroClass(h.heroClass);
  const command = COMMANDS[cls.command];
  const spec = heroSpecialty(h);
  const tone = (n: number): Pick<StatTileView, "tone"> =>
    n > 0 ? { tone: "good" } : n < 0 ? { tone: "bad" } : {};
  const pct = (a: number, b: number): number =>
    b <= 0 ? 0 : Math.max(0, Math.min(100, (a / b) * 100));
  const views: StatTileView[] = [
    {
      icon: "level",
      label: "Level",
      value: String(h.level),
      card: () =>
        tipCard(
          `Level ${h.level} ${cls.name}`,
          [
            "Each level: +1 to a primary stat from the class's pattern and a choice of skills. Every third level: a feat.",
            h.pendingLevelUps > 0
              ? el(
                  "div.gm-tip-line.hs-tip-pending",
                  `Level ${pendingLevel(h)}: a ${h.levelUpStep === "feat" ? "feat" : "skill"} choice is waiting.`,
                )
              : null,
          ],
          { icon: statIcon("level"), subtitle: "Hero level" },
        ),
    },
    {
      icon: "experience",
      label: "Experience",
      value: String(h.xp),
      pct: xpPct,
      card: () => {
        const bonus = xpPercent(h);
        return tipCard(
          `Experience ${h.xp}`,
          [
            `Level ${h.level + 1} at ${next}: ${Math.max(0, next - h.xp)} to go.`,
            "Won battles and some sites give experience.",
            bonus === 0
              ? null
              : sourceLine(
                  `${signed(bonus)}% experience from skills and items.`,
                ),
          ],
          { icon: statIcon("experience"), subtitle: "Toward the next level" },
        );
      },
    },
    {
      icon: "mana",
      label: "Mana",
      value: `${h.mana} / ${max}`,
      pct: pct(h.mana, max),
      card: () =>
        tipCard(
          `Mana ${h.mana} / ${max}`,
          [
            "Spent to cast pages, on the map and in battle.",
            `The maximum is 10 per point of Lore, plus modifiers; ${manaRegen(h)} returns each day.`,
          ],
          { icon: statIcon("mana"), subtitle: "Spell points" },
        ),
    },
    {
      icon: "movement",
      label: "Movement",
      value: `${moveSteps(h.mp)} / ${moveSteps(h.maxMp)}`,
      pct: pct(h.mp, h.maxMp),
      card: () =>
        tipCard(
          `Movement: ${moveSteps(h.mp)} of ${moveSteps(h.maxMp)} steps`,
          [
            `${h.mp} of ${h.maxMp} movement points left today: about ${moveSteps(h.mp)} steps on grass.`,
            stepCosts(),
            sourceLine(
              `A day's movement: ${move.base} from the slowest creature's Speed` +
                (move.percent === 0 ? "" : `, ${signed(move.percent)}%`) +
                (move.flat === 0 ? "" : `, ${signed(move.flat)}`) +
                (move.debt === 0 ? "" : `, ${-move.debt} owed`) +
                `; tomorrow ${move.total} (${moveSteps(move.total)} steps).`,
            ),
          ],
          { icon: statIcon("movement"), subtitle: "On the map, today" },
        ),
    },
    {
      icon: "morale",
      label: "Morale",
      value: signed(morale),
      ...tone(morale),
      card: () =>
        tipCard(
          `Morale ${signed(morale)}`,
          [
            "From -3 to +3. At the start of a battle, +n makes the n strongest stacks Heartened; -n makes them Shaken.",
            ...effectLines(h, "morale"),
          ],
          { icon: statIcon("morale"), subtitle: "Army, at battle start" },
        ),
    },
    {
      icon: "luck",
      label: "Luck",
      value: signed(luck),
      ...tone(luck),
      card: () =>
        tipCard(
          `Luck ${signed(luck)}`,
          [
            "From -3 to +3. At the start of a battle, +n makes the n strongest stacks Lucky; -n makes them Jinxed.",
            ...effectLines(h, "luck"),
          ],
          { icon: statIcon("luck"), subtitle: "Army, at battle start" },
        ),
    },
    {
      icon: "sight",
      label: "Sight",
      value: String(sightRadius(h)),
      card: () =>
        tipCard(
          `Sight ${sightRadius(h)}`,
          [
            "How many cells around the hero are revealed on the map (at most 12).",
            ...effectLines(h, "sight"),
          ],
          { icon: statIcon("sight"), subtitle: "On the map" },
        ),
    },
  ];
  if (command !== undefined) {
    const c = commandStrength(h);
    views.push({
      icon: "command",
      label: "Command",
      value: `C ${c}`,
      card: () =>
        tipCard(
          `${command.name} (C ${c})`,
          [command.text, "C is 1, plus 1 for every 5 hero levels."],
          { icon: statIcon("command"), subtitle: "Class order, once a battle" },
        ),
    });
  }
  if (spec !== undefined) {
    views.push({
      icon: "specialty",
      label: "Specialty",
      value: specialtyWord(spec),
      picture: () => specialtyPicture(spec),
      card: () =>
        tipCard(specialtyWord(spec), [specialtyText(spec)], {
          icon: specialtyPicture(spec),
          subtitle: `${h.name}'s specialty`,
        }),
    });
  }
  return views;
}

/** One number as a tile: `big` for the primary stats (2x icon, caption). */
export function statTile(view: StatTileView, big = false): HTMLElement {
  const picture = view.picture?.() ?? statIcon(view.icon, big ? 2 : 1);
  const value = el(
    big ? "span.hs-pstat-value" : "span.hs-mini-value",
    view.value,
  );
  if (view.tone !== undefined) value.classList.add(`hs-${view.tone}`);
  const text = big ? null : el("div.hs-mini-text", value);
  const tile =
    text === null
      ? el("div.hs-pstat", el("span.hs-pstat-name", view.label), picture, value)
      : el("div.hs-mini", picture, text);
  tile.dataset["stat"] = view.icon;
  if (view.pct !== undefined) {
    const fill = el("span.hs-bar-fill");
    fill.style.width = `${Math.round(view.pct)}%`;
    (text ?? tile).append(el(`span.hs-bar.hs-bar-${view.icon}`, fill));
  }
  tile.tabIndex = 0;
  tile.setAttribute("aria-label", `${view.label} ${view.value}`);
  setTip(tile, view.card);
  return tile;
}

/** Rank n opens pages up to this tier (RULES_V2 2.2). */
const RANK_TIERS: readonly number[] = [0, 2, 4, 5];

/** The schools the hero has a rank in, as emblems with the rank. */
export function schoolRankRow(h: HeroState): HTMLElement | null {
  const ranked = SCHOOLS.filter((sc) => schoolRank(h, sc) > 0);
  if (ranked.length === 0) return null;
  const row = el("div.hs-ranks");
  for (const sc of ranked) {
    const rank = schoolRank(h, sc);
    const icon = iconElement("school", sc);
    icon.removeAttribute("title");
    const chip = el("div.hs-rank", icon, el("span.hs-rank-n", String(rank)));
    chip.tabIndex = 0;
    chip.dataset["school"] = sc;
    chip.setAttribute("aria-label", `${SCHOOL_NAMES[sc]} rank ${rank}`);
    setTip(chip, () =>
      tipCard(
        `${SCHOOL_NAMES[sc]} rank ${rank}`,
        [
          `Learns ${SCHOOL_NAMES[sc]} pages up to tier ${RANK_TIERS[rank] ?? 5}; they are cast at ${signed(SCHOOL_RANK_POWER[rank] ?? 0)} Power.`,
        ],
        { icon: iconElement("school", sc), subtitle: "School rank" },
      ),
    );
    row.append(chip);
  }
  return row;
}

/** Pages and scrolls in the hero's book: the spellbook button's count. */
export function bookCount(h: HeroState): { pages: number; scrolls: number } {
  return { pages: h.pages.length, scrolls: h.scrolls.length };
}

/**
 * The spellbook button (bead bzc.82): the spells left the sheet for the
 * book; the button shows how many pages it holds and opens the book (M).
 */
export function spellbookButton(
  h: HeroState,
  onOpen: () => void,
): HTMLButtonElement {
  const { pages, scrolls } = bookCount(h);
  const b = el(
    "button.hs-book-btn",
    statIcon("spellbook", 2),
    el(
      "span.hs-book-text",
      el("span.hs-book-title", "Spellbook"),
      el("span.hs-book-n", `${pages} page${pages === 1 ? "" : "s"}`),
      el("span.hs-book-kbd", kbd("M")),
    ),
  );
  b.type = "button";
  b.setAttribute("aria-label", `Spellbook, ${pages} pages (M)`);
  setTip(b, () =>
    tipCard(
      "Spellbook",
      [
        pages === 0
          ? "No pages yet: a Magic Guild in a town or a shrine on the map teaches spells."
          : `${pages} page${pages === 1 ? "" : "s"}${scrolls > 0 ? ` and ${scrolls} scroll${scrolls === 1 ? "" : "s"}` : ""}, by school. Adventure spells are cast from the book; battle pages in battle.`,
        el(
          "div.gm-tip-line.gm-tip-dim.hs-tip-hint",
          "Click or press M to open it.",
        ),
      ],
      {
        icon: statIcon("spellbook"),
        subtitle: `Mana ${h.mana} / ${maxMana(h)}`,
      },
    ),
  );
  b.addEventListener("click", onOpen);
  return b;
}

/** A section head with a stat icon: "[icon] Scroll case 5 / 8". */
function iconHead(icon: string, text: string): HTMLElement {
  return el("h3.hs-icon-head", statIcon(icon), el("span", text));
}

/**
 * The hero sheet (bead bzc.82, laid out like the Heroes II hero screen):
 * the portrait, name and class at the top left, the four primary stats as
 * big icons beside them and the other numbers as small ones; then the
 * skills and feats as icon rows, the paper doll with the spellbook button
 * under it, the backpack and scroll case; the army band at the bottom.
 * Click an item to select it (its details and actions show), double-click
 * to wear, take off or use it, or drag it between the backpack and the
 * doll. The army rearranges on the owner's turn like the town screen's.
 *
 * Resolves with the adventure spell picked in the spellbook (the sheet
 * closes for it, and the game casts or aims it), else null.
 */
export async function openHeroScreen(
  host: HeroScreenHost,
  heroId: string,
): Promise<BookChoice> {
  let selected: Selection = null;
  /** The army slot picked to move, merge, swap or split. */
  let armySel: number | null = null;
  /** The spell picked in the book, handed to the game as the sheet closes. */
  let picked: BookChoice = null;
  let close: (() => void) | null = null;
  let bookOpen = false;
  const body = el("div.hs-sheet");
  const hero = (): HeroState | undefined =>
    host.state().heroes.find((h) => h.id === heroId);

  const act = (result: CommandResult): void => {
    if (host.run(result)) selected = null;
    render();
  };

  /** The book over the sheet; a cast or aim closes the sheet for the map. */
  const openBook = async (): Promise<void> => {
    const h = hero();
    if (h === undefined || bookOpen) return;
    bookOpen = true;
    const canCast = host.canCast?.(heroId) ?? false;
    const choice = await openAdventureBook(host.state(), h, {
      readOnly: !canCast,
    });
    bookOpen = false;
    if (choice !== null && canCast) {
      picked = choice;
      close?.();
      return;
    }
    render();
  };

  const drag = (node: HTMLElement, data: Selection): void => {
    node.draggable = true;
    node.addEventListener("dragstart", (e) => {
      e.dataTransfer?.setData("text/plain", JSON.stringify(data));
    });
  };
  const readDrag = (e: DragEvent): Selection => {
    try {
      return JSON.parse(e.dataTransfer?.getData("text/plain") ?? "null");
    } catch {
      return null;
    }
  };

  /** The slot the keyboard picked, focused again after the render. */
  let focusKey: string | null = null;
  /**
   * Makes a doll or backpack slot keyboard-pickable (bead bzc.108): Tab to
   * it, Enter or Space does what a click does.
   */
  const keyed = (cell: HTMLElement, key: string): void => {
    cell.tabIndex = 0;
    cell.setAttribute("role", "button");
    cell.dataset["key"] = key;
    cell.dataset["ownEnter"] = "";
    cell.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      focusKey = key;
      cell.click();
    });
  };

  const render = (): void => {
    const h = hero();
    if (h === undefined) return;
    const cls = getHeroClass(h.heroClass);

    // ---- top: who, the four primary stats, the other numbers
    const id = el(
      "div.hs-id",
      img(namedHeroPortrait(h.defId, h.heroClass).key, "hs-portrait", 2),
      el(
        "div.hs-id-text",
        el("div.hs-name", h.name),
        el("div.hs-class", `Level ${h.level} ${cls.name}`),
        h.pendingLevelUps > 0
          ? el(
              "div.hs-pending",
              `Level ${pendingLevel(h)}: a ${h.levelUpStep === "feat" ? "feat" : "skill"} choice is waiting.`,
            )
          : null,
      ),
    );
    const top = el(
      "div.hs-top",
      id,
      el(
        "div.hs-primaries",
        ...primaryStatViews(h).map((v) => statTile(v, true)),
      ),
      el("div.hs-minis", ...otherStatViews(h).map((v) => statTile(v))),
    );

    // ---- left: skills and feats as icon rows; the book and school ranks
    // The magic wheel (bead bzc.100), the hero's schools gilded on it, at
    // the end of the school ranks so it wraps with them.
    const wheel = magicWheelButton(() => ({
      ranks: Object.fromEntries(
        SCHOOLS.map((sc) => [sc, schoolRank(h, sc)]),
      ) as Record<(typeof SCHOOLS)[number], number>,
      faction: cls.faction,
      who: h.name,
    }));
    const ranks = schoolRankRow(h);
    ranks?.append(wheel);
    const book = el(
      "div.hs-book-row",
      spellbookButton(h, () => void openBook()),
      ranks ?? wheel,
    );
    if (holdsUnspentPage(h)) {
      book.append(
        unspentChooser(h, (page) =>
          act(chooseUnspentPage(host.state(), heroId, page)),
        ),
      );
    }
    const left = el(
      "div.hs-col.hs-left",
      el("h3", `Skills ${h.skills.length} / ${MAX_SKILLS}`),
      skillTiles(h),
      el("h3", "Feats and vows"),
      featTiles(h),
      book,
    );

    // ---- middle: the paper doll
    const doll = el("div.hs-doll");
    // What a picked backpack item fits (bead bzc.108): lit on the doll.
    const pickedId =
      selected?.place === "backpack"
        ? (h.backpack[selected.index] ?? null)
        : null;
    const fits = pickedId === null ? null : slotFits(h, pickedId);
    const cells: HTMLElement[] = [];
    WORN_SLOTS.forEach((kind, i) => {
      const worn = h.worn[i] ?? null;
      const cell = dollSlot(kind, worn);
      const [col, row] = DOLL[i] as [number, number];
      cell.style.gridColumn = String(col);
      cell.style.gridRow = String(row);
      keyed(cell, `doll:${i}`);
      if (selected?.place === "worn" && selected.index === i) {
        cell.classList.add("hs-selected");
      }
      const icon = cell.firstElementChild;
      const fit = fits?.[i];
      if (fit !== undefined && fit.why !== null) {
        // The slot's card says what a click does with the picked item.
        const why =
          fit.fit === "barred" ? fit.why : `${fit.why} Click to wear it here.`;
        if (worn !== null && icon instanceof HTMLElement)
          setTip(icon, () => itemCard(worn, why));
        else
          setTip(cell, () =>
            tipCard(SLOT_NAMES[kind], [why], { subtitle: "Worn slot" }),
          );
      }
      if (worn !== null && icon instanceof HTMLElement) {
        drag(icon, { place: "worn", index: i });
        cell.addEventListener("dblclick", () =>
          act(unequip(host.state(), heroId, i)),
        );
      }
      cell.addEventListener("click", () => {
        // A picked backpack item goes on a lit slot (or says why not).
        const from = selected;
        if (
          from?.place === "backpack" &&
          fit !== undefined &&
          fit.fit !== "off"
        ) {
          act(equip(host.state(), heroId, from.index, i));
          return;
        }
        selected = worn === null ? null : { place: "worn", index: i };
        render();
      });
      cell.addEventListener("dragover", (e) => {
        e.preventDefault();
        cell.classList.add("hs-drop");
      });
      cell.addEventListener("dragleave", () =>
        cell.classList.remove("hs-drop"),
      );
      cell.addEventListener("drop", (e) => {
        e.preventDefault();
        const from = readDrag(e);
        if (from?.place === "backpack") {
          act(equip(host.state(), heroId, from.index, i));
        }
      });
      cells.push(cell);
      doll.append(cell);
    });
    paintSlotFits(doll, cells, fits, "pick");
    const middle = el("div.hs-col.hs-middle", el("h3", "Worn"), doll);
    /** A lighter hint while a backpack item is hovered or focused. */
    const hint = (id: string | null): void =>
      paintSlotFits(doll, cells, id === null ? null : slotFits(h, id), "hint");

    // ---- right: backpack, scroll case, the selected item
    const pack = el("div.hs-grid");
    const slots = backpackSlots(h);
    for (let i = 0; i < backpackSize(h); i++) {
      const entry = slots[i];
      const cell = el("div.hs-cell");
      if (entry !== undefined) {
        const icon = itemIcon(entry.id, entry.count);
        setTip(icon, () => itemCard(entry.id, itemHint("backpack", entry.id)));
        drag(icon, { place: "backpack", index: entry.index });
        // Dragging lights the doll as picking does.
        icon.addEventListener("dragstart", () =>
          paintSlotFits(doll, cells, slotFits(h, entry.id), "pick"),
        );
        icon.addEventListener("dragend", () => render());
        cell.append(icon);
        keyed(cell, `pack:${entry.index}`);
        if (selected?.place === "backpack" && selected.index === entry.index) {
          cell.classList.add("hs-selected");
        }
        cell.addEventListener("click", () => {
          // A second click on the picked item puts it down.
          const again =
            selected?.place === "backpack" && selected.index === entry.index;
          selected = again ? null : { place: "backpack", index: entry.index };
          render();
        });
        cell.addEventListener("mouseenter", () => hint(entry.id));
        cell.addEventListener("mouseleave", () => hint(null));
        cell.addEventListener("focus", () => hint(entry.id));
        cell.addEventListener("blur", () => hint(null));
        cell.addEventListener("dblclick", () => {
          const def = findArtifact(entry.id);
          act(
            def?.kind === "consumable"
              ? useConsumable(host.state(), heroId, entry.index)
              : equip(host.state(), heroId, entry.index),
          );
        });
      }
      pack.append(cell);
    }
    pack.addEventListener("dragover", (e) => e.preventDefault());
    pack.addEventListener("drop", (e) => {
      e.preventDefault();
      const from = readDrag(e);
      if (from?.place === "worn")
        act(unequip(host.state(), heroId, from.index));
    });
    const scrolls = el("div.hs-grid.hs-scrolls");
    for (let i = 0; i < scrollCaseSize(h); i++) {
      const spell = h.scrolls[i];
      const cell = el("div.hs-cell");
      // A scroll's card is the spell's, as in the spellbook (bead bzc.108).
      if (spell !== undefined)
        cell.append(setTip(scrollIcon(spell), () => spellTip(spell)));
      scrolls.append(cell);
    }
    const scrollHead = iconHead(
      "scroll-case",
      `Scroll case ${h.scrolls.length} / ${scrollCaseSize(h)}`,
    );
    setTip(
      scrollHead,
      "Scroll case: spells on paper. Any hero may cast a scroll once, at no mana; it is listed in the spellbook too.",
    );
    const right = el(
      "div.hs-col.hs-far",
      el("h3", `Backpack ${backpackSlots(h).length} / ${backpackSize(h)}`),
      pack,
      scrollHead,
      scrolls,
    );
    const info = details(h);
    if (info !== null) right.append(info);

    // Own stacks rearrange on the owner's turn, as in the town screen.
    const editable = h.owner === host.state().currentPlayer;
    body.replaceChildren(
      top,
      el("div.hs-columns", left, middle, right),
      heroArmySection(
        h.army,
        editable ? { selected: armySel, onSlot: onArmySlot } : {},
      ),
    );
    if (focusKey !== null) {
      body.querySelector<HTMLElement>(`[data-key="${focusKey}"]`)?.focus();
      focusKey = null;
    }
  };

  /**
   * Click a stack, then a slot: move, merge or swap (transferStack within
   * one army); shift-click the target to split the stack in half.
   */
  const onArmySlot = (slot: number, e: MouseEvent): void => {
    const h = hero();
    if (h === undefined) return;
    const from = armySel;
    armySel = null;
    if (from === null || from === slot) {
      if (from === null && h.army[slot] != null) armySel = slot;
      render();
      return;
    }
    const stack = h.army[from];
    const count =
      stack != null && e.shiftKey ? Math.floor(stack.count / 2) : undefined;
    if (stack != null && count !== 0) {
      host.run(
        transferStack(host.state(), {
          heroId,
          from: { army: "hero", slot: from },
          to: { army: "hero", slot },
          ...(count !== undefined ? { count } : {}),
        }),
      );
    }
    render();
  };

  /**
   * The selected item's text and the actions it allows; null when there is
   * nothing to show (what clicks do is in the items' hover cards).
   */
  const details = (h: HeroState): HTMLElement | null => {
    const box = el("div.hs-details");
    const marvels = assemblable(h);
    for (const m of marvels) {
      box.append(
        button(`Assemble ${wornDef(m)?.name ?? m}`, () =>
          act(assemble(host.state(), heroId, m)),
        ),
      );
    }
    if (h.nextBattle.length > 0) {
      box.append(
        el(
          "div.hs-dim",
          `Next battle: ${h.nextBattle
            .map((id) => findArtifact(id)?.name ?? id)
            .join(", ")}`,
        ),
      );
    }
    const empty = box.childElementCount === 0 ? null : box;
    if (selected === null) return empty;
    const sel = selected;
    const id = sel.place === "worn" ? h.worn[sel.index] : h.backpack[sel.index];
    if (id === undefined || id === null) return empty;
    const def = findArtifact(id);
    const info = el(
      "div.hs-info",
      itemIcon(id),
      el("pre.hs-text", itemTooltip(id)),
    );
    // Where a picked backpack item goes (bead bzc.108), as the doll shows.
    const note =
      sel.place === "backpack" ? el("div.hs-fit-note", fitNote(h, id)) : null;
    const actions = el("div.hs-actions");
    if (sel.place === "worn") {
      const b = button("Take off", () =>
        act(unequip(host.state(), heroId, sel.index)),
      );
      if (def?.kind === "worn" && def.cursed === true) {
        b.disabled = true;
        b.title =
          "Cursed: lifted at a curse-lifting site, a Magic Guild 3 town, or on defeat.";
      }
      actions.append(b);
    } else if (def?.kind === "consumable") {
      actions.append(
        button("Use", () =>
          act(useConsumable(host.state(), heroId, sel.index)),
        ),
      );
    } else {
      actions.append(
        button("Wear", () => act(equip(host.state(), heroId, sel.index))),
      );
    }
    if (sel.place === "backpack") {
      actions.append(
        button("Destroy", () =>
          act(destroyArtifact(host.state(), heroId, sel.index)),
        ),
      );
    }
    box.append(info);
    if (note !== null) box.append(note);
    box.append(actions);
    return box;
  };

  // M (or B) opens the book while the sheet is the topmost dialog.
  const onKey = (e: KeyboardEvent): void => {
    if (bookOpen || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key !== "m" && e.key !== "M" && e.key !== "b" && e.key !== "B")
      return;
    const backdrop = body.closest(".gm-backdrop");
    if (backdrop === null) return;
    if (backdrop.nextElementSibling?.matches(".gm-backdrop")) return;
    const target = e.target;
    if (
      target instanceof HTMLElement &&
      target.matches("input, select, textarea")
    )
      return;
    e.preventDefault();
    void openBook();
  };

  render();
  window.addEventListener("keydown", onKey);
  try {
    await modal<undefined>({
      title: "Hero sheet",
      body,
      className: "hs-dialog",
      buttons: [{ label: "Close", value: undefined, primary: true }],
      cancel: undefined,
      onOpen: (buttons) => {
        close = () => buttons[0]?.click();
      },
    });
  } finally {
    window.removeEventListener("keydown", onKey);
  }
  return picked;
}

/** One army slot as the hero sheet shows it (empty: no creature, count 0). */
export interface ArmySlotView {
  slot: number;
  creature: string | null;
  /** The creature's name, plural unless the count is 1; "" when empty. */
  name: string;
  count: number;
}

/** Every slot of an army, empty ones included, in slot order. */
export function armySlotViews(army: ArmySlots): ArmySlotView[] {
  return army.map((stack, slot) => {
    if (stack === null || !isCreatureId(stack.creature)) {
      return { slot, creature: null, name: "", count: 0 };
    }
    const def = getCreature(stack.creature);
    return {
      slot,
      creature: stack.creature,
      name: stack.count === 1 ? def.name : def.plural,
      count: stack.count,
    };
  });
}

export interface HeroArmyOptions {
  /** The slot picked to move (highlighted). */
  selected?: number | null;
  /** Makes the slots clickable (rearranging); read-only without it. */
  onSlot?: (slot: number, e: MouseEvent) => void;
}

/**
 * Pixels from the top of an army slot to the ground line the creatures
 * stand on: the tallest battle sprite (104 px, feet at 102) fits above it.
 */
export const ARMY_GROUND_Y = 104;

/**
 * One stack as it stands in battle (bead bzc.45): the full battle sprite at
 * native size, its feet on the slot's ground line over a small shadow, and
 * the count badge. No name: the creature card is on hover.
 */
export function armyFigure(creature: string, count: number): HTMLElement[] {
  const art = unitArt(creature);
  const { anchor, feet } = art;
  const sprite = img(art.key, "hs-army-sprite");
  sprite.style.left = `calc(50% - ${anchor.x}px)`;
  sprite.style.top = `${ARMY_GROUND_Y - feet.contactY}px`;
  const shadow = el("span.hs-army-shadow");
  const half = Math.max(12, Math.round((feet.baseRight - feet.baseLeft) / 2));
  const mid = Math.round((feet.baseLeft + feet.baseRight) / 2) - anchor.x;
  shadow.style.width = `${half * 2 + 8}px`;
  shadow.style.left = `calc(50% + ${mid - half - 4}px)`;
  return [shadow, sprite, el("span.hs-army-count", String(count))];
}

/**
 * The hero sheet's Army section (beads tez, bzc.45): one cell per army
 * slot, empty ones included, each filled one with the creature's battle
 * sprite standing on the ground line and its count; the creature card on
 * hover; the army's fight value in the head.
 */
export function heroArmySection(
  army: ArmySlots,
  options: HeroArmyOptions = {},
): HTMLElement {
  const views = armySlotViews(army);
  const filled = views.filter((v) => v.creature !== null).length;
  const value = el("span.hs-army-value", `Fight value ${armyValue(army)}`);
  setTip(
    value,
    "Fight value: each creature's fight value times its count, summed. The hero's Attack and Defense add to it in battle.",
  );
  const head = el(
    "div.hs-army-head",
    el("h3", `Army (${filled} / ${views.length})`),
    value,
  );
  return el("section.hs-army-section", head, armyBand(army, options));
}

export interface ArmyBandOptions extends HeroArmyOptions {
  /**
   * A stack picked up in another army (the town's other row, bead
   * bzc.61): every slot of this band is a place to put it.
   */
  pickedElsewhere?: ArmySlotView | null;
}

/**
 * The army band alone (beads bzc.45, bzc.61): one cell per slot, each
 * filled one with its battle sprite on the ground line and its count, the
 * creature card and the click hint on hover. The hero sheet heads it with
 * the army's size and fight value; the town stacks two of them, garrison
 * over visiting hero, slot for slot.
 */
export function armyBand(
  army: ArmySlots,
  options: ArmyBandOptions = {},
): HTMLElement {
  const views = armySlotViews(army);
  const onSlot = options.onSlot;
  const row = el("div.hs-army");
  const picked = options.selected ?? null;
  const elsewhere = options.pickedElsewhere ?? null;
  for (const v of views) {
    const cell = el("div.hs-army-slot");
    cell.setAttribute("data-slot", String(v.slot));
    // What a click does here, at the foot of the slot's card (bead bzc.69:
    // the section's instruction line moved into the cards).
    const hint =
      onSlot === undefined
        ? null
        : armySlotHint(views, picked, v.slot, elsewhere);
    if (v.creature === null) {
      cell.classList.add("hs-army-empty");
      cell.append(el("span.hs-army-spot"));
      cell.setAttribute("aria-label", "Empty slot");
      if (hint !== null) setTip(cell, `Empty slot\n${hint}`);
    } else {
      const creature = v.creature;
      cell.append(...armyFigure(creature, v.count));
      cell.setAttribute("aria-label", `${v.count} ${v.name}`);
      setTip(cell, () => withHint(creatureTip(creature, v.count), hint));
    }
    if (picked === v.slot) cell.classList.add("hs-selected");
    if (onSlot !== undefined) {
      cell.classList.add("hs-army-clickable");
      // With a stack picked, every other slot is a place to put it.
      if (
        (picked !== null && picked !== v.slot) ||
        (elsewhere !== null && elsewhere.creature !== null)
      ) {
        cell.classList.add("hs-army-target");
      }
      cell.addEventListener("click", (e) => onSlot(v.slot, e));
    }
    row.append(cell);
  }
  return row;
}

/**
 * What a click on army slot `slot` does, for its hover card: pick the
 * stack up, or, with one picked, move, merge or swap it (shift-click
 * splits). Null when a click does nothing (an empty slot, nothing picked).
 * `elsewhere` is a stack picked up in another army (the town's other row):
 * it stands in for `picked`.
 */
export function armySlotHint(
  views: readonly ArmySlotView[],
  picked: number | null,
  slot: number,
  elsewhere: ArmySlotView | null = null,
): string | null {
  const here = views[slot];
  if (here === undefined) return null;
  if (elsewhere === null && picked === null) {
    return here.creature === null
      ? null
      : "Click to pick this stack up, then click another slot to move, merge or swap it. Shift-click there to split it.";
  }
  if (elsewhere === null && picked === slot)
    return "Picked up. Click it again to put it back.";
  const from = elsewhere ?? (picked === null ? undefined : views[picked]);
  if (from === undefined || from.creature === null) return null;
  if (here.creature === null) {
    return "Click: move the picked stack here. Shift-click: move half of it.";
  }
  if (here.creature === from.creature) {
    return "Click: merge the picked stack into this one. Shift-click: move half of it.";
  }
  return "Click: swap the two stacks.";
}

/** A hover card with a dim last line (the click hint), if any. */
function withHint(card: TipBody, hint: string | null): TipBody {
  if (hint === null) return card;
  if (typeof card === "string") return `${card}\n${hint}`;
  (card as HTMLElement).append(
    el("div.gm-tip-line.gm-tip-dim.hs-tip-hint", hint),
  );
  return card;
}

/**
 * The Unspent Page chooser: which battle page the Marvel keeps (chosen on
 * the map; without a choice the highest-tier page).
 */
export function unspentChooser(
  h: HeroState,
  onPick: (page: string) => void,
): HTMLElement {
  const choices = unspentPageChoices(h);
  const kept = unspentPageOf(h);
  const row = el("label.hs-unspent-row", el("b", "Unspent Page keeps: "));
  if (choices.length === 0) {
    row.append(el("span.hs-dim", "no battle page in the book"));
    return row;
  }
  const select = el("select.hs-unspent-select");
  select.setAttribute("aria-label", "Page The Unspent Page keeps");
  for (const id of choices) {
    const o = el("option", isSpell(id) ? spellInfo(id).name : id);
    o.value = id;
    o.selected = id === kept;
    select.append(o);
  }
  select.addEventListener("change", () => onPick(select.value));
  row.append(select);
  setTip(
    row,
    () =>
      "The Unspent Page: this page is never spent in battle; it still costs mana and the round's cast. Without a choice the highest-tier page is kept.",
  );
  return row;
}

// ------------------------------------------------------------------ level-up

function offerTitle(o: SkillOffer, hero: HeroState): string {
  if (o.kind === "stat") {
    return `+1 ${STAT_NAMES[o.stat]} (${heroStats(hero)[o.stat] + 1})`;
  }
  const name = findSkill(o.skill)?.name ?? o.skill;
  return o.kind === "new" ? `${name} 1` : `${name} ${o.rank}`;
}

/**
 * A level-up card's details button (bead bzc.108): the same card the hero
 * sheet shows, on hover, focus, click or tap; the click does not pick.
 */
function detailsButton(name: string, card: () => TipBody): HTMLElement {
  const b = el("button.hs-card-details", "i");
  b.setAttribute("type", "button");
  b.setAttribute("aria-label", `Details of ${name}`);
  return setInspect(b, card, "details");
}

/**
 * One level-up skill card (bead bzc.108: every option's full effect is
 * read before choosing): the offered rank's rule bright, with the skill's
 * other ranks dim under it, what the hero holds now, and a details button
 * for the hero sheet's card.
 */
export function offerCard(o: SkillOffer, hero: HeroState): HTMLElement {
  const card = el("div.hs-card");
  if (o.kind === "stat") {
    card.append(
      detailsButton(STAT_NAMES[o.stat], () => statTipCard(o.stat)),
      el("div.hs-card-kind", "Primary stat"),
      ...cardIcon("stat", o.stat),
      el("div.hs-card-name", `+1 ${STAT_NAMES[o.stat]}`),
      el("div.hs-card-text", STAT_TEXT[o.stat]),
    );
    card.dataset["offer"] = `stat:${o.stat}`;
    return card;
  }
  const def = findSkill(o.skill);
  const rank = o.kind === "new" ? 1 : o.rank;
  const held = hero.skills.find((s) => s.id === o.skill)?.rank ?? 0;
  card.append(
    detailsButton(def?.name ?? o.skill, () => skillTipCard(o.skill, rank)),
    el("div.hs-card-kind", o.kind === "new" ? "New skill" : "Upgrade"),
    ...cardIcon("skill", o.skill),
    el("div.hs-card-name", `${def?.name ?? o.skill}`),
    el("div.hs-card-rank", RANK_WORDS[rank - 1] ?? ""),
    // The whole ladder, the offered rank bright.
    el("div.hs-card-text.hs-card-ranks", ...skillRankLines(o.skill, rank)),
  );
  if (held > 0)
    card.append(
      el("div.hs-card-held", `You hold ${RANK_WORDS[held - 1] ?? ""} now.`),
    );
  if (def?.family !== undefined) card.classList.add(`hs-family-${def.family}`);
  if (o.kind === "new" && hero.skills.length >= MAX_SKILLS - 1) {
    card.append(el("div.hs-card-warn", "Fills your last skill slot."));
  }
  card.dataset["offer"] = `skill:${o.skill}`;
  return card;
}

/** The big icon of a level-up card (2x), or nothing when it has none. */
function cardIcon(kind: IconKind, id: string): HTMLElement[] {
  if (iconFor(kind, id).fallback) return [];
  const icon = iconElement(kind, id, { scale: 2 });
  icon.removeAttribute("title");
  return [el("div.hs-card-icon", icon)];
}

function featCard(id: string): HTMLElement {
  const def = findFeat(id);
  const vowed = def?.restriction !== undefined;
  const card = el(
    "div.hs-card",
    detailsButton(def?.name ?? id, () => featTipCard(id)),
    el("div.hs-card-kind", vowed ? "Vow" : "Feat"),
    ...cardIcon(vowed ? "vow" : "feat", id),
    el("div.hs-card-name", def?.name ?? id),
    el("div.hs-card-text", def?.text ?? ""),
  );
  if (def?.restrictionText !== undefined) {
    card.classList.add("hs-vow");
    card.append(
      el("div.hs-restriction", `Restriction: ${def.restrictionText}`),
    );
  }
  return card;
}

/**
 * The level-up draft (RULES_V2 3.3, 3.5): three cards; click one (or its
 * button). Resolves with the chosen index.
 */
export function levelUpDialog(
  state: GameState,
  hero: HeroState,
  offer: LevelUpOffer,
  portrait: string,
): Promise<number> {
  const cls = getHeroClass(hero.heroClass);
  const cards =
    offer.step === "skill"
      ? offer.offers.map((o) => offerCard(o, hero))
      : offer.offers.map((id) => featCard(id));
  const stats = heroStats(hero);
  const intro =
    offer.step === "skill"
      ? `${hero.name} reached level ${offer.level}: +1 ${STAT_NAMES[patternStat(cls, offer.level)]} from the ${cls.name}'s pattern. Choose a skill.`
      : `Every third level brings a feat. Choose one; a vow binds the hero for good.`;
  const body = el(
    "div.hs-draft",
    el(
      "div.hs-draft-top",
      img(portrait, "gm-levelup-portrait", 2),
      el(
        "div",
        el("p", intro),
        el(
          "p.gm-dim",
          `${cls.name}. ${PRIMARY_STATS.map((s) => `${STAT_NAMES[s]} ${stats[s]}`).join(", ")}. Skills ${hero.skills.length} / ${MAX_SKILLS}.`,
        ),
      ),
    ),
    el("div.hs-cards", ...cards),
  );
  void state;
  return modal<number>({
    title:
      offer.step === "skill"
        ? `${hero.name}: level ${offer.level}!`
        : `${hero.name}: a feat`,
    className: "hs-draft-dialog",
    body,
    buttons: offer.offers.map((o, i) => ({
      label:
        offer.step === "skill"
          ? offerTitle(o as SkillOffer, hero)
          : (findFeat(o as string)?.name ?? String(o)),
      value: i,
      primary: i === 0,
    })),
    onOpen: (buttons) => {
      cards.forEach((card, i) => {
        card.addEventListener("click", () => buttons[i]?.click());
        card.addEventListener("mouseenter", () =>
          buttons[i]?.classList.add("hs-hot"),
        );
        card.addEventListener("mouseleave", () =>
          buttons[i]?.classList.remove("hs-hot"),
        );
      });
    },
  });
}
