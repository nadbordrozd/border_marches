/**
 * Content icons (bead border_marches-bzc.17, docs/art/classes/icons.md):
 * 32x32 symbols for spells, artifacts, skills, feats, vows, conditions,
 * ground, primary stats and school emblems, and 16x16 condition variants for
 * battle overlays. Every file is an `outputs[]` entry of a studio set
 * `art/sets/icons-*`, generated at its native size (never downscaled or
 * mirrored).
 *
 * Look icons up by content id with {@link iconFor}; ids are the catalogue
 * names in kebab case ({@link contentId}). An id without its own icon gets
 * its kind's fallback, so callers never need a placeholder of their own.
 * Frames are drawn by code (src/ui/icons.ts) from {@link IconFrame}, never
 * baked into the art.
 */
import catalogueJson from "./icon-catalogue.json";
import type { ImageAsset } from "./manifest";

export type IconKind =
  | "spell"
  | "artifact"
  | "condition"
  | "ground"
  | "skill"
  | "feat"
  | "vow"
  | "stat"
  | "school";

export const ICON_KINDS: readonly IconKind[] = [
  "spell",
  "artifact",
  "condition",
  "ground",
  "skill",
  "feat",
  "vow",
  "stat",
  "school",
];

export type SchoolId = "bloom" | "accord" | "clock" | "hush" | "storm";
export type ArtifactGrade =
  "trinket" | "wonder" | "cursed" | "piece" | "marvel" | "consumable";
export type FrameId = SchoolId | ArtifactGrade | "skill" | "feat" | "vow";

/** A frame drawn around a 32 px icon: 2 px border, 1 px bevel lit bottom-left. */
export interface IconFrame {
  readonly id: FrameId;
  readonly colour: string;
  readonly shadow: string;
  readonly light: string;
}

const frame = (
  id: FrameId,
  colour: string,
  shadow: string,
  light: string,
): IconFrame => ({ id, colour, shadow, light });

/** Frame colours; the table in docs/art/classes/icons.md is the same. */
export const ICON_FRAMES: Readonly<Record<FrameId, IconFrame>> = {
  bloom: frame("bloom", "#4caf50", "#2e7d32", "#a5d6a7"),
  accord: frame("accord", "#3f7fd9", "#24508f", "#a9c8f5"),
  clock: frame("clock", "#d4a017", "#8a6508", "#f5dc7a"),
  hush: frame("hush", "#8a63b8", "#4e3270", "#cdb4ea"),
  storm: frame("storm", "#d9472b", "#8e2414", "#f5a08f"),
  trinket: frame("trinket", "#b07a45", "#6e4522", "#e0b98c"),
  wonder: frame("wonder", "#aab4c2", "#5d6878", "#e6ebf2"),
  cursed: frame("cursed", "#7d9a2c", "#3d4d12", "#c7dd7a"),
  piece: frame("piece", "#e8b923", "#9a7208", "#fff0a8"),
  marvel: frame("marvel", "#ff9f1a", "#a8520a", "#ffd9a0"),
  consumable: frame("consumable", "#c9b38a", "#7d6a45", "#efe3c4"),
  skill: frame("skill", "#8c96a6", "#4a5260", "#d3d9e2"),
  feat: frame("feat", "#2fa39a", "#17605a", "#a3e3dc"),
  vow: frame("vow", "#5a6273", "#2b303b", "#a9b1c2"),
};

/** One catalogue entry (src/assets/icon-catalogue.json, built from docs/design). */
export interface IconContent {
  readonly name: string;
  readonly frame: FrameId | null;
  readonly school?: SchoolId | null;
  readonly grade?: ArtifactGrade;
}

const CATALOGUE = catalogueJson as unknown as Readonly<
  Record<IconKind, Readonly<Record<string, IconContent>>>
>;

/** Every content id of a kind, in catalogue order. */
export function iconIds(kind: IconKind): readonly string[] {
  return Object.keys(CATALOGUE[kind]);
}

/** The catalogue entry of a content id, or undefined. */
export function iconContent(
  kind: IconKind,
  id: string,
): IconContent | undefined {
  const table = CATALOGUE[kind];
  return Object.hasOwn(table, id) ? table[id] : undefined;
}

