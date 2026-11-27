/**
 * The main-menu gallery (bead border_marches-3nb) shows every entry of the
 * content registries: each tab's entry count equals its registries' count,
 * no entry appears twice, and every picture names a real manifest image.
 */
import { describe, expect, it } from "vitest";
import {
  conditionKindIds,
  groundKindIds,
} from "../../src/core/battle/index.ts";
import {
  SUMMONED_CREATURES,
  allSpells,
  registerSpells,
} from "../../src/core/magic/index.ts";
import { ARTIFACT_LIST, HELD_ARTIFACTS } from "../../src/data/artifacts.ts";
import { HERO_CLASSES, NAMED_HEROES } from "../../src/data/classes.ts";
import { CREATURES } from "../../src/data/creatures.ts";
import { RESOURCE_IDS } from "../../src/data/economy.ts";
import { playableFactions } from "../../src/data/factions.ts";
import { FEAT_LIST, HELD_FEATS } from "../../src/data/feats.ts";
import { OBJECT_TYPE_IDS } from "../../src/data/objectTypes.ts";
import { SKILLS } from "../../src/data/skills.ts";
import { DECORATIONS } from "../../src/assets/decorations.ts";
import { assetByKey } from "../../src/assets/manifest.ts";
import { ICON_KINDS } from "../../src/assets/icons.ts";
import {
  GALLERY_TAB_IDS,
  galleryShowsFaction,
  galleryTab,
  isGalleryTab,
  matchesFilters,
  tabEntries,
  type GalleryEntry,
  type GalleryTabId,
} from "../../src/ui/gallery-data.ts";
import { entryKeywords } from "../../src/ui/gallery.ts";
import { explainKeywords, keyword } from "../../src/data/keywords.ts";
import { MAX_BOXES } from "../../src/ui/keywords.ts";
import { abilityText } from "../../src/ui/info-tips.ts";

const count = (id: GalleryTabId): number => tabEntries(galleryTab(id)).length;

describe("gallery tabs match the registries", () => {
  it("creatures: every creature but the Lost World's, and the summons", () => {
    const summons = Object.keys(SUMMONED_CREATURES).filter(
      (id) => !Object.hasOwn(CREATURES, id),
    ).length;
    const expected =
      Object.values(CREATURES).filter((c) => galleryShowsFaction(c.faction))
        .length + summons;
    expect(count("creatures")).toBe(expected);
    const ids = tabEntries(galleryTab("creatures")).map((e) => e.id);
    expect(ids).toContain("squire");
    expect(ids).toContain("bellhop");
    expect(ids).toContain("shade");
    expect(ids).not.toContain("caveman");
    // The Candy Kingdom is playable since bead bzc.117.
    expect(ids).toContain("gingerbread-man");
    expect(ids).toContain("rock-candy-dragon");
  });

  it("summon cards name their abilities, registered by magic or not", () => {
    // Bead bzc.76: the Seedling and Shade cards showed "gone-to-seed" and
    // "fade" when the creatures tab opened before magic registered.
    for (const c of Object.values(SUMMONED_CREATURES))
      for (const a of c.abilities) {
        const t = abilityText(a);
        expect(t.name, a).not.toBe(a);
        expect(t.text, a).toMatch(/^When it dies, \w+/);
      }
    registerSpells();
    expect(abilityText("gone-to-seed")).toEqual({
      name: "Gone to Seed",
      text: "When it dies, brambles of size 4 cover its hex for 3 rounds.",
    });
  });

  it("heroes: the v0.2 classes and named heroes", () => {
    const classes = Object.values(HERO_CLASSES).filter((c) =>
      galleryShowsFaction(c.faction),
    ).length;
    const heroes = NAMED_HEROES.filter((h) =>
      galleryShowsFaction(h.faction),
    ).length;
    expect(count("heroes")).toBe(classes + heroes);
  });

  it("spells: every battle and adventure spell, by school", () => {
    expect(count("spells")).toBe(allSpells().length);
    for (const s of galleryTab("spells").sections) {
      const schools = new Set(
        s.entries.map((e) => allSpells().find((x) => x.id === e.id)?.school),
      );
      expect(schools.size).toBe(1);
    }
  });

  it("artifacts: every artifact, consumable and relic (none held back)", () => {
    // Held: the Deepforge's Pocket Boiler until its integration (bzc.135).
    expect(count("artifacts")).toBe(
      ARTIFACT_LIST.filter((a) => !HELD_ARTIFACTS.has(a.id)).length,
    );
  });

  it("skills and feats: every skill row, feat and vow (none held back)", () => {
    // Held: the Deepforge's Scalding until its integration (bzc.135).
    expect(count("skills")).toBe(
      Object.keys(SKILLS).length +
        FEAT_LIST.filter((f) => !HELD_FEATS.has(f.id)).length,
    );
  });

  it("map objects: every catalogued object type, then the decorations", () => {
    expect(count("objects")).toBe(OBJECT_TYPE_IDS.length + DECORATIONS.length);
    const titles = galleryTab("objects").sections.map((s) => s.title);
    expect(titles.slice(-2)).toEqual([
      "Decorations (passable)",
      "Props (impassable)",
    ]);
    const props = galleryTab("objects").sections.at(-1)?.entries ?? [];
    expect(props.every((e) => e.kind === "decoration")).toBe(true);
    expect(props.length).toBe(DECORATIONS.filter((d) => !d.passable).length);
  });

  it("towns: each playable faction's town and every building of its tree", () => {
    const expected = playableFactions().reduce(
      (n, f) => n + 1 + (f.town?.order.length ?? 0),
      0,
    );
    expect(count("towns")).toBe(expected);
  });

  it("other: battle conditions, ground kinds and resources", () => {
    registerSpells();
    expect(count("other")).toBe(
      conditionKindIds().length + groundKindIds().length + RESOURCE_IDS.length,
    );
  });
});

