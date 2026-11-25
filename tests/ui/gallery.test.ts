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
import { ARTIFACT_LIST } from "../../src/data/artifacts.ts";
import { HERO_CLASSES, NAMED_HEROES } from "../../src/data/classes.ts";
import { CREATURES } from "../../src/data/creatures.ts";
import { RESOURCE_IDS } from "../../src/data/economy.ts";
import { playableFactions } from "../../src/data/factions.ts";
import { FEAT_LIST } from "../../src/data/feats.ts";
import { OBJECT_TYPE_IDS } from "../../src/data/objectTypes.ts";
import { SKILLS } from "../../src/data/skills.ts";
import { DECORATIONS } from "../../src/assets/decorations.ts";
import { assetByKey } from "../../src/assets/manifest.ts";
import { ICON_KINDS } from "../../src/assets/icons.ts";
import {
  GALLERY_TAB_IDS,
  galleryTab,
  isGalleryTab,
  tabEntries,
  type GalleryTabId,
} from "../../src/ui/gallery-data.ts";

const count = (id: GalleryTabId): number => tabEntries(galleryTab(id)).length;

describe("gallery tabs match the registries", () => {
  it("creatures: every creature but the Lost World's, and the summons", () => {
    const summons = Object.keys(SUMMONED_CREATURES).filter(
      (id) => !Object.hasOwn(CREATURES, id),
    ).length;
    const expected =
      Object.values(CREATURES).filter((c) => c.faction !== "lost-world")
        .length + summons;
    expect(count("creatures")).toBe(expected);
    const ids = tabEntries(galleryTab("creatures")).map((e) => e.id);
    expect(ids).toContain("squire");
    expect(ids).toContain("bellhop");
    expect(ids).toContain("shade");
    expect(ids).not.toContain("caveman");
  });

  it("heroes: the v0.2 classes and named heroes", () => {
    const classes = Object.values(HERO_CLASSES).filter(
      (c) => c.faction !== "lost-world",
    ).length;
    const heroes = NAMED_HEROES.filter(
      (h) => h.faction !== "lost-world",
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

  it("artifacts: every artifact, consumable and relic", () => {
    expect(count("artifacts")).toBe(ARTIFACT_LIST.length);
  });

  it("skills and feats: every skill row, feat and vow", () => {
    expect(count("skills")).toBe(Object.keys(SKILLS).length + FEAT_LIST.length);
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
