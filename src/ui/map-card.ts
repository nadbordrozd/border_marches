/**
 * Picture-first hover cards of the adventure map (UI2-08, bead bzc.59), in
 * the manner of the Heroes right-click box: the thing's picture, its name,
 * one line of what it gives (resource icons), guards as portraits with a
 * count word (Few, Several, Pack, Lots, Horde ...) and the exact count, a
 * threat word coloured against the selected hero's army (the battleOdds
 * estimate), whether it was already visited, and when the hero gets there.
 *
 * `mapCard` / `townCard` / `heroCard` build a plain model (unit-tested,
 * at most {@link MAX_CARD_LINES} lines); `mapCardView` draws it with
 * tipCard, and the tooltip highlights the keywords of its texts.
 */
import { decorationById, decorationLook } from "../assets/decorations.ts";
import { assetByKey } from "../assets/manifest.ts";
import { namedHeroPortrait } from "../assets/unit-art.ts";
import { artFor } from "../assets/object-art.ts";
import {
  describeSite,
  findPath,
  fortLevel,
  guardsOf,
  heroStats,
  maxMana,
  pickupInfo,
  siteGuard,
  townIncome,
} from "../core/game/index.ts";
import type { GameState, HeroState, ShipState } from "../core/game/index.ts";
import { dailyMaxOf, isAfloat, shipAt } from "../core/game/naval.ts";
import { SEA_MOVE_BASE } from "../data/naval.ts";
import { mineIncome, mineName, objectTypeOf } from "../core/game/site-state.ts";
import { propAt } from "../core/map/types.ts";
import type { MapObject } from "../core/map/types.ts";
import {
  findArtifact,
  gradeLabel,
  isCursed,
  SLOT_NAMES,
} from "../data/artifacts.ts";
import { decorationKind } from "../data/decorations.ts";
import { OBJECT_TYPES } from "../data/objectTypes.ts";
import { getCreature, isCreatureId } from "../data/creatures.ts";
import { CHEST, RESOURCE_IDS, RESOURCE_NAMES } from "../data/economy.ts";
import { findFaction } from "../data/factions.ts";
import { getHeroClass } from "../data/hero.ts";
import { playerColour } from "../data/players.ts";
import type { ResourceAmounts, ResourceId } from "../data/types.ts";
import {
  artifactIconKey,
  artVariantOf,
  creatureAsset,
  mineType,
  pickupKey,
  shownArtifact,
  town3x2Asset,
  townAsset,
} from "../render/map/scene.ts";
import { el, img, resourceIcon } from "./dom.ts";
import {
  countWord,
  describeCell,
  monsterSpellLine,
  objectAt,
} from "./format.ts";
import { guildCardLine, siteLearningLine } from "./guild-learning.ts";
import { ODDS_TEXT, battleOdds, buildableTowns } from "./hints.ts";
import type { ArmyLike, Odds } from "./hints.ts";
import {
  PLAN_OPTIONS,
  blockedWords,
  clickTarget,
  stopsWords,
  whenWords,
} from "./map-clicks.ts";
import { displayObjects } from "./objects.ts";
import { readyToHire } from "./side-panel.ts";
import { tipCard } from "./tooltip.ts";

/** No card has more lines than this under its picture and title. */
export const MAX_CARD_LINES = 6;

// ------------------------------------------------------------ count words

// The card's title says "Pack of Goblins" and the exact count stands beside
// it. The words come from the one table in format.ts, shared with the
// messages' "a pack of 12 Goblins" (bead bzc.80).
export { countWord };

/** "Pack of Goblins", "Few Skeletons", "Several Bats", "Lone Troll". */
export function countPhrase(creature: string, count: number): string {
  const def = getCreature(creature);
  if (count === 1) return `Lone ${def.name}`;
  const word = countWord(count);
  return word === "Few" || word === "Several"
    ? `${word} ${def.plural}`
    : `${word} of ${def.plural}`;
}

// ------------------------------------------------------------ the model