describe("gallery entries", () => {
  it("has no entry twice within a tab", () => {
    for (const id of GALLERY_TAB_IDS) {
      const keys = tabEntries(galleryTab(id)).map(
        (e) => `${e.kind}:${e.faction ?? ""}:${e.id}`,
      );
      expect(new Set(keys).size, id).toBe(keys.length);
    }
  });

  it("names a manifest image or content icon for every picture", () => {
    for (const id of GALLERY_TAB_IDS) {
      for (const entry of tabEntries(galleryTab(id))) {
        expect(entry.name, `${id} ${entry.id}`).not.toBe("");
        for (const art of entry.art) {
          if (art.type === "asset")
            expect(() => assetByKey(art.key), art.key).not.toThrow();
          else expect(ICON_KINDS).toContain(art.icon);
        }
      }
    }
  });

  it("recognises tab ids for ?gallery=", () => {
    expect(isGalleryTab("spells")).toBe(true);
    expect(isGalleryTab("lost-world")).toBe(false);
    expect(isGalleryTab(null)).toBe(false);
  });
});

// Bead bzc.67 (UI_V2 UI2-17): filter chips and keyword boxes.

const values = (tab: GalleryTabId, filter: string): string[] =>
  galleryTab(tab)
    .filters.find((f) => f.id === filter)
    ?.options.map((o) => o.value) ?? [];

const only = (
  tab: GalleryTabId,
  chips: Record<string, readonly string[]>,
): GalleryEntry[] => {
  const sel = new Map(
    Object.entries(chips).map(([k, v]) => [k, new Set(v)] as const),
  );
  return tabEntries(galleryTab(tab)).filter((e) => matchesFilters(e, sel));
};