/** Kebab-case content id of a catalogue name: "Ringmaster's Whip" -> "ringmasters-whip". */
export function contentId(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(cursed\)/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export interface IconAsset extends ImageAsset {
  readonly category: "icon";
  readonly kind: IconKind | "fallback" | "marker";
  /** Content id (or, for a fallback, the kind it stands in for). */
  readonly id: string;
}

/**
 * Content ids that have no icon of their own (they resolve to their kind's
 * fallback). Kept empty when every id is covered.
 */
export const ICON_MISSING: Readonly<Record<IconKind, readonly string[]>> = {
  spell: [],
  artifact: [],
  condition: [],
  ground: [],
  skill: [],
  feat: [],
  vow: [],
  stat: [],
  school: [],
};

/** Folder under public/assets/icons/ per kind. */
const FOLDER: Readonly<Record<IconKind, string>> = {
  spell: "spells",
  artifact: "artifacts",
  condition: "conditions",
  ground: "ground",
  skill: "skills",
  feat: "feats",
  vow: "vows",
  stat: "stats",
  school: "schools",
};

function iconAsset(
  kind: IconAsset["kind"],
  id: string,
  folder: string,
  size: number,
): IconAsset {
  return {
    key: `icon-${folder}-${id}`,
    path: `assets/icons/${folder}/${id}.png`,
    w: size,
    h: size,
    category: "icon",
    kind,
    id,
  };
}

/** Every 32 px content icon. */
export const ICON_ASSETS: readonly IconAsset[] = ICON_KINDS.flatMap((kind) =>
  iconIds(kind)
    .filter((id) => !ICON_MISSING[kind].includes(id))
    .map((id) => iconAsset(kind, id, FOLDER[kind], 32)),
);

/** 16 px condition and ground icons for stack and hex overlays in battle. */
export const SMALL_ICON_ASSETS: readonly IconAsset[] = [
  ...iconIds("condition").map((id) =>
    iconAsset("condition", id, "conditions-16", 16),
  ),
];

/** A battle marker that is not catalogue content (see {@link MARKER_ICONS}). */
export type MarkerId = "shell";

/**
 * Battle markers outside the content catalogue (bead bzc.131): the shell a
 * stack of Mortars lobs (FACTION_DWARVES 5, Lob), drawn on its target hex
 * and as its tile on the battle timeline; 32 px and a 16 px take of its own.
 */
export const MARKER_ICONS: Readonly<
  Record<MarkerId, Readonly<Record<16 | 32, IconAsset>>>
> = {
  shell: {
    32: iconAsset("marker", "shell", "markers", 32),
    16: iconAsset("marker", "shell", "markers-16", 16),
  },
};

/** One fallback per kind, for ids without an icon of their own. */
export const FALLBACK_ICON_ASSETS: Readonly<Record<IconKind, IconAsset>> =
  Object.fromEntries(
    ICON_KINDS.map((kind) => [
      kind,
      iconAsset("fallback", kind, "fallback", 32),
    ]),
  ) as Record<IconKind, IconAsset>;

/** Every icon file, once (part of the manifest's ALL_ASSETS). */
export const ALL_ICON_ASSETS: readonly IconAsset[] = [
  ...ICON_ASSETS,
  ...SMALL_ICON_ASSETS,
  ...Object.values(MARKER_ICONS).flatMap((m) => [m[32], m[16]]),
  ...Object.values(FALLBACK_ICON_ASSETS),
];

const BY_KIND_ID: ReadonlyMap<string, IconAsset> = new Map(
  ICON_ASSETS.map((asset) => [`${asset.kind}:${asset.id}`, asset]),
);
const SMALL_BY_ID: ReadonlyMap<string, IconAsset> = new Map(
  SMALL_ICON_ASSETS.map((asset) => [`${asset.kind}:${asset.id}`, asset]),
);

/** A creature page that borrows a checked-in icon (SPELL_ICON_ALIASES). */
export interface SpellIconAlias {
  readonly name: string;
  readonly school: SchoolId;
  readonly kind: "spell" | "school";
  readonly id: string;
}

/**
 * Creature pages outside the catalogue (RULES_V2 2.4 budget: Mend,
 * Thunderclap, Last Breath) borrow the icon of the catalogue page with the
 * same shape, or their school's emblem, framed in their school's colour.
 * No new art: these reuse checked-in icons.
 */
export const SPELL_ICON_ALIASES: Readonly<Record<string, SpellIconAlias>> = {
  // Broadside's shape: Harm to each stack on a hex and the six around it.
  thunderclap: {
    name: "Thunderclap",
    school: "storm",
    kind: "spell",
    id: "broadside",
  },
  // Regrow's shape: Heal, reviving.
  mend: { name: "Mend", school: "bloom", kind: "spell", id: "regrow" },
  // No Hush page is a plain Harm: the school emblem.
  "last-breath": {
    name: "Last Breath",
    school: "hush",
    kind: "school",
    id: "hush",
  },
};

export interface IconRef {
  readonly kind: IconKind;
  /** The normalised content id. */
  readonly id: string;
  /** Display name from the catalogue (the id when unknown). */
  readonly name: string;
  readonly asset: IconAsset;
  /** The frame to draw around it, or null for an unframed icon. */
  readonly frame: IconFrame | null;
  /** True when the asset is the kind's fallback, not the content's own icon. */
  readonly fallback: boolean;
}

/**
 * The icon of a piece of content, by kind and content id or catalogue name
 * ("bramble-row" or "Bramble Row"). Unknown ids and ids without an icon
 * resolve to the kind's fallback (`fallback: true`); this never throws.
 * `size: 16` asks for the 16 px overlay variant where one exists (conditions)
 * and otherwise returns the 32 px icon.
 */
export function iconFor(
  kind: IconKind,
  idOrName: string,
  size: 16 | 32 = 32,
): IconRef {
  const id = contentId(idOrName);
  const alias =
    kind === "spell" && Object.hasOwn(SPELL_ICON_ALIASES, id)
      ? SPELL_ICON_ALIASES[id]
      : undefined;
  if (alias !== undefined) {
    const borrowed = iconFor(alias.kind, alias.id, size);
    return {
      ...borrowed,
      kind,
      id,
      name: alias.name,
      frame: ICON_FRAMES[alias.school],
    };
  }
  const content = iconContent(kind, id);
  const own =
    (size === 16 ? SMALL_BY_ID.get(`${kind}:${id}`) : undefined) ??
    BY_KIND_ID.get(`${kind}:${id}`);
  const frameId = content?.frame ?? null;
  return {
    kind,
    id,
    name: content?.name ?? idOrName,
    asset: own ?? FALLBACK_ICON_ASSETS[kind],
    frame: frameId === null ? null : ICON_FRAMES[frameId],
    fallback: own === undefined,
  };
}