export interface CardPicture {
  readonly key: string;
  /**
   * Drawn at this scale (1, 1/2 or 1/3) so it fits the picture box; a
   * 32 px artifact icon at 2 (bead bzc.105).
   */
  readonly scale: number;
}

export interface CardStack {
  readonly creature: string;
  readonly count: number;
  /** The count word ("Pack"). */
  readonly word: string;
  /** "12 Goblins". */
  readonly name: string;
  /** The 48x48 portrait key. */
  readonly portrait: string;
}

export type CardLine =
  /** Plain rules text; the tooltip highlights its keywords. */
  | {
      readonly kind: "text";
      readonly text: string;
      readonly tone?: "good" | "bad" | "dim" | "hint";
      /**
       * Flavour or a stat readout, not rules: its words are never taken
       * for keywords (the view marks it `data-kw-skip`).
       */
      readonly plain?: boolean;
    }
  /** What it gives: resource icons and amounts, then words ("a day"). */
  | {
      readonly kind: "gives";
      readonly amounts: ResourceAmounts;
      readonly sign: "+" | "";
      readonly suffix: string;
    }
  /** Guards, an army or a garrison as portraits with count words. */
  | {
      readonly kind: "stacks";
      readonly label: string;
      readonly stacks: readonly CardStack[];
    }
  /** The threat word against the selected hero's army. */
  | {
      readonly kind: "threat";
      readonly odds: Odds;
      readonly word: string;
      readonly hero: string;
    }
  /** Whether the hero (or player) already used it. */
  | { readonly kind: "visited"; readonly done: boolean; readonly text: string }
  /** When the selected hero gets there (UI2-07's words). */
  | {
      readonly kind: "path";
      readonly text: string;
      /** Behind a guard: "Blocked by 11 Crooners: defeat them first (...)". */
      readonly blocked?: boolean;
    };

export interface MapCard {
  readonly title: string;
  readonly subtitle: string | null;
  readonly picture: CardPicture | null;
  readonly lines: readonly CardLine[];
  /** A one-line card (terrain, unexplored ground). */
  readonly small?: boolean;
}

/** The picture box: wider pictures are halved (or thirded) to fit. */
const PICTURE_BOX = { w: 128, h: 104 };

export function picture(key: string): CardPicture {
  const a = assetByKey(key);
  const scale = [1, 1 / 2, 1 / 3].find(
    (s) => a.w * s <= PICTURE_BOX.w && a.h * s <= PICTURE_BOX.h,
  );
  return { key, scale: scale ?? 1 / 4 };
}

/** A 32 px content icon, drawn twice its size so it can be read (bzc.105). */
export function iconPicture(key: string): CardPicture {
  return { key, scale: 2 };
}

function stackOf(creature: string, count: number): CardStack {
  const def = getCreature(creature);
  return {
    creature,
    count,
    word: count === 1 ? "Lone" : countWord(count),
    name: `${count} ${count === 1 ? def.name : def.plural}`,
    portrait: creatureAsset(creature).portrait,
  };
}

function stacksLine(
  label: string,
  army: ReadonlyArray<ArmyLike | null>,
): CardLine | null {
  const stacks = army
    .filter((s): s is ArmyLike => s !== null && isCreatureId(s.creature))
    .map((s) => stackOf(s.creature, s.count));
  return stacks.length === 0 ? null : { kind: "stacks", label, stacks };
}

function threatLine(
  hero: HeroState | undefined,
  enemy: ReadonlyArray<ArmyLike | null>,
): CardLine | null {
  if (hero === undefined) return null;
  const foes = enemy.filter((s): s is ArmyLike => s !== null);
  if (foes.length === 0) return null;
  const { odds } = battleOdds(hero, foes);
  return { kind: "threat", odds, word: ODDS_TEXT[odds], hero: hero.name };
}

/** "Yours", "Neutral", "Red's". */
function ownerWord(owner: number | null, player: number): string {
  if (owner === player) return "Yours";
  if (owner === null) return "Neutral";
  return `${playerColour(owner).name}'s`;
}

