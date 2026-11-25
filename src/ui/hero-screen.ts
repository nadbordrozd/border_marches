/**
 * Hero screens (RULES_V2 3 and 4): the hero sheet (stats with their
 * sources, skills, feats and vows, the paper doll of eleven worn slots,
 * the backpack and the scroll case; click or drag to equip), the level-up
 * draft dialog and the item part of the meeting screen. Icons are
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
  handOver,
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
import {
  CONSUMABLES_PER_SLOT,
  SLOT_NAMES,
  WORN_SLOTS,
  findArtifact,
  gradeLabel,
  wornDef,
  type ArtifactDef,
} from "../data/artifacts.ts";
import { namedHeroPortrait } from "../assets/unit-art.ts";
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
import { spellTip } from "./info-tips.ts";
import { setTip } from "./tooltip.ts";
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
function scrollIcon(spell: string): HTMLElement {
  const name = isSpell(spell) ? spellInfo(spell).name : spell;
  const icon = ownIcon("spell", spell);
  const node =
    icon === null
      ? el("div.hs-item.hs-scroll", initials(name.replace(/-/g, " ")))
      : el("div.hs-item.hs-scroll.hs-has-icon", icon);
  node.title = `Scroll: ${name}. Any hero may cast it once, at no mana.`;
  return node;
}

/** A small icon before a skill, feat or stat name (none if it has none). */
function nameIcon(kind: IconKind, id: string): HTMLElement[] {
  const icon = ownIcon(kind, id);
  if (icon === null) return [];
  icon.classList.add("hs-name-icon");
  return [icon];
}

function statTooltip(hero: HeroState, stat: PrimaryStat): string {
  const parts = statBreakdown(hero, stat)
    .map((c) => `${c.label} ${c.amount >= 0 ? "+" : ""}${c.amount}`)
    .join("\n");
  return `${STAT_NAMES[stat]}: ${STAT_TEXT[stat]}\n${parts}`;
}

