// The hero sheet's tiles, doll and hover hints (bead border_marches-bzc.69,
// UI_V2 UI2-19): skills, feats and vows as icon tiles with the name under
// the icon and the rules in a shared-tooltip card (so the bzc.46 keyword
// boxes appear); empty doll slots as outlines with no caption; the sheet's
// instruction lines moved into the hover cards of what they describe.
import { describe, expect, it } from "vitest";
import type { HeroState } from "../../src/core/game/index.ts";
import type { ArmySlots } from "../../src/core/game/types.ts";
import {
  ARTIFACT_LIST,
  SLOT_NAMES,
  WORN_SLOTS,
} from "../../src/data/artifacts.ts";
import { CREATURES } from "../../src/data/creatures.ts";
import { FEAT_LIST, isVow } from "../../src/data/feats.ts";
import { findKeywords } from "../../src/data/keywords.ts";
import { MAX_SKILLS, SKILLS, findSkill } from "../../src/data/skills.ts";
import type { CreatureId } from "../../src/data/types.ts";
import {
  RANK_WORDS,
  armySlotHint,
  armySlotViews,
  dollSlot,
  featTiles,
  featTipCard,
  heroArmySection,
  itemHint,
  skillTiles,
  skillTipCard,
} from "../../src/ui/hero-screen.ts";
import { useFakeDocument, type FakeElement } from "./fake-dom.ts";

useFakeDocument();

const skillIds = Object.keys(SKILLS);
const feat = FEAT_LIST.find((f) => !isVow(f));
const vow = FEAT_LIST.find((f) => isVow(f));
if (feat === undefined || vow === undefined) throw new Error("no feat/vow");

/** Only the fields the tile builders read. */
function hero(over: Partial<HeroState>): HeroState {
  return { skills: [], feats: [], ...over } as unknown as HeroState;
}

const node = (n: unknown): FakeElement => n as FakeElement;

describe("hero sheet skill tiles", () => {
  const h = hero({
    skills: skillIds.slice(0, 4).map((id, i) => ({
      id: id as HeroState["skills"][number]["id"],
      rank: 1 + (i % 3),
    })),
  });

  it("shows every slot: icon, name under it and the rank word", () => {
    const tiles = node(skillTiles(h)).all("hs-tile");
    expect(tiles).toHaveLength(MAX_SKILLS);
    for (const [i, s] of h.skills.entries()) {
      const tile = tiles[i] as FakeElement;
      expect(tile.classList.contains("hs-skill")).toBe(true);
      expect(tile.one("hs-tile-name")?.textContent).toBe(findSkill(s.id)?.name);
      expect(tile.one("hs-tile-sub")?.textContent).toBe(RANK_WORDS[s.rank - 1]);
      // The name comes after the icon (when the skill has one).
      const kids = tile.children.map((c) => c.className);
      expect(kids.at(-2)).toBe("hs-tile-name");
    }
    // Empty slots are bare sockets with nothing written in them.
    const empty = tiles.slice(h.skills.length);
    expect(empty).toHaveLength(MAX_SKILLS - h.skills.length);
    for (const t of empty) {
      expect(t.classList.contains("hs-tile-empty")).toBe(true);
      expect(t.textContent).toBe("");
    }
  });

  it("puts the rules in the shared tooltip, not a native title", () => {
    for (const t of node(skillTiles(h)).all("hs-tile")) {
      expect(t.hasAttribute("title")).toBe(false);
      expect(t.hasAttribute("data-tip")).toBe(true);
    }
  });

  it("lists every rank's rule in the card, naming the held rank", () => {
    const id = skillIds[0] as string;
    const def = findSkill(id);
    if (def === undefined) throw new Error("no skill");
    const card = node(skillTipCard(id, 3));
    expect(card.textContent).toContain(def.name);
    expect(card.textContent).toContain(`Expert ${def.family} skill`);
    for (const r of def.ranks) expect(card.textContent).toContain(r.text);
    // Ranks not held are dimmed; the held one is not.
    const lines = card.all("gm-tip-line");
    expect(lines.map((l) => l.classList.contains("gm-tip-dim"))).toEqual([
      true,
      true,
      false,
    ]);
  });
});