/** The selected hero of `player` (or null). */
function selected(
  state: GameState,
  player: number,
  heroId: string | undefined,
): HeroState | undefined {
  return state.heroes.find(
    (h) => h.id === heroId && h.alive && h.owner === player,
  );
}

/**
 * "Reach: today", "Reach: tomorrow", "Reach: in 3 days", "Blocked by 11
 * Crooners: defeat them first (...)", "On the way: visit the Ore Pit
 * first", "Can't reach from here": the selected
 * hero's way to the click target of (x, y), planned as a click plans it.
 * Null when there is no hero or it stands there.
 */
export function pathLineTo(
  state: GameState,
  hero: HeroState | undefined,
  x: number,
  y: number,
): CardLine | null {
  if (hero === undefined || (hero.x === x && hero.y === y)) return null;
  // Planned the way a click plans it (bead bzc.77): behind a guard, the
  // walk to that fight, in the status line's words.
  const path = findPath(state, hero.id, x, y, PLAN_OPTIONS);
  if (path === null || path.steps.length === 0)
    return { kind: "path", text: "Can't reach from here" };
  const blocked = blockedWords(state, hero, path);
  if (blocked !== null) return { kind: "path", text: blocked, blocked: true };
  // Past a visit or a pickup in the way, the walk ends there (bead bzc.79).
  const stops = stopsWords(state, path);
  if (stops !== null) return { kind: "path", text: stops };
  const days = path.steps[path.steps.length - 1]?.day ?? 0;
  return { kind: "path", text: `Reach: ${whenWords(days) || "today"}` };
}

/** The guard stacks of an object: the map stacks that guard it. */
function guardStacks(state: GameState, obj: MapObject): ArmyLike[] {
  const out: ArmyLike[] = [];
  for (const id of guardsOf(state, obj)) {
    const m = state.monsters[id];
    if (m !== undefined) out.push({ creature: m.creature, count: m.count });
  }
  return out;
}

// ------------------------------------------------------------ heroes

/**
 * A hero's card: portrait, level and class, stats, and the army as
 * portraits. Another player's hero shows the threat word instead of
 * moves and mana.
 */
export function heroCard(
  state: GameState,
  hero: HeroState,
  player: number,
  selectedId?: string,
): MapCard {
  const cls = getHeroClass(hero.heroClass).name;
  const own = hero.owner === player;
  const afloat = isAfloat(state, hero);
  const lines: Array<CardLine | null> = [];
  const army = hero.army.filter((s) => s !== null);
  if (own) {
    const st = heroStats(hero);
    lines.push(
      {
        kind: "text",
        text: `Attack ${st.attack}, Defense ${st.defense}, Power ${st.power}, Lore ${st.lore}`,
        // A stat readout, not rules: no Power and Lore boxes (bzc.80).
        plain: true,
      },
      {
        kind: "text",
        // Afloat, the day's sea maximum (bead bzc.149).
        text: `Moves ${hero.mp} / ${dailyMaxOf(state, hero)}${afloat ? " at sea" : ""} · Mana ${hero.mana} / ${maxMana(hero)}`,
      },
      stacksLine("Army", army) ?? {
        kind: "text",
        text: "No army",
        tone: "dim",
      },
    );
    if (hero.pendingLevelUps > 0)
      lines.push({
        kind: "text",
        text: "A level-up is waiting: open the hero (I).",
        tone: "good",
      });
  } else {
    const me = selected(state, player, selectedId);
    lines.push(
      stacksLine("Army", army),
      threatLine(me, army),
      pathLineTo(state, me, hero.x, hero.y),
    );
  }
  return {
    title: hero.name,
    subtitle:
      (own
        ? `Level ${hero.level} ${cls}`
        : `Level ${hero.level} ${cls} · ${playerColour(hero.owner).name}`) +
      (afloat ? " · aboard a ship" : ""),
    picture: picture(namedHeroPortrait(hero.defId, hero.heroClass).key),
    lines: lines.filter((l): l is CardLine => l !== null),
  };
}

