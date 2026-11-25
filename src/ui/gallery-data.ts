/**
 * What the main-menu gallery (bead border_marches-3nb) shows, built from
 * the content registries so new content appears without touching it: one
 * tab per content family, sections inside a tab, and per entry its id, name
 * and the art to show. No DOM here (unit-tested); src/ui/gallery.ts draws
 * the entries and their cards.
 *
 * The Lost World (not playable in v0.2) is left out: its creatures, its
 * Chieftain class and heroes, and its town.
 */
import {
  conditionKind,
  conditionKindIds,
  groundKind,
  groundKindIds,
} from "../core/battle/index.ts";
import {
  SUMMONED_CREATURES,
  allSpells,
  registerSpells,
} from "../core/magic/index.ts";
import { ARTIFACT_LIST, type ArtifactDef } from "../data/artifacts.ts";
import { HERO_CLASSES, NAMED_HEROES } from "../data/classes.ts";
import { CREATURES } from "../data/creatures.ts";
import { RESOURCE_IDS, RESOURCE_NAMES } from "../data/economy.ts";
import { SCHOOLS, SCHOOL_NAMES } from "../data/effects.ts";
import { rosterOf } from "../data/factionCreatures.ts";
import { FACTIONS, playableFactions } from "../data/factions.ts";
import { FEAT_LIST } from "../data/feats.ts";
import { NEUTRAL_CREATURE_IDS } from "../data/neutrals.ts";
import { OBJECT_TYPES, OBJECT_TYPE_IDS } from "../data/objectTypes.ts";
import { SKILLS, type SkillDef } from "../data/skills.ts";
import { STRAY_CREATURE_IDS, STRAY_HOMES } from "../data/strays.ts";
import type { CreatureDef, FactionId } from "../data/types.ts";
import { SPELL_ICON_ALIASES, iconFor, type IconKind } from "../assets/icons.ts";
import { RESOURCE_ITEMS, RESOURCE_PICKUPS } from "../assets/manifest.ts";
import { DECORATIONS } from "../assets/decorations.ts";
import { artFor, artVariants } from "../assets/object-art.ts";
import {
  buildingArt,
  townArt,
  townBackdrop,
  townArtFaction,
} from "../assets/town-art.ts";
import {
  hasHeroArt,
  hasNamedHeroPortrait,
  hasUnitArt,
  heroArt,
  namedHeroPortrait,
  unitArt,
} from "../assets/unit-art.ts";
import { unitAssetFor } from "../render/battle/assets.ts";

export type GalleryTabId =
  | "creatures"
  | "heroes"
  | "spells"
  | "artifacts"
  | "skills"
  | "objects"
  | "towns"
  | "other";

export type GalleryKind =
  | "creature"
  | "summon"
  | "hero-class"
  | "hero"
  | "spell"
  | "artifact"
  | "skill"
  | "feat"
  | "object"
  | "decoration"
  | "town"
  | "building"
  | "condition"
  | "ground"
  | "resource";

/** One picture of an entry: a manifest image or a content icon. */
export type GalleryArt =
  | { readonly type: "asset"; readonly key: string; readonly label: string }
  | {
      readonly type: "icon";
      readonly icon: IconKind;
      readonly id: string;
      readonly label: string;
    };

export interface GalleryEntry {
  readonly kind: GalleryKind;
  /** The content id in its registry. */
  readonly id: string;
  readonly name: string;
  /** The owning faction (buildings, towns), when it matters. */
  readonly faction?: FactionId;
  readonly art: readonly GalleryArt[];
  /**
   * Why the art is a stand-in or missing (placeholder sprite, fallback
   * icon, no art at all), or null when every picture is the entry's own.
   */
  readonly artNote: string | null;
}

export interface GallerySection {
  readonly title: string;
  readonly entries: readonly GalleryEntry[];
}

export interface GalleryTab {
  readonly id: GalleryTabId;
  readonly label: string;
  readonly sections: readonly GallerySection[];
}