describe("hero sheet feat tiles", () => {
  it("shows feats and vows as tiles with the kind under the name", () => {
    const tiles = node(featTiles(hero({ feats: [feat.id, vow.id] }))).all(
      "hs-tile",
    );
    expect(tiles.map((t) => t.one("hs-tile-name")?.textContent)).toEqual([
      feat.name,
      vow.name,
    ]);
    expect(tiles.map((t) => t.one("hs-tile-sub")?.textContent)).toEqual([
      "Feat",
      "Vow",
    ]);
    expect(tiles.map((t) => t.classList.contains("hs-vow"))).toEqual([
      false,
      true,
    ]);
    for (const t of tiles) {
      expect(t.hasAttribute("title")).toBe(false);
      expect(t.hasAttribute("data-tip")).toBe(true);
      // No rules paragraph on the sheet itself.
      expect(t.textContent).not.toContain(feat.text);
    }
  });

  it("says when there are none yet", () => {
    const box = node(featTiles(hero({})));
    expect(box.all("hs-tile")).toHaveLength(0);
    expect(box.textContent).toContain("No feats yet");
  });

  it("carries the rule and a vow's restriction in the card", () => {
    const card = node(featTipCard(vow.id));
    expect(card.textContent).toContain(vow.text);
    expect(card.textContent).toContain(`Restriction: ${vow.restrictionText}`);
    expect(node(featTipCard(feat.id)).textContent).toContain(feat.text);
    expect(node(featTipCard(feat.id)).textContent).not.toContain("Restriction");
  });

  it("uses glossary words, so the card gets keyword boxes", () => {
    // The shared tooltip highlights and explains these (bead bzc.46).
    const spill = FEAT_LIST.find((f) => f.id === "spillover");
    expect(spill).toBeDefined();
    const ids = findKeywords(spill?.text ?? "").map((m) => m.id);
    expect(ids).toContain("bane");
  });
});

describe("hero sheet paper doll", () => {
  it("draws an empty slot as an outline with no caption", () => {
    for (const kind of new Set(WORN_SLOTS)) {
      const cell = node(dollSlot(kind, null));
      expect(cell.classList.contains("hs-slot-empty")).toBe(true);
      expect(cell.dataset["outline"]).toBe(kind);
      expect(cell.textContent).toBe("");
      expect(cell.getAttribute("aria-label")).toBe(
        `${SLOT_NAMES[kind]} (empty)`,
      );
      // The slot's name and what to do with it are in the hover card.
      expect(cell.hasAttribute("data-tip")).toBe(true);
    }
  });

  it("shows a worn item with its card and no outline", () => {
    const item = ARTIFACT_LIST.find((a) => a.kind === "worn");
    if (item === undefined || item.kind !== "worn") throw new Error("none");
    const cell = node(dollSlot(item.slot, item.id));
    expect(cell.classList.contains("hs-slot-empty")).toBe(false);
    const icon = cell.one("hs-item");
    expect(icon).toBeDefined();
    expect(icon?.hasAttribute("title")).toBe(false);
    expect(icon?.hasAttribute("data-tip")).toBe(true);
  });

  it("says what a double-click or drag does with an item", () => {
    const worn = ARTIFACT_LIST.find((a) => a.kind === "worn" && !a.cursed);
    const cursed = ARTIFACT_LIST.find((a) => a.kind === "worn" && a.cursed);
    const potion = ARTIFACT_LIST.find((a) => a.kind === "consumable");
    expect(itemHint("worn", worn?.id ?? "")).toContain("take it off");
    expect(itemHint("worn", cursed?.id ?? "")).toContain("Cursed");
    expect(itemHint("backpack", worn?.id ?? "")).toContain("wear it");
    expect(itemHint("backpack", potion?.id ?? "")).toContain("use it");
  });
});

describe("hero sheet army hints", () => {
  const ids = Object.keys(CREATURES) as CreatureId[];
  const [a, b] = [ids[0], ids[3]] as [CreatureId, CreatureId];
  const army: ArmySlots = [
    { creature: a, count: 10 },
    null,
    { creature: b, count: 3 },
    { creature: a, count: 4 },
    null,
    null,
    null,
  ];
  const views = armySlotViews(army);

  it("says what a click on each slot does", () => {
    expect(armySlotHint(views, null, 0)).toContain("pick this stack up");
    expect(armySlotHint(views, null, 1)).toBeNull();
    expect(armySlotHint(views, 0, 0)).toContain("put it back");
    expect(armySlotHint(views, 0, 1)).toContain("move the picked stack");
    expect(armySlotHint(views, 0, 3)).toContain("merge");
    expect(armySlotHint(views, 0, 2)).toContain("swap");
  });

  it("moves the instruction line into the slots' cards", () => {
    const live = node(heroArmySection(army, { selected: 0, onSlot: () => {} }));
    expect(live.textContent).not.toContain("Click a stack");
    const slots = live.all("hs-army-slot");
    // With a stack picked, empty slots get a card saying "move here".
    expect(slots[1]?.hasAttribute("data-tip")).toBe(true);
    // Read-only, empty slots stay silent.
    const still = node(heroArmySection(army));
    expect(still.all("hs-army-slot")[1]?.hasAttribute("data-tip")).toBe(false);
  });
});