// ------------------------------------------------------------ ships

/**
 * A moored ship's card (bead bzc.149): whose it is, how boarding and
 * landing work, and the selected hero's way to it. A ship with a hero
 * aboard shows that hero's card instead.
 */
export function shipCard(
  state: GameState,
  player: number,
  ship: ShipState,
  hero: HeroState | undefined,
): MapCard {
  // A neutral ship is the catalogue's Moored Boat (bead bzc.151): its
  // name and rule text are the catalogue's.
  const boat = OBJECT_TYPES["moored-boat"];
  const title =
    ship.owner === null
      ? boat.name
      : ship.owner === player
        ? "Your Ship"
        : `${playerColour(ship.owner).name}'s Ship`;
  const lines: Array<CardLine | null> = [
    {
      kind: "text",
      text:
        ship.owner === null
          ? boat.text
          : ship.owner === player
            ? "Board it from the shore beside it."
            : "Board it from the shore beside it to take it.",
    },
    {
      kind: "text",
      text: `Boarding is a step of 100; the rest of the day's moves turn into sea moves (${SEA_MOVE_BASE} a day).`,
      tone: "dim",
      plain: true,
    },
    {
      kind: "text",
      text: "Landing ends the day (not with Seafaring).",
      tone: "dim",
    },
    pathLineTo(state, hero, ship.x, ship.y),
  ];
  return {
    title,
    subtitle: `${ownerWord(ship.owner, player)} · moored`,
    picture: artPicture("moored-boat"),
    lines: lines.filter((l): l is CardLine => l !== null),
  };
}

// ------------------------------------------------------------ towns

export interface TownCardOptions {
  /** On the map: an own town says how to open it, and the path line. */
  readonly onMap?: boolean;
  readonly heroId?: string | undefined;
}

/** A town's card: its picture, owner, income, garrison and today's work. */
export function townCard(
  state: GameState,
  player: number,
  id: string,
  options: TownCardOptions = {},
): MapCard | null {
  const town = state.towns[id];
  if (town === undefined) return null;
  const obj = displayObjects(state).find((o) => o.id === id);
  const faction = findFaction(town.faction)?.name ?? "Town";
  const mine = town.owner === player;
  const hero = selected(state, player, options.heroId);
  const garrison = town.garrison.filter((s) => s !== null);
  const lines: Array<CardLine | null> = [
    {
      kind: "gives",
      amounts: townIncome(town),
      sign: "+",
      suffix: "a day",
    },
    stacksLine("Garrison", garrison) ?? {
      kind: "text",
      text: "No garrison",
      tone: "dim",
    },
  ];
  if (!mine) lines.push(threatLine(hero, garrison));
  if (mine) {
    const ready = readyToHire(town);
    if (ready > 0)
      lines.push({
        kind: "text",
        text: `${ready} creatures to hire.`,
        tone: "good",
      });
    lines.push(
      town.builtToday
        ? { kind: "text", text: "Already built today.", tone: "dim" }
        : buildableTowns(state, player).includes(id)
          ? {
              kind: "text",
              text: "Something can be built today.",
              tone: "good",
            }
          : {
              kind: "text",
              text: "Nothing affordable to build today.",
              tone: "dim",
            },
    );
    // What the guild would teach the selected hero (bead bzc.81).
    const guild = guildCardLine(state, town, hero);
    if (guild !== null) lines.push({ kind: "text", ...guild });
    if (options.onMap === true)
      lines.push({ kind: "text", text: "Double-click to open", tone: "hint" });
  }
  if (options.onMap === true && obj !== undefined)
    lines.push(pathLineTo(state, hero, obj.x, obj.y));
  return {
    title: town.name,
    subtitle: `${faction} · ${ownerWord(town.owner, player)} · fort level ${fortLevel(town)}`,
    picture:
      obj === undefined
        ? null
        : picture((town3x2Asset(obj) ?? townAsset(obj)).key),
    lines: lines.filter((l): l is CardLine => l !== null),
  };
}

