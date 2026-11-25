/**
 * Hero screens (RULES_V2 3 and 4): the hero sheet (stats with their
 * sources, skills, feats and vows, the paper doll of eleven worn slots,
 * the backpack and the scroll case; click or drag to equip; the army
 * travelling with the hero, rearranged by clicks) and the level-up
 * draft dialog; the meeting screen (meeting.ts) reuses its pieces. Icons are
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
  equip,
  heroSpecialty,
  heroStats,
  holdsUnspentPage,
  manaRegen,
  maxMana,
  movementBreakdown,
  patternStat,
  pendingLevel,
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
  xpForLevel,
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
  wornDef,
  type ArtifactDef,
  type SlotKind,
} from "../data/artifacts.ts";
import { namedHeroPortrait, unitArt } from "../assets/unit-art.ts";
import { COMMANDS, getHeroClass } from "../data/classes.ts";
import {
  PRIMARY_STATS,
  SCHOOLS,
  SCHOOL_NAMES,
  STAT_NAMES,
  type PrimaryStat,
} from "../data/effects.ts";
import { findFeat } from "../data/feats.ts";
import { MAX_SKILLS, findSkill } from "../data/skills.ts";
import { iconFor, type IconKind } from "../assets/icons.ts";
import { isSpell, spellInfo } from "../core/magic/catalog.ts";
import { button, el, img, modal } from "./dom.ts";
import { iconElement } from "./icons.ts";
import { armyValue } from "./hints.ts";
import { creatureTip, spellTip } from "./info-tips.ts";
import { setTip, tipCard, titleCard, type TipBody } from "./tooltip.ts";
import "./hero.css";

/** What the hero screens need from the game screen. */
export interface HeroScreenHost {
  state(): GameState;
  /** Applies a command; false (with a message shown) when it failed. */
  run(result: CommandResult): boolean;
}