export const GALLERY_TAB_IDS: readonly GalleryTabId[] = [
  "creatures",
  "heroes",
  "spells",
  "artifacts",
  "skills",
  "objects",
  "towns",
  "other",
];

export function isGalleryTab(id: string | null): id is GalleryTabId {
  return id !== null && (GALLERY_TAB_IDS as readonly string[]).includes(id);
}

const asset = (key: string, label: string): GalleryArt => ({
  type: "asset",
  key,
  label,
});

const icon = (kind: IconKind, id: string, label = "Icon"): GalleryArt => ({
  type: "icon",
  icon: kind,
  id,
  label,
});

/** An icon entry's note: null when the icon is the content's own. */
function iconNote(kind: IconKind, id: string): string | null {
  const alias =
    kind === "spell" && Object.hasOwn(SPELL_ICON_ALIASES, id)
      ? SPELL_ICON_ALIASES[id]
      : undefined;
  if (alias !== undefined)
    return `No icon of its own: borrows the ${alias.kind === "school" ? "school emblem" : "icon"} of ${alias.id}.`;
  return iconFor(kind, id).fallback
    ? "No icon of its own: fallback icon."
    : null;
}

function section(
  title: string,
  entries: readonly GalleryEntry[],
): GallerySection[] {
  return entries.length === 0 ? [] : [{ title, entries }];
}

// ------------------------------------------------------------ creatures

function creatureEntry(def: CreatureDef): GalleryEntry {
  // The sprite the battle and the map draw: the data sprite, else the art
  // lookup (src/render/battle/assets.ts).
  const art = unitAssetFor(def.id) ?? unitArt(def.id);
  const own = art.key === def.sprite || hasUnitArt(def.id);
  return {
    kind: "creature",
    id: def.id,
    name: def.name,
    art: [asset(art.key, "Battle sprite"), asset(art.portrait, "Portrait")],
    artNote: own ? null : "No sprite of its own: placeholder.",
  };
}

function byTier(a: CreatureDef, b: CreatureDef): number {
  return a.tier - b.tier;
}

/**
 * Creatures shown: every registry creature but the Lost World's (the
 * summons, which only magic makes, come from SUMMONED_CREATURES).
 */
export function galleryCreatures(): CreatureDef[] {
  return Object.values(CREATURES).filter((c) => c.faction !== "lost-world");
}

function creatureSections(): GallerySection[] {
  const shown = new Set<string>();
  const take = (defs: readonly CreatureDef[]): GalleryEntry[] =>
    defs
      .filter((d) => !shown.has(d.id) && d.faction !== "lost-world")
      .map((d) => {
        shown.add(d.id);
        return creatureEntry(d);
      });
  const get = (id: string): CreatureDef | undefined =>
    Object.hasOwn(CREATURES, id)
      ? (CREATURES as Readonly<Record<string, CreatureDef>>)[id]
      : undefined;
  const defs = (ids: readonly string[]): CreatureDef[] =>
    ids.map(get).filter((d): d is CreatureDef => d !== undefined);
  const out: GallerySection[] = [];
  for (const f of playableFactions())
    out.push(...section(f.name, take(rosterOf(f.id))));
  const strays = STRAY_CREATURE_IDS.filter(
    (id) => STRAY_HOMES[id].dwelling !== "summon",
  );
  const summons = STRAY_CREATURE_IDS.filter(
    (id) => STRAY_HOMES[id].dwelling === "summon",
  );
  out.push(...section("Strays and caretakers", take(defs(strays))));
  const summoned = Object.values(SUMMONED_CREATURES)
    .filter((c) => !shown.has(c.id))
    .map((c): GalleryEntry => {
      shown.add(c.id);
      const art = unitArt(c.id);
      return {
        kind: "summon",
        id: c.id,
        name: c.name ?? c.id,
        art: [asset(art.key, "Battle sprite"), asset(art.portrait, "Portrait")],
        artNote: hasUnitArt(c.id) ? null : "No sprite of its own: placeholder.",
      };
    });
  out.push(...section("Summons", [...take(defs(summons)), ...summoned]));
  out.push(
    ...section("Other neutrals", take(defs(NEUTRAL_CREATURE_IDS).sort(byTier))),
  );
  out.push(
    ...section("Other creatures", take(galleryCreatures().sort(byTier))),
  );
  return out;
}