// ------------------------------------------------------------ map cells

/**
 * Basic mines of each resource and the sea producers (bead bzc.151): their
 * catalogue text only repeats the yield.
 */
const BASIC_MINES: ReadonlySet<string> = new Set([
  "sawmill",
  "ore-pit",
  "essence-spring",
  "gold-mine",
  "pearl-bed",
  "fishing-village",
]);

function monsterCard(
  state: GameState,
  player: number,
  monster: GameState["monsters"][string],
  hero: HeroState | undefined,
): MapCard {
  const def = getCreature(monster.creature);
  const stack = [{ creature: monster.creature, count: monster.count }];
  const lines: Array<CardLine | null> = [threatLine(hero, stack)];
  const mobj = state.map.objects.find((o) => o.id === monster.id);
  const guards = mobj?.data["guards"];
  if (Array.isArray(guards) && guards.length > 0) {
    const names = guards
      .map((id) => state.map.objects.find((o) => o.id === id))
      .filter((o): o is MapObject => o !== undefined)
      .map((o) => describeSite(state, player, o)?.name ?? targetWord(state, o));
    lines.push({ kind: "text", text: `Guards the ${names.join(", the ")}.` });
  } else if (mobj?.data["pass"] === true) {
    lines.push({ kind: "text", text: "Guards a pass." });
  }
  if (hero !== undefined) {
    const reach = monsterSpellLine(state, hero, monster);
    if (reach !== null) lines.push({ kind: "text", text: reach, tone: "dim" });
  }
  lines.push(pathLineTo(state, hero, monster.x, monster.y));
  return {
    title: countPhrase(monster.creature, monster.count),
    subtitle: `${monster.count} ${monster.count === 1 ? def.name : def.plural} · tier ${def.tier}`,
    picture: picture(creatureAsset(monster.creature).key),
    lines: lines.filter((l): l is CardLine => l !== null),
  };
}

/** A short name for an object without catalogue facts. */
function targetWord(state: GameState, obj: MapObject): string {
  if (obj.kind === "town") return state.towns[obj.id]?.name ?? "town";
  if (obj.kind === "mine") {
    const r = state.mines[obj.id]?.resource;
    return r === undefined ? "mine" : mineName(obj, r);
  }
  return obj.kind;
}

function mineCard(
  state: GameState,
  player: number,
  obj: MapObject,
  hero: HeroState | undefined,
): MapCard | null {
  const mine = state.mines[obj.id];
  if (mine === undefined) return null;
  const site = describeSite(state, player, obj, hero?.id);
  const guard = guardStacks(state, obj);
  const type = objectTypeOf(obj);
  const lines: Array<CardLine | null> = [
    {
      kind: "gives",
      amounts: { [mine.resource]: mineIncome(obj, mine.resource) },
      sign: "+",
      suffix: mine.owner === player ? "a day, yours" : "a day to its owner",
    },
    site !== null && type !== null && !BASIC_MINES.has(type)
      ? { kind: "text", text: site.what }
      : null,
    stacksLine("Guarded by", guard),
    threatLine(hero, guard),
    pathLineTo(state, hero, obj.x, obj.y),
  ];
  return {
    title: site?.name ?? mineName(obj, mine.resource),
    subtitle: mine.owner === null ? "Unclaimed" : ownerWord(mine.owner, player),
    picture: artPicture(mineType(obj), artVariantOf(obj)),
    lines: lines.filter((l): l is CardLine => l !== null),
  };
}

function artPicture(type: string, variant?: string): CardPicture | null {
  const art = artFor(type, variant);
  return art === null ? null : picture(art.asset.key);
}