/** Backpack entries grouped as slots: consumables stack three a slot. */
function backpackSlots(
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

/** Paper-doll grid positions of the eleven worn slots (column, row). */
const DOLL: ReadonlyArray<[number, number]> = [
  [2, 1], // head
  [2, 2], // neck
  [2, 3], // torso
  [3, 2], // cloak
  [1, 3], // weapon
  [3, 3], // shield
  [1, 4], // ring
  [3, 4], // ring
  [2, 5], // feet
  [1, 5], // pocket
  [3, 5], // pocket
];

type Selection =
  | { place: "worn"; index: number }
  | { place: "backpack"; index: number }
  | null;

/**
 * The hero sheet. Click an item to select it (its details and actions
 * show), double-click to wear, take off or use it, or drag it between the
 * backpack and the paper doll.
 */
export async function openHeroScreen(
  host: HeroScreenHost,
  heroId: string,
): Promise<void> {
  let selected: Selection = null;
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
      const cell = el("div.hs-slot");
      const [col, row] = DOLL[i] as [number, number];
      cell.style.gridColumn = String(col);
      cell.style.gridRow = String(row);
      cell.append(el("span.hs-slot-name", SLOT_NAMES[kind]));
      if (selected?.place === "worn" && selected.index === i) {
        cell.classList.add("hs-selected");
      }
      if (id !== null) {
        const icon = itemIcon(id);
        drag(icon, { place: "worn", index: i });
        cell.append(icon);
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
    const skills = el("div.hs-skills");
    for (let i = 0; i < MAX_SKILLS; i++) {
      const s = h.skills[i];
      if (s === undefined) {
        skills.append(el("div.hs-skill.hs-empty", "Empty skill slot"));
        continue;
      }
      const def = findSkill(s.id);
      const pips = el("span.hs-pips");
      for (let r = 1; r <= 3; r++) {
        pips.append(el(r <= s.rank ? "span.hs-pip.hs-on" : "span.hs-pip"));
      }
      const node = el(
        "div.hs-skill",
        ...nameIcon("skill", s.id),
        el("span.hs-skill-name", def?.name ?? s.id),
        pips,
      );
      node.title = def
        ? def.ranks
            .map(
              (r, k) =>
                `${k + 1 === s.rank ? "> " : "  "}Rank ${k + 1}: ${r.text}`,
            )
            .join("\n")
        : s.id;
      skills.append(node);
    }
    const feats = el("div.hs-feats");
    if (h.feats.length === 0) {
      feats.append(el("div.gm-dim", "No feats yet: one every third level."));
    }
    for (const id of h.feats) {
      const def = findFeat(id);
      const vowed = def?.restriction !== undefined;
      const node = el(
        "div.hs-feat",
        el(
          "div.hs-feat-head",
          ...nameIcon(vowed ? "vow" : "feat", id),
          el("b", def?.name ?? id),
        ),
        el("div", def?.text ?? ""),
      );
      if (def?.restrictionText !== undefined) {
        node.classList.add("hs-vow");
        node.append(el("div.hs-restriction", def.restrictionText));
      }
      feats.append(node);
    }
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
      skills,
      ranks === "" ? el("div") : el("div.hs-dim", `School ranks: ${ranks}`),
      el("h3", "Feats and vows"),
      feats,
      el("h3", `Backpack (${backpackSize(h)})`),
      pack,
    );
    // The scroll case under the doll and the book under the stats keep
    // the sheet within a 800 px window (bead bzc.25).
    middle.append(
      el("h3", `Scroll case (${h.scrolls.length} / ${scrollCaseSize(h)})`),
      scrolls,
    );
    left.append(el("h3", `Book (${h.pages.length} pages)`), bookPages(h));
    if (holdsUnspentPage(h)) {
      left.append(
        unspentChooser(h, (page) =>
          act(chooseUnspentPage(host.state(), heroId, page)),
        ),
      );
    }

    body.replaceChildren(el("div.hs-columns", left, middle, right), details(h));
  };

  /** The selected item's text and the actions it allows. */
  const details = (h: HeroState): HTMLElement => {
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
    if (selected === null) {
      box.append(
        el(
          "div.hs-dim",
          "Click an item for details. Double-click or drag to wear, take off or use it.",
        ),
      );
      return box;
    }
    const sel = selected;
    const id = sel.place === "worn" ? h.worn[sel.index] : h.backpack[sel.index];
    if (id === undefined || id === null) return box;
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

// ------------------------------------------------------------------ meeting

/**
 * The items half of a meeting (RULES_V2 5.3): each hero's worn items,
 * backpack and scrolls; click one to hand it to the other hero.
 */
export function meetingItems(
  host: HeroScreenHost,
  aId: string,
  bId: string,
  rerender: () => void,
): HTMLElement {
  const s = host.state();
  const a = s.heroes.find((h) => h.id === aId);
  const b = s.heroes.find((h) => h.id === bId);
  const box = el("div.hs-trade");
  if (a === undefined || b === undefined) return box;
  const side = (from: HeroState, to: HeroState): HTMLElement => {
    const items = el("div.hs-trade-items");
    const add = (
      node: HTMLElement,
      ref: Parameters<typeof handOver>[3],
    ): void => {
      node.classList.add("hs-tradeable");
      node.title += `\nClick: give to ${to.name}.`;
      node.addEventListener("click", () => {
        host.run(handOver(host.state(), from.id, to.id, ref));
        rerender();
      });
      items.append(node);
    };
    from.worn.forEach((id, index) => {
      if (id === null) return;
      const icon = itemIcon(id);
      icon.classList.add("hs-worn-mark");
      add(icon, { place: "worn", index });
    });
    from.backpack.forEach((id, index) =>
      add(itemIcon(id), { place: "backpack", index }),
    );
    from.scrolls.forEach((spell, index) =>
      add(scrollIcon(spell), { place: "scrolls", index }),
    );
    if (items.childElementCount === 0) {
      items.append(el("span.gm-dim", "No items."));
    }
    return el(
      "div.hs-trade-side",
      el("div.hs-trade-label", `${from.name}'s items`),
      items,
    );
  };
  box.append(
    side(a, b),
    side(b, a),
    el(
      "div.gm-hint",
      "Click an item to hand it over; worn items arrive in the backpack. Cursed worn items cannot be handed over.",
    ),
  );
  return box;
}