// ------------------------------------------------------------ heroes

/** Hero classes shown (every class but the Lost World's Chieftain). */
export function galleryHeroClasses(): string[] {
  return Object.values(HERO_CLASSES)
    .filter((c) => c.faction !== "lost-world")
    .map((c) => c.id);
}

function heroSections(): GallerySection[] {
  const classes = galleryHeroClasses().map((id): GalleryEntry => {
    const cls = HERO_CLASSES[id];
    const art = heroArt(id);
    return {
      kind: "hero-class",
      id,
      name: cls?.name ?? id,
      art: [asset(art.key, "Map sprite"), asset(art.portrait, "Portrait")],
      artNote: hasHeroArt(id) ? null : "No sprite of its own: placeholder.",
    };
  });
  const out = section("Hero classes", classes);
  const heroes = NAMED_HEROES.filter((h) => h.faction !== "lost-world");
  const factions = [
    ...FACTIONS.map((f) => f.id),
    ...heroes.map((h) => h.faction),
  ].filter((f, i, all) => all.indexOf(f) === i);
  for (const f of factions) {
    const own = heroes.filter((h) => h.faction === f);
    const name = FACTIONS.find((x) => x.id === f)?.name ?? f;
    out.push(
      ...section(
        `${name} heroes`,
        own.map((h): GalleryEntry => ({
          kind: "hero",
          id: h.id,
          name: h.name,
          faction: h.faction,
          art: [
            asset(namedHeroPortrait(h.id, h.heroClass).key, "Portrait"),
            asset(heroArt(h.heroClass).key, "Map sprite (class)"),
          ],
          artNote: hasNamedHeroPortrait(h.id)
            ? null
            : "No portrait of its own: the class portrait.",
        })),
      ),
    );
  }
  return out;
}

// ------------------------------------------------------------ spells

function spellSections(): GallerySection[] {
  const spells = allSpells().sort(
    (a, b) =>
      a.tier - b.tier || (a.kind === b.kind ? 0 : a.kind === "battle" ? -1 : 1),
  );
  const schools = [
    ...SCHOOLS,
    ...spells.map((s) => s.school).filter((s) => !SCHOOLS.includes(s)),
  ].filter((s, i, all) => all.indexOf(s) === i);
  return schools.flatMap((school) =>
    section(
      SCHOOL_NAMES[school] ?? school,
      spells
        .filter((s) => s.school === school)
        .map((s): GalleryEntry => ({
          kind: "spell",
          id: s.id,
          name: s.name,
          art: [icon("spell", s.id)],
          artNote: iconNote("spell", s.id),
        })),
    ),
  );
}

// ------------------------------------------------------------ artifacts

function artifactGroup(def: ArtifactDef): string {
  if (def.kind === "consumable") return "Consumables";
  if (def.kind === "relic") return "Relics";
  if (def.cursed === true) return "Cursed";
  if (def.pieceOf !== undefined) return "Marvel pieces";
  if (def.grade === "marvel") return "Marvels";
  if (def.grade === "wonder") return "Wonders";
  return "Trinkets";
}

const ARTIFACT_GROUPS = [
  "Trinkets",
  "Wonders",
  "Marvels",
  "Marvel pieces",
  "Cursed",
  "Consumables",
  "Relics",
] as const;

function artifactSections(): GallerySection[] {
  return ARTIFACT_GROUPS.flatMap((group) =>
    section(
      group,
      ARTIFACT_LIST.filter((a) => artifactGroup(a) === group).map(
        (a): GalleryEntry => ({
          kind: "artifact",
          id: a.id,
          name: a.name,
          art: [icon("artifact", a.id)],
          artNote: iconNote("artifact", a.id),
        }),
      ),
    ),
  );
}