function pickupCard(
  state: GameState,
  obj: MapObject,
  hero: HeroState | undefined,
): MapCard {
  const info = pickupInfo(obj);
  const guard = guardStacks(state, obj);
  const lines: Array<CardLine | null> = [];
  let title: string;
  if (info.type === "chest") {
    const id = obj.data["artifact"];
    const art = typeof id === "string" ? findArtifact(id)?.name : undefined;
    if (art !== undefined) {
      title = art;
      lines.push({
        kind: "text",
        text: "A Trinket for the hero who takes it.",
      });
    } else {
      title = CHEST.name;
      const gold = Number(obj.data["gold"] ?? CHEST.gold);
      const xp = Number(obj.data["xp"] ?? CHEST.xp);
      lines.push(
        { kind: "gives", amounts: { gold }, sign: "", suffix: "" },
        { kind: "text", text: `or ${xp} experience: you choose.` },
      );
    }
  } else {
    title = RESOURCE_NAMES[info.resource];
    lines.push({
      kind: "gives",
      amounts: { [info.resource]: info.amount },
      sign: "",
      suffix: "",
    });
  }
  lines.push(
    { kind: "text", text: "Pick it up from the next cell.", tone: "dim" },
    stacksLine("Guarded by", guard),
    threatLine(hero, guard),
  );
  const target = clickTarget(obj, obj.x, obj.y);
  lines.push(pathLineTo(state, hero, target.x, target.y));
  return {
    title,
    subtitle: null,
    picture: picture(
      pickupKey(obj.data["resource"], obj.data["chest"] === true),
    ),
    lines: lines.filter((l): l is CardLine => l !== null),
  };
}

/**
 * A loose artifact's card (bead bzc.105): the artifact itself, named and
 * shown as its own icon, its grade and slot, and its rule text, so the
 * player can judge it before walking over. (A Mystery Bag keeps its
 * artifact secret: it gets the site card.)
 */
function artifactCard(
  state: GameState,
  player: number,
  obj: MapObject,
  hero: HeroState | undefined,
): MapCard | null {
  const id = shownArtifact(obj);
  const def = id === null ? undefined : findArtifact(id);
  if (id === null || def === undefined)
    return siteCard(state, player, obj, hero);
  const guard = guardStacks(state, obj);
  const slot =
    def.kind === "worn" && def.slot !== "pocket"
      ? ` · ${SLOT_NAMES[def.slot]}`
      : "";
  const lines: Array<CardLine | null> = [
    { kind: "text", text: def.text },
    isCursed(def.id)
      ? {
          kind: "text",
          text: "Cursed: once worn, it cannot be taken off.",
          tone: "bad",
        }
      : null,
    { kind: "text", text: "Pick it up from the next cell.", tone: "dim" },
    stacksLine("Guarded by", guard),
    threatLine(hero, guard),
  ];
  const target = clickTarget(obj, obj.x, obj.y);
  lines.push(pathLineTo(state, hero, target.x, target.y));
  return {
    title: def.name,
    subtitle: `${gradeLabel(def)}${slot}`,
    picture: iconPicture(artifactIconKey(id)),
    lines: lines.filter((l): l is CardLine => l !== null),
  };
}

function siteCard(
  state: GameState,
  player: number,
  obj: MapObject,
  hero: HeroState | undefined,
): MapCard | null {
  const site = describeSite(state, player, obj, hero?.id);
  if (site === null) return null;
  const outside = guardStacks(state, obj);
  const inside = obj.kind === "bank" ? siteGuard(state, obj) : [];
  // A shrine's page or a tutor's school, for the selected hero (bzc.81).
  const learning = siteLearningLine(obj, hero);
  const lines: Array<CardLine | null> = [
    { kind: "text", text: site.what },
    learning === null ? null : { kind: "text", ...learning },
    site.visited === null
      ? { kind: "text", text: site.reset, tone: "dim" }
      : { kind: "visited", ...site.visited },
    stacksLine("Guarded by", outside),
    stacksLine("Inside", inside),
    threatLine(hero, [...outside, ...inside]),
  ];
  const target = clickTarget(obj, obj.x, obj.y);
  lines.push(pathLineTo(state, hero, target.x, target.y));
  return {
    title: site.name,
    subtitle: null,
    picture: artPicture(String(obj.data["type"] ?? ""), artVariantOf(obj)),
    lines: lines.filter((l): l is CardLine => l !== null),
  };
}