const STAT_TEXT: Readonly<Record<PrimaryStat, string>> = {
  attack: "Added to the Attack of every stack in the hero's army.",
  defense: "Added to the Defense of every stack in the hero's army.",
  power: "The P in every spell: bigger Harm, heals and summons.",
  lore: "Maximum mana 10 x Lore; daily return 1 + Lore / 3.",
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
  return withHint(titleCard(itemTooltip(id)), hint);
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

/** A skill's hover card: every rank's rule, the held one bright. */
export function skillTipCard(id: string, rank: number): TipBody {
  const def = findSkill(id);
  if (def === undefined) return id;
  const word = RANK_WORDS[rank - 1] ?? "";
  return tipCard(
    def.name,
    def.ranks.map((r, k) => {
      const line = el("div.gm-tip-line", el("b", `${RANK_WORDS[k]}: `), r.text);
      if (k + 1 !== rank) line.classList.add("gm-tip-dim");
      return line;
    }),
    {
      icon: ownIcon("skill", id),
      subtitle: `${word} ${FAMILY_WORDS[def.family] ?? "skill"}`.trim(),
    },
  );
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

function statTooltip(hero: HeroState, stat: PrimaryStat): string {
  const parts = statBreakdown(hero, stat)
    .map((c) => `${c.label} ${c.amount >= 0 ? "+" : ""}${c.amount}`)
    .join("\n");
  return `${STAT_NAMES[stat]}: ${STAT_TEXT[stat]}\n${parts}`;
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

/**
 * The hero sheet. Click an item to select it (its details and actions
 * show), double-click to wear, take off or use it, or drag it between the
 * backpack and the paper doll. The army band below shows every slot as the
 * stacks stand in battle; on the owner's turn they rearrange like the town
 * screen's.
 */
export async function openHeroScreen(
  host: HeroScreenHost,
  heroId: string,
): Promise<void> {
  let selected: Selection = null;
  /** The army slot picked to move, merge, swap or split. */
  let armySel: number | null = null;
  const body = el("div.hs-sheet");
  const hero = (): HeroState | undefined =>
    host.state().heroes.find((h) => h.id === heroId);

  const act = (result: CommandResult): void => {
    if (host.run(result)) selected = null;
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

  const render = (): void => {
    const h = hero();
    if (h === undefined) return;
    const cls = getHeroClass(h.heroClass);
    const stats = heroStats(h);

    // ---- left: identity and numbers
    const next = xpForLevel(h.level + 1);
    const prev = xpForLevel(h.level);
    const xpPct = Math.max(
      0,
      Math.min(100, ((h.xp - prev) / (next - prev)) * 100),
    );
    const statRows = PRIMARY_STATS.map((stat) => {
      const row = el(
        "div.hs-stat",
        el("span.hs-stat-name", STAT_NAMES[stat]),
        el("span.hs-stat-value", String(stats[stat])),
      );
      const bonus = stats[stat] - h[stat];
      if (bonus !== 0) {
        row.append(el("span.hs-stat-bonus", `${bonus > 0 ? "+" : ""}${bonus}`));
      }
      row.title = statTooltip(h, stat);
      return row;
    });
    const move = movementBreakdown(h);
    const numbers: Array<[string, string, string]> = [
      [
        "Mana",
        `${h.mana} / ${maxMana(h)}`,
        `Maximum 10 x Lore plus modifiers; +${manaRegen(h)} each day.`,
      ],
      [
        "Movement",
        `${h.mp} / ${h.maxMp}`,
        `Base ${move.base} from the slowest creature, +${move.percent}%, +${move.flat}; ${move.total} tomorrow.`,
      ],
      ["Sight", String(sightRadius(h)), "Cells seen around the hero (max 12)."],
      [
        "Morale",
        signed(armyMorale(h)),
        "At battle start the strongest stacks start Heartened (or Shaken).",
      ],
      [
        "Luck",
        signed(armyLuck(h)),
        "At battle start the strongest stacks start Lucky (or Jinxed).",
      ],
    ];
    const command = COMMANDS[cls.command];
    const spec = heroSpecialty(h);
    const left = el(
      "div.hs-col.hs-left",
      el(
        "div.hs-id",
        img(namedHeroPortrait(h.defId, h.heroClass).key, "hs-portrait", 2),
        el(
          "div",
          el("div.hs-name", h.name),
          el("div.hs-class", `Level ${h.level} ${cls.name}`),
        ),
      ),
      meter(`XP ${h.xp} / ${next}`, xpPct, "hs-xp"),
      el("div.hs-stats", ...statRows),
      el(
        "div.hs-numbers",
        ...numbers.map(([k, v, tip]) => {
          const n = el("div.hs-number", el("span", k), el("b", v));
          n.title = tip;
          return n;
        }),
      ),
      command === undefined
        ? el("div")
        : titled(
            el(
              "div.hs-note",
              el("b", `Command: ${command.name}`),
              ` (C ${commandStrength(h)})`,
            ),
            command.text,
          ),
      spec === undefined
        ? el("div")
        : el("div.hs-note", el("b", "Specialty: "), specialtyText(spec)),
      pendingNote(h),
    );

    // ---- middle: paper doll
    const doll = el("div.hs-doll");
    WORN_SLOTS.forEach((kind, i) => {
      const id = h.worn[i] ?? null;
      const cell = dollSlot(kind, id);
      const [col, row] = DOLL[i] as [number, number];
      cell.style.gridColumn = String(col);
      cell.style.gridRow = String(row);
      if (selected?.place === "worn" && selected.index === i) {
        cell.classList.add("hs-selected");
      }
      const icon = cell.firstElementChild;
      if (id !== null && icon instanceof HTMLElement) {
        drag(icon, { place: "worn", index: i });
        cell.addEventListener("dblclick", () =>
          act(unequip(host.state(), heroId, i)),
        );
      }
      cell.addEventListener("click", () => {
        selected = id === null ? null : { place: "worn", index: i };
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
      doll.append(cell);
    });
    const middle = el("div.hs-col.hs-middle", el("h3", "Worn"), doll);

    // ---- right: skills, feats, backpack, scrolls
    const ranks = SCHOOLS.filter((sc) => schoolRank(h, sc) > 0)
      .map((sc) => `${SCHOOL_NAMES[sc]} ${schoolRank(h, sc)}`)
      .join(", ");

    const pack = el("div.hs-grid");
    const slots = backpackSlots(h);
    for (let i = 0; i < backpackSize(h); i++) {
      const entry = slots[i];
      const cell = el("div.hs-cell");
      if (entry !== undefined) {
        const icon = itemIcon(entry.id, entry.count);
        setTip(icon, () => itemCard(entry.id, itemHint("backpack", entry.id)));
        drag(icon, { place: "backpack", index: entry.index });
        cell.append(icon);
        if (selected?.place === "backpack" && selected.index === entry.index) {
          cell.classList.add("hs-selected");
        }
        cell.addEventListener("click", () => {
          selected = { place: "backpack", index: entry.index };
          render();
        });
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
      if (spell !== undefined) cell.append(scrollIcon(spell));
      scrolls.append(cell);
    }
    const right = el(
      "div.hs-col.hs-right",
      el("h3", `Skills ${h.skills.length} / ${MAX_SKILLS}`),
      skillTiles(h),
      ranks === "" ? el("div") : el("div.hs-dim", `School ranks: ${ranks}`),
      el("h3", "Feats and vows"),
      featTiles(h),
    );
    // Four columns over the army band keep the sheet within a 1280x800
    // window (beads bzc.25, bzc.45): the scroll case under the doll; the
    // backpack, the book and the selected item's details on the far right.
    middle.append(
      el("h3", `Scroll case (${h.scrolls.length} / ${scrollCaseSize(h)})`),
      scrolls,
    );
    const far = el(
      "div.hs-col.hs-far",
      el("h3", `Backpack (${backpackSize(h)})`),
      pack,
      el("h3", `Book (${h.pages.length} pages)`),
      bookPages(h),
    );
    if (holdsUnspentPage(h)) {
      far.append(
        unspentChooser(h, (page) =>
          act(chooseUnspentPage(host.state(), heroId, page)),
        ),
      );
    }
    const info = details(h);
    if (info !== null) far.append(info);

    // Own stacks rearrange on the owner's turn, as in the town screen.
    const editable = h.owner === host.state().currentPlayer;
    body.replaceChildren(
      el("div.hs-columns", left, middle, right, far),
      heroArmySection(
        h.army,
        editable ? { selected: armySel, onSlot: onArmySlot } : {},
      ),
    );
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
    box.append(info, actions);
    return box;
  };

  render();
  await modal<undefined>({
    title: "Hero sheet",
    body,
    className: "hs-dialog",
    buttons: [{ label: "Close", value: undefined, primary: true }],
    cancel: undefined,
  });
}

/** The hero's pages as spell icons; hover for the spell at its Power. */
function bookPages(h: HeroState): HTMLElement {
  if (h.pages.length === 0) return el("div.hs-dim", "No pages.");
  const power = heroStats(h).power;
  const box = el("div.hs-pages");
  const kept = holdsUnspentPage(h) ? unspentPageOf(h) : undefined;
  for (const id of h.pages) {
    const icon = iconElement("spell", id);
    icon.tabIndex = 0;
    if (id === kept) icon.classList.add("hs-unspent");
    setTip(icon, () => spellTip(id, power));
    box.append(icon);
  }
  return box;
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

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function titled(node: HTMLElement, title: string): HTMLElement {
  node.title = title;
  return node;
}

function meter(label: string, pct: number, kind: string): HTMLElement {
  const fill = el("div.gm-meter-fill");
  fill.classList.add(kind);
  fill.style.width = `${pct}%`;
  return el(
    "div.hs-meter",
    el("div.gm-meter", fill),
    el("div.gm-meter-label", label),
  );
}

function pendingNote(h: HeroState): HTMLElement {
  if (h.pendingLevelUps <= 0) return el("div");
  return el(
    "div.hs-note.hs-pending",
    `Level ${pendingLevel(h)}: a ${h.levelUpStep === "feat" ? "feat" : "skill"} choice is waiting.`,
  );
}

// ------------------------------------------------------------------ level-up

function offerTitle(o: SkillOffer, hero: HeroState): string {
  if (o.kind === "stat") {
    return `+1 ${STAT_NAMES[o.stat]} (${heroStats(hero)[o.stat] + 1})`;
  }
  const name = findSkill(o.skill)?.name ?? o.skill;
  return o.kind === "new" ? `${name} 1` : `${name} ${o.rank}`;
}

function offerCard(o: SkillOffer, hero: HeroState): HTMLElement {
  const card = el("div.hs-card");
  if (o.kind === "stat") {
    card.append(
      el("div.hs-card-kind", "Primary stat"),
      ...cardIcon("stat", o.stat),
      el("div.hs-card-name", `+1 ${STAT_NAMES[o.stat]}`),
      el("div.hs-card-text", STAT_TEXT[o.stat]),
    );
    return card;
  }
  const def = findSkill(o.skill);
  const rank = o.kind === "new" ? 1 : o.rank;
  card.append(
    el("div.hs-card-kind", o.kind === "new" ? "New skill" : "Upgrade"),
    ...cardIcon("skill", o.skill),
    el("div.hs-card-name", `${def?.name ?? o.skill}`),
    el("div.hs-card-rank", ["", "Basic", "Advanced", "Expert"][rank] ?? ""),
    el("div.hs-card-text", def?.ranks[rank - 1]?.text ?? ""),
  );
  if (def?.family !== undefined) card.classList.add(`hs-family-${def.family}`);
  if (o.kind === "new" && hero.skills.length >= MAX_SKILLS - 1) {
    card.append(el("div.hs-card-warn", "Fills your last skill slot."));
  }
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