// ------------------------------------------------------------ skills, feats

const FAMILY_TITLE: Readonly<Record<SkillDef["family"], string>> = {
  school: "School skills",
  army: "Army skills",
  journey: "Journey skills",
};

function skillSections(): GallerySection[] {
  const skills = Object.values(SKILLS).filter(
    (s): s is SkillDef => s !== undefined,
  );
  const out = (Object.keys(FAMILY_TITLE) as Array<SkillDef["family"]>).flatMap(
    (family) =>
      section(
        FAMILY_TITLE[family],
        skills
          .filter((s) => s.family === family)
          .map((s): GalleryEntry => ({
            kind: "skill",
            id: s.id,
            name: s.name,
            art: [icon("skill", s.id)],
            artNote: iconNote("skill", s.id),
          })),
      ),
  );
  for (const vows of [false, true]) {
    const kind: IconKind = vows ? "vow" : "feat";
    out.push(
      ...section(
        vows ? "Vows" : "Feats",
        FEAT_LIST.filter((f) => (f.restriction !== undefined) === vows).map(
          (f): GalleryEntry => ({
            kind: "feat",
            id: f.id,
            name: f.name,
            art: [icon(kind, f.id)],
            artNote: iconNote(kind, f.id),
          }),
        ),
      ),
    );
  }
  return out;
}

// ------------------------------------------------------------ map objects

/**
 * The catalogue sections (CONTENT_MAP_OBJECTS 3.1 to 3.10) by their first
 * type id; every type after a first id belongs to its section.
 */
const OBJECT_SECTIONS: ReadonlyArray<readonly [string, string]> = [
  ["sawmill", "Mines and producers"],
  ["faction-outpost", "External dwellings"],
  ["stat-shrine", "Visitable buildings"],
  ["overgrown-greenhouse", "Banks and the vault"],
  ["resource-pile", "One-time treasure"],
  ["obelisk", "Hidden treasure"],
  ["keymasters-tent", "Quests, gates and prisons"],
  ["trading-post", "Services"],
  ["two-way-waystone", "Teleports"],
  ["event-tile", "Events and signs"],
];

function objectEntry(id: (typeof OBJECT_TYPE_IDS)[number]): GalleryEntry {
  const def = OBJECT_TYPES[id];
  const variants = artVariants(id);
  const looks = (variants.length === 0 ? [""] : variants)
    .map((v) => ({ v, art: artFor(id, v === "" ? undefined : v) }))
    .filter((x) => x.art !== null);
  const placeholder = looks.some((x) => x.art?.placeholder === true);
  return {
    kind: "object",
    id,
    name: def.name,
    art: looks.map((x) =>
      asset(
        x.art?.asset.key ?? "",
        x.v === "" ? "Map sprite" : `Map sprite: ${x.v}`,
      ),
    ),
    artNote:
      looks.length === 0
        ? "Buried: never drawn on the map."
        : placeholder
          ? "No sprite of its own: placeholder."
          : null,
  };
}

function objectSections(): GallerySection[] {
  const out: Array<{ title: string; entries: GalleryEntry[] }> = [];
  for (const id of OBJECT_TYPE_IDS) {
    const start = OBJECT_SECTIONS.find(([first]) => first === id);
    if (start !== undefined || out.length === 0)
      out.push({ title: start?.[1] ?? "Map objects", entries: [] });
    out[out.length - 1]?.entries.push(objectEntry(id));
  }
  return [...out.filter((s) => s.entries.length > 0), ...decorationSections()];
}

/**
 * The decoration catalogue (bead bzc.48): purely decorative pieces, the
 * passable details and the impassable props, after the object types.
 */