/**
 * The map picture of an object (a site, mine, town or pickup), as its hover
 * card shows it; the site dialogs draw it enlarged (UI2-15). Null without
 * art.
 */
export function objectPictureKey(obj: MapObject): string | null {
  if (obj.kind === "town") return (town3x2Asset(obj) ?? townAsset(obj)).key;
  if (obj.kind === "mine")
    return artFor(mineType(obj), artVariantOf(obj))?.asset.key ?? null;
  if (obj.kind === "pickup")
    return pickupKey(obj.data["resource"], obj.data["chest"] === true);
  // A loose artifact is pictured as itself (bead bzc.105).
  const shown = shownArtifact(obj);
  if (shown !== null) return artifactIconKey(shown);
  return (
    artFor(String(obj.data["type"] ?? ""), artVariantOf(obj))?.asset.key ?? null
  );
}

/**
 * The hover card of map cell (x, y) for `player` with the selected hero
 * `heroId`: a hero, a neutral stack, a town, mine, pickup or site, a
 * passable decoration's name, else a small card naming the ground
 * (describeCell). Null off the map.
 */
export function mapCard(
  state: GameState,
  player: number,
  x: number,
  y: number,
  heroId?: string,
): MapCard | null {
  const { map } = state;
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
  const p = state.players.find((pl) => pl.id === player);
  if (p !== undefined && p.explored[y * map.width + x] !== true)
    return {
      title: "Unexplored",
      subtitle: null,
      picture: null,
      lines: [],
      small: true,
    };
  const hero = selected(state, player, heroId);
  const onCell = state.heroes.find((h) => h.alive && h.x === x && h.y === y);
  if (onCell !== undefined) return heroCard(state, onCell, player, heroId);
  const monster = Object.values(state.monsters).find(
    (m) => m.x === x && m.y === y,
  );
  if (monster !== undefined) return monsterCard(state, player, monster, hero);
  const ship = shipAt(state, x, y);
  if (ship !== undefined) return shipCard(state, player, ship, hero);
  const obj = objectAt(
    map.objects.filter(
      (o) =>
        o.kind !== "monster" &&
        o.kind !== "hero-start" &&
        o.kind !== "buried" &&
        o.kind !== "boat" &&
        !state.collected.includes(o.id),
    ),
    x,
    y,
  );
  let card: MapCard | null = null;
  if (obj?.kind === "town")
    card = townCard(state, player, obj.id, { onMap: true, heroId });
  else if (obj?.kind === "mine") card = mineCard(state, player, obj, hero);
  else if (obj?.kind === "pickup") card = pickupCard(state, obj, hero);
  else if (obj?.kind === "artifact")
    card = artifactCard(state, player, obj, hero);
  else if (obj !== undefined) card = siteCard(state, player, obj, hero);
  if (card !== null) return card;
  // A passable decoration (bead bzc.78): one line, its name only.
  const small = (map.decorations ?? []).find(
    (d) => d.x === x && d.y === y && decorationKind(d.id)?.passable === true,
  );
  const smallName =
    small === undefined ? undefined : decorationKind(small.id)?.name;
  if (smallName !== undefined)
    return {
      title: smallName,
      subtitle: null,
      picture: null,
      lines: [],
      small: true,
    };
  const text = describeCell(state, player, x, y, heroId);
  if (text === null) return null;
  const [title = "", ...rest] = text.split("\n");
  // An impassable prop (bead bzc.72) shows its own look.
  const prop = propAt(map, x, y);
  const def = prop === undefined ? undefined : decorationById(prop.id);
  return {
    title,
    subtitle: null,
    picture:
      prop === undefined || def === undefined
        ? null
        : picture(decorationLook(def, prop.variant).key),
    lines: rest.map((t) => ({
      kind: "text",
      text: t,
      ...(t === "Blocks the way." ? { tone: "dim" as const } : {}),
      // A prop's line is flavour ("the size of a hut"), not rules.
      ...(prop !== undefined ? { plain: true } : {}),
    })),
    small: rest.length === 0,
  };
}