describe("gallery filters", () => {
  it("creatures filter by faction and tier", () => {
    expect(galleryTab("creatures").filters.map((f) => f.label)).toEqual([
      "Faction",
      "Tier",
    ]);
    expect(values("creatures", "faction")).toEqual([
      ...playableFactions().map((f) => f.id),
      "neutral",
      "summon",
    ]);
    expect(values("creatures", "tier")).toEqual(["1", "2", "3", "4", "5", "6"]);
    for (const e of tabEntries(galleryTab("creatures"))) {
      const def = Object.hasOwn(CREATURES, e.id)
        ? CREATURES[e.id as keyof typeof CREATURES]
        : SUMMONED_CREATURES[e.id];
      expect(e.facets?.["tier"], e.id).toBe(String(def?.tier));
    }
    const undead4 = only("creatures", { faction: ["undead"], tier: ["4"] });
    expect(undead4.map((e) => e.id)).toEqual(["gravecaller"]);
    expect(only("creatures", { faction: ["summon"] }).map((e) => e.id)).toEqual(
      ["seedling", "shade"],
    );
  });

  it("spells filter by school (with its emblem) and tier", () => {
    const school = galleryTab("spells").filters[0];
    expect(school?.id).toBe("school");
    expect(school?.options.map((o) => o.label)).toEqual([
      "Bloom",
      "Accord",
      "Clock",
      "Hush",
      "Storm",
    ]);
    expect(school?.options.every((o) => o.icon?.kind === "school")).toBe(true);
    expect(values("spells", "tier")).toEqual(["1", "2", "3", "4", "5"]);
    const storm = only("spells", { school: ["storm"] });
    expect(storm.length).toBe(
      allSpells().filter((s) => s.school === "storm").length,
    );
    const top = only("spells", { tier: ["5"] });
    expect(top.length).toBe(allSpells().filter((s) => s.tier === 5).length);
  });

  it("artifacts filter by slot and rarity", () => {
    expect(values("artifacts", "slot")).toEqual([
      "head",
      "neck",
      "torso",
      "cloak",
      "weapon",
      "shield",
      "ring",
      "feet",
      "pocket",
      "backpack",
    ]);
    expect(values("artifacts", "rarity")).toEqual([
      "trinket",
      "wonder",
      "marvel",
      "consumable",
      "relic",
    ]);
    const byId = (id: string): GalleryEntry | undefined =>
      tabEntries(galleryTab("artifacts")).find((e) => e.id === id);
    expect(byId("tin-sabre")?.facets).toEqual({
      slot: "weapon",
      rarity: "trinket",
    });
    // A Marvel piece is a Wonder by grade; consumables go in the backpack.
    expect(byId("the-quill")?.facets?.["rarity"]).toBe("wonder");
    expect(byId("blue-tonic")?.facets).toEqual({
      slot: "backpack",
      rarity: "consumable",
    });
    expect(byId("keystone")?.facets?.["rarity"]).toBe("relic");
    const rings = only("artifacts", { slot: ["ring"] });
    expect(rings.length).toBe(
      ARTIFACT_LIST.filter((a) => a.kind === "worn" && a.slot === "ring")
        .length,
    );
  });

  it("every entry of a filtered tab has a listed value per filter", () => {
    for (const id of GALLERY_TAB_IDS) {
      const tab = galleryTab(id);
      for (const f of tab.filters) {
        const listed = new Set(f.options.map((o) => o.value));
        for (const e of tabEntries(tab))
          expect(listed.has(e.facets?.[f.id] ?? ""), `${id} ${e.id}`).toBe(
            true,
          );
      }
    }
    for (const id of ["heroes", "skills", "objects", "towns", "other"] as const)
      expect(galleryTab(id).filters, id).toEqual([]);
  });

  it("chips: or within a filter, and across filters, none chosen is all", () => {
    const e = (facets?: Record<string, string>): GalleryEntry => ({
      kind: "creature",
      id: "x",
      name: "X",
      art: [],
      artNote: null,
      ...(facets === undefined ? {} : { facets }),
    });
    const sel = (o: Record<string, string[]>) =>
      new Map(Object.entries(o).map(([k, v]) => [k, new Set(v)] as const));
    const goblin3 = e({ faction: "goblins", tier: "3" });
    expect(matchesFilters(goblin3, sel({}))).toBe(true);
    expect(matchesFilters(goblin3, sel({ tier: [] }))).toBe(true);
    expect(matchesFilters(goblin3, sel({ tier: ["2", "3"] }))).toBe(true);
    expect(matchesFilters(goblin3, sel({ tier: ["2"] }))).toBe(false);
    expect(
      matchesFilters(goblin3, sel({ tier: ["3"], faction: ["undead"] })),
    ).toBe(false);
    expect(
      matchesFilters(goblin3, sel({ tier: ["3"], faction: ["goblins"] })),
    ).toBe(true);
    expect(matchesFilters(e(), sel({ tier: ["3"] }))).toBe(false);
  });
});

describe("gallery keyword boxes", () => {
  it("lists what an in-game card lists, less the entry's own term", () => {
    const venomed: GalleryEntry = {
      kind: "condition",
      id: "venomed",
      name: keyword("venomed").term,
      art: [],
      artNote: null,
    };
    // "Size" mentions Venomed one level down: still left out.
    const ids = entryKeywords(venomed, ["venomed", "size", "bane"]).map(
      (d) => d.id,
    );
    expect(ids).not.toContain("venomed");
    expect(ids.slice(0, 2)).toEqual(["size", "bane"]);
    expect(ids.length).toBeLessThanOrEqual(MAX_BOXES);
    const spell = tabEntries(galleryTab("spells"))[0];
    if (spell === undefined) throw new Error("no spells");
    expect(entryKeywords(spell, ["venomed", "size"])).toEqual(
      explainKeywords(["venomed", "size"]),
    );
  });
});