function decorationSections(): GallerySection[] {
  const entries = (passable: boolean): GalleryEntry[] =>
    DECORATIONS.filter((d) => d.passable === passable).map((d) => ({
      kind: "decoration",
      id: d.id,
      name: d.name,
      art: d.looks.map((look, i) =>
        asset(
          look.key,
          d.looks.length === 1 ? "Map sprite" : `Map sprite ${i + 1}`,
        ),
      ),
      artNote: null,
    }));
  return [
    ...section("Decorations (passable)", entries(true)),
    ...section("Props (impassable)", entries(false)),
  ];
}

// ------------------------------------------------------------ towns

function townSections(): GallerySection[] {
  return playableFactions().flatMap((f) => {
    const tree = f.town;
    if (tree === null) return [];
    const backdrop = townBackdrop(f.id);
    const town: GalleryEntry = {
      kind: "town",
      id: f.id,
      name: f.name,
      faction: f.id,
      art: [
        asset(townArt(f.id, 0).key, "Map town: camp"),
        asset(townArt(f.id, 2).key, "Map town: fort"),
        ...(backdrop === null ? [] : [asset(backdrop.key, "Town screen")]),
      ],
      artNote:
        townArtFaction(f.id) === undefined
          ? "No town screen art: map town only."
          : null,
    };
    const buildings = tree.order.map((b): GalleryEntry => {
      const art = buildingArt(f.id, b);
      return {
        kind: "building",
        id: b,
        name: tree.buildings[b]?.name ?? b,
        faction: f.id,
        art: art === null ? [] : [asset(art.key, "Town screen")],
        artNote: art === null ? "No building sprite." : null,
      };
    });
    return section(f.name, [town, ...buildings]);
  });
}

// ------------------------------------------------------------ other

function otherSections(): GallerySection[] {
  registerSpells(); // magic's condition and ground kinds (idempotent)
  const conditions = conditionKindIds().map((id): GalleryEntry => ({
    kind: "condition",
    id,
    name: conditionKind(id).name,
    art: [icon("condition", id)],
    artNote: iconNote("condition", id),
  }));
  const ground = groundKindIds().map((id): GalleryEntry => ({
    kind: "ground",
    id,
    name: groundKind(id).name,
    art: [icon("ground", id)],
    artNote: iconNote("ground", id),
  }));
  const resources = RESOURCE_IDS.map((r): GalleryEntry => ({
    kind: "resource",
    id: r,
    name: RESOURCE_NAMES[r],
    art: [
      asset(RESOURCE_ITEMS[r].key, "Interface"),
      asset(RESOURCE_PICKUPS[r], "Map pickup"),
    ],
    artNote: null,
  }));
  return [
    ...section("Battle conditions", conditions),
    ...section("Battle ground", ground),
    ...section("Resources", resources),
  ];
}

// ------------------------------------------------------------ tabs

const TABS: ReadonlyArray<
  readonly [GalleryTabId, string, () => GallerySection[]]
> = [
  ["creatures", "Creatures", creatureSections],
  ["heroes", "Heroes", heroSections],
  ["spells", "Spells", spellSections],
  ["artifacts", "Artifacts", artifactSections],
  ["skills", "Skills and feats", skillSections],
  ["objects", "Map objects", objectSections],
  ["towns", "Towns and buildings", townSections],
  ["other", "Other", otherSections],
];

const built = new Map<GalleryTabId, GalleryTab>();

/** A tab of the gallery (built once, on first use). */
export function galleryTab(id: GalleryTabId): GalleryTab {
  const cached = built.get(id);
  if (cached !== undefined) return cached;
  const row = TABS.find(([tab]) => tab === id);
  if (row === undefined) throw new Error(`no gallery tab ${id}`);
  const tab: GalleryTab = { id, label: row[1], sections: row[2]() };
  built.set(id, tab);
  return tab;
}

/** The label of a tab without building it. */
export function galleryTabLabel(id: GalleryTabId): string {
  return TABS.find(([tab]) => tab === id)?.[1] ?? id;
}

/** Every entry of a tab, in display order. */
export function tabEntries(tab: GalleryTab): GalleryEntry[] {
  return tab.sections.flatMap((s) => s.entries);
}