// ------------------------------------------------------------ the view

/** "800 gold" in a text becomes "800 [gold icon]". */
const RESOURCE_TEXT = new RegExp(`(\\d+) (${RESOURCE_IDS.join("|")})\\b`, "gi");

export function textWithIcons(text: string): Array<string | Node> {
  const out: Array<string | Node> = [];
  let last = 0;
  for (const m of text.matchAll(RESOURCE_TEXT)) {
    const at = m.index;
    out.push(text.slice(last, at));
    const r = (m[2] ?? "").toLowerCase() as ResourceId;
    out.push(
      el("span.gm-card-res", resourceIcon(r, "gm-cost-icon"), m[1] ?? ""),
    );
    last = at + m[0].length;
  }
  out.push(text.slice(last));
  return out.filter((n) => n !== "");
}

function stackView(s: CardStack): HTMLElement {
  const cell = el(
    "div.gm-card-stack",
    img(s.portrait, "gm-card-portrait"),
    el("span.gm-card-word", s.word),
    el("b.gm-card-count", String(s.count)),
  );
  cell.setAttribute("aria-label", s.name);
  return cell;
}

function lineView(line: CardLine): HTMLElement {
  switch (line.kind) {
    case "text": {
      const node = el(
        `div.gm-tip-line${line.tone === undefined ? "" : `.gm-tip-${line.tone}`}`,
        ...textWithIcons(line.text),
      );
      if (line.plain === true) node.dataset["kwSkip"] = "";
      return node;
    }
    case "gives": {
      const parts = RESOURCE_IDS.filter((r) => (line.amounts[r] ?? 0) > 0);
      const box = el("div.gm-tip-line.gm-card-gives");
      if (parts.length === 0) box.append(el("span.gm-tip-dim", "No income"));
      for (const r of parts)
        box.append(
          el(
            "span.gm-card-res",
            resourceIcon(r, "gm-cost-icon"),
            `${line.sign}${line.amounts[r] ?? 0}`,
          ),
        );
      if (line.suffix !== "" && parts.length > 0) box.append(` ${line.suffix}`);
      return box;
    }
    case "stacks":
      return el(
        "div.gm-card-stacks",
        el("div.gm-card-label", line.label),
        el("div.gm-card-row", ...line.stacks.map(stackView)),
      );
    case "threat":
      return el(
        "div.gm-tip-line.gm-card-threat",
        el(`b.gm-odds-${line.odds}`, line.word),
        el("span.gm-tip-dim", ` for ${line.hero}`),
      );
    case "visited":
      return el(
        `div.gm-tip-line.gm-card-visited${line.done ? ".gm-tip-dim" : ".gm-tip-good"}`,
        line.done ? "✓ " : "",
        line.text,
      );
    case "path":
      return el(
        `div.gm-tip-path${line.blocked === true ? ".gm-card-blocked" : ""}`,
        line.text,
      );
  }
}

/** The card as a tooltip node. */
export function mapCardView(card: MapCard): HTMLElement {
  let icon: HTMLElement | null = null;
  if (card.picture !== null) {
    const a = assetByKey(card.picture.key);
    const image = img(card.picture.key, "gm-card-pic");
    image.width = Math.round(a.w * card.picture.scale);
    image.height = Math.round(a.h * card.picture.scale);
    icon = el("div.gm-card-frame", image);
  }
  return tipCard(card.title, card.lines.map(lineView), {
    icon,
    subtitle: card.subtitle,
    className: card.small === true ? "gm-tip-small" : "gm-map-card",
  });
}
