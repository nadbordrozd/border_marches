/**
 * The adventure-layer game state and the command result shapes.
 *
 * The state is plain JSON-compatible data (save games can serialise it as
 * is). Commands never mutate their input: they return a new state. The map
 * is shared by reference between states and must never be mutated.
 */
import type { GameMap, ResourceId } from "../map/types.ts";
import type { MagicGameState } from "../magic/hero.ts";
import type {
  BuildingId,
  CreatureId,
  FactionId,
  Resources,
} from "../../data/types.ts";

/** Player index; null owns neutral things (monsters, neutral towns, mines). */
export type Owner = number | null;

export interface Stack {
  creature: CreatureId;
  /** Always >= 1; an empty slot is null. */
  count: number;
}

/** Exactly ARMY_SLOTS (7) entries; null is an empty slot. Order matters. */
export type ArmySlots = Array<Stack | null>;

export type PlayerKind = "human" | "ai";

/** One player's tavern (RULES_V2 5.4). */
export interface TavernState {
  /**
   * The two offer slots (hero def ids from src/data/players.ts); null is a
   * slot hired this week (empty until the weekly refresh) or an empty pool.
   */
  offer: Array<string | null>;
  /** Retreated heroes waiting as extra entries, oldest first. */
  retreated: Array<{ heroId: string; refreshesLeft: number }>;
}

export interface PlayerState {
  id: number;
  kind: PlayerKind;
  faction: FactionId;
  /** Colour id (PLAYER_COLOURS in src/data/players.ts). */
  colour: string;
  resources: Resources;
  /** Row-major, one flag per map cell: revealed at least once. */
  explored: boolean[];
  /** Out of the game (RULES_V2 5.9); its turns are skipped. */
  eliminated: boolean;
  /** Consecutive day starts without a town (eliminated at 7). */
  townlessDays: number;
  tavern: TavernState;
  /**
   * Drill flags (ECONOMY 6.3) as "<creature>:<ability>": every stack of
   * that creature in the player's armies and garrisons has the ability.
   * Permanent. Missing in older saves (none).
   */
  drills?: string[];
}

export interface HeroSkill {
  /** SkillId (src/data/skills.ts). */
  id: string;
  /** 1..3 */
  rank: number;
}

export interface HeroState {
  /** Instance id: "hero-<player>" for start heroes, "hero-<def id>" for hires. */
  id: string;
  /** Named hero (HERO_ROSTER id). */
  defId: string;
  name: string;
  /**
   * The player holding the hero; for a hero in the pool, its last owner
   * (or -1 before anyone hired it).
   */
  owner: number;
  /** Hero class id (src/data/hero.ts); "chieftain" in the MVP. */
  heroClass: string;
  x: number;
  y: number;
  /** Movement points left today. */
  mp: number;
  /**
   * Movement points at the start of each day: computed by
   * movementPoints(hero) (core/game/effects.ts, RULES_V2 3.9) at the day
   * start and on hiring, fixed for that day.
   */
  maxMp: number;
  /**
   * Base primary stats (RULES_V2 3.1): class start, level-up stats and stat
   * offers. Effective values add skills, feats, specialty and worn
   * artifacts and are clamped 0..40: see heroStats (core/game/effects.ts).
   * Power is the P of spells; Lore sets mana (maxMana, manaRegen).
   */
  attack: number;
  defense: number;
  power: number;
  lore: number;
  /**
   * Mana now (RULES_V2 2.3). May exceed maxMana(hero) after a map site or
   * potion; it does not regenerate while above. Magic (bead bzc.9) spends
   * it; the day start regenerates it (manaRegen).
   */
  mana: number;
  xp: number;
  /** Level reached by XP (choices for it may still be pending). */
  level: number;
  /** Levels whose choices are not yet made; see levelUpOffer. */
  pendingLevelUps: number;
  /**
   * The step of the oldest pending level: its skill offer, then (at levels
   * divisible by 3) its feat draft (RULES_V2 3.3).
   */
  levelUpStep: "skill" | "feat";
  /** The next offer or draft is redrawn once (Elixir of Hindsight). */
  redraw: boolean;
  /**
   * The page The Unspent Page keeps (chosen on the map when it is put
   * on); absent: the highest-tier page (src/core/game/battle-profile.ts).
   */
  unspentPage?: string;
  /** At most six skills, ranks 1..3 (RULES_V2 3.4), in the order gained. */
  skills: HeroSkill[];
  /** Feat and vow ids (src/data/feats.ts), in the order drafted. */
  feats: string[];
  /**
   * Known spell ids: the pages of the hero's book (RULES_V2 2.2). Magic
   * (bead bzc.9) defines the spells; a page is kept if the rank is lost.
   */
  pages: string[];
  /** Scroll case: spell ids, at most scrollCaseSize(hero) (RULES_V2 2.5). */
  scrolls: string[];
  /**
   * The eleven worn slots in WORN_SLOTS order (src/data/artifacts.ts):
   * artifact id or null. Only worn artifacts have effects.
   */
  worn: Array<string | null>;
  /**
   * Carried artifacts and consumables, in order. Consumables of one kind
   * share a slot three at a time (see backpackSlotsUsed).
   */
  backpack: string[];
  /** Consumables used for the next battle (CONTENT_ARTIFACTS 6.1). */
  nextBattle: string[];
  /** Movement owed from a Borrowed Day (RULES_V2 2.8), taken next day. */
  mpDebt: number;
  army: ArmySlots;
  /** On the map. False: in the pool or waiting at a tavern after retreat. */
  alive: boolean;
  /**
   * Map-site buffs until the hero's next battle ends (bead bzc.13):
   * "rally-camp", "wishing-well", "oasis", "fallen-adventurer" and
   * "school-temple:<school>". Each at most once (they do not stack).
   */
  buffs: string[];
  /** Stables: +300 movement at each day start up to this day (0: none). */
  stablesUntil: number;
  /**
   * Sea movement points at the start of the day (NAVAL 2.4, bead
   * bzc.149): set on naval maps at the day start and on hiring, fixed for
   * the day; `mp` counts sea points while the hero is afloat and land
   * points ashore. Absent: not computed (seaMaxOf works it out).
   */
  seaMaxMp?: number;
}

/**
 * A ship on a sea cell of a naval map (NAVAL 2.1). A hero is aboard when
 * it is alive and stands on the ship's cell (only heroes afloat stand on
 * sea cells); otherwise the ship is moored. A ship carrying a hero moves
 * with it.
 */
export interface ShipState {
  id: string;
  x: number;
  y: number;
  /** Player index, or null for a neutral boat. */
  owner: Owner;
}

/**
 * What the map remembers about one object (bead bzc.13), created on first
 * use; every field is optional. Keyed by map object id in GameState.sites.
 */
export interface SiteState {
  /** Heroes that used a once-per-hero site. */
  heroes?: string[];
  /**
   * Players that used a once-per-player site (obelisks, pylons, keymaster
   * tents), completed a quest gate or lodge errand, or bought this week's
   * rumour.
   */
  players?: number[];
  /** Flag of a map dwelling. */
  owner?: number | null;
  /** A dwelling's stock and the week it was last refilled. */
  stock?: number;
  stockWeek?: number;
  /** Week a weekly producer was last collected. */
  week?: number;
  /** Hero id -> day (per-day sites) or week (per-week sites) of last use. */
  last?: Record<string, number>;
  /**
   * A bank's or sealed box's guard as it stands (survivors of a lost
   * fight); [] once beaten. Absent: the generated guard (data.guard).
   */
  guard?: Array<{ creature: CreatureId; count: number }>;
  /** Spent: a cleared bank, a paid seer hut, a used event. */
  done?: boolean;
  /** Players whose heroes have visited it at all (quest "visit a site"). */
  seen?: number[];
  /** Roadside Inn: week -> players that bought that week's rumour. */
  rumours?: Record<string, number[]>;
  /** Tollhouse: indices of this week's stock already sold, and the week. */
  sold?: number[];
  soldWeek?: number;
  /** A map dwelling: the week Second Helping last added to its stock. */
  helpedWeek?: number;
}

export interface DwellingState {
  /** Creatures ready to recruit. */
  available: number;
  /** Stockade half-creature remainder (0 or 1). */
  remainder: number;
}

export interface TownState {
  /** The town's map object id. */
  id: string;
  owner: Owner;
  faction: FactionId;
  /**
   * True for the Warlord's Hold: a neutral fortress with no building tree
   * (faction "neutral"). Other neutral towns have a faction and a tree.
   */
  isHold: boolean;
  name: string;
  /** Built buildings, in BUILDING_IDS order. */
  buildings: BuildingId[];
  /** One building per town per day. */
  builtToday: boolean;
  /** Stock of each built dwelling, keyed by creature. */
  dwellings: Partial<Record<CreatureId, DwellingState>>;
  garrison: ArmySlots;
}

export interface MineState {
  id: string;
  resource: ResourceId;
  owner: Owner;
}

/** A live neutral stack on the map (removed when defeated). */
export interface MonsterState {
  id: string;
  creature: CreatureId;
  count: number;
  x: number;
  y: number;
}

/**
 * A battle that must be resolved before anything else happens.
 *
 * - "monster": the hero attacks a neutral stack (objectId = monster id);
 * - "town": the hero fights a town's garrison, no hero (objectId = town);
 * - "hero": the hero attacks another player's hero (objectId = that hero's
 *   id). When the defender stands in its own town, `townId` names it: the
 *   fort applies, the defender cannot retreat, and a won fight carries the
 *   attacker into the town (garrison battle or capture, RULES_V2 5.5).
 */
export interface PendingBattle {
  /** "site": a bank's, vault's or sealed box's own guard (objectId). */
  kind: "monster" | "town" | "hero" | "site";
  objectId: string;
  /** The attacking hero. */
  heroId: string;
  townId?: string;
  /**
   * A pickup to take once this fight is won (bead bzc.49): its cell lies
   * in the stack's zone of control, so its guards attack first.
   */
  pickupId?: string;
}

/** The human's view of the game: it ends when the human wins or is out. */
export type GameStatus = "playing" | "won" | "lost";

/**
 * An extra victory condition (RULES_V2 5.9 "Scenario"): win by owning
 * every listed town. One-player games on a map with a Warlord's Hold use
 * it (the MVP goal); the default multi-player maps use none.
 */
export interface ScenarioGoal {
  kind: "capture-towns";
  townIds: string[];
}

export interface GameState {
  /** Shared, read-only. */
  map: GameMap;
  seed: number;
  /** Absolute day, 1-based. See calendar(). */
  day: number;
  status: GameStatus;
  /** Player index whose turn it is (RULES_V2 5.1). */
  currentPlayer: number;
  players: PlayerState[];
  /** Every hero that has been on the map, on it (alive) or not. */
  heroes: HeroState[];
  /**
   * Named heroes (HERO_ROSTER ids) free to be offered in a tavern, in
   * roster order. Heroes on the map or on an offer are not in it.
   */
  pool: string[];
  scenario: ScenarioGoal | null;
  /** Keyed by town map object id. */
  towns: Record<string, TownState>;
  /** Keyed by mine map object id. */
  mines: Record<string, MineState>;
  /** Ids of collected pickups (resources and chests), in collection order. */
  collected: string[];
  /** Live neutral stacks keyed by monster map object id. */
  monsters: Record<string, MonsterState>;
  pendingBattle: PendingBattle | null;
  /** Number of battles resolved so far (feeds battle seeds). */
  battles: number;
  /** Map object memory (visits, flags, stock, bank guards), by object id. */
  sites: Record<string, SiteState>;
  /**
   * Magic on the adventure layer (src/core/magic/hero.ts): interim hero
   * books and mana, adventure-spell day effects. Absent in older saves.
   */
  magic?: MagicGameState;
  /**
   * The computer players' difficulty (src/core/ai/difficulty.ts, bead
   * bzc.23), chosen in the new-game setup. Absent: normal (older saves).
   */
  difficulty?: "easy" | "normal" | "hard";
  /**
   * Ships (NAVAL 2, bead bzc.149), in creation order. Present on naval
   * maps (moored boats of the map become ships at the game start); absent
   * on other maps and in older saves (no ships).
   */
  ships?: ShipState[];
  /** Ships made so far: the next ship's id is `ship-<shipsMade + 1>`. */
  shipsMade?: number;
}

export type MoveStopReason =
  "arrived" | "no-mp" | "guarded" | "object" | "attack" | "pickup";

export type GameEvent =
  | {
      type: "moved";
      heroId: string;
      /** Cells entered, in order (excluding the starting cell). */
      cells: Array<[number, number]>;
      mpSpent: number;
      stop: MoveStopReason;
    }
  | { type: "visit-town"; heroId: string; townId: string }
  | { type: "mine-flagged"; mineId: string; owner: number }
  | {
      type: "pickup";
      pickupId: string;
      resource: ResourceId;
      amount: number;
    }
  /** The hero is next to a chest: call takeChest with "gold" or "xp". */
  | { type: "chest-offer"; heroId: string; pickupId: string }
  | { type: "battle"; battle: PendingBattle }
  /**
   * A map object visit (bead bzc.13): what happened, as one line. `options`
   * is set when the visit offers a choice: call useSite with one option id
   * (the UI shows a dialog; the AI picks).
   */
  | {
      type: "site";
      heroId: string;
      objectId: string;
      text: string;
      options?: SiteOption[];
      /**
       * A map area the text points at (a rumour's 5x5 square, bead
       * bzc.81): the UI can highlight it and centre the view on it.
       */
      area?: { x: number; y: number; w: number; h: number };
    }
  /** A hero moved by a waystone. */
  | {
      type: "teleported";
      heroId: string;
      x: number;
      y: number;
      /** What carried the hero (absent: a waystone). */
      via?: "tow-line";
    }
  /** A dig: what was found (null: nothing). */
  | { type: "dug"; heroId: string; found: string | null }
  /** A hero stepped aboard a ship (NAVAL 2.3); `from` its last owner. */
  | {
      type: "ship-boarded";
      heroId: string;
      shipId: string;
      from: Owner;
    }
  /** A hero stepped ashore from its ship; `endsDay` without Seafaring. */
  | { type: "ship-landed"; heroId: string; shipId: string; endsDay: boolean }
  /** A ship bought at a town's Shipyard, moored on its dock (NAVAL 2.2). */
  | {
      type: "ship-bought";
      townId: string;
      shipId: string;
      player: number;
      x: number;
      y: number;
    }
  /** A ship changed hands outside boarding (a won battle, NAVAL 2.5). */
  | { type: "ship-captured"; shipId: string; owner: Owner; from: Owner }
  /** A ship left the map: sunk with a beaten hero, or scuttled. */
  | {
      type: "ship-sunk";
      shipId: string;
      x: number;
      y: number;
      why: "defeat" | "retreat" | "scuttled";
    }
  | { type: "hero-freed"; heroId: string; player: number }
  | { type: "xp"; heroId: string; amount: number }
  | { type: "level-up"; heroId: string; level: number }
  /** A level's pattern stat or a stat offer (RULES_V2 3.3). */
  | { type: "stat-gained"; heroId: string; stat: string }
  | { type: "skill-gained"; heroId: string; skill: string; rank: number }
  | { type: "feat-gained"; heroId: string; feat: string }
  | { type: "artifact-assembled"; heroId: string; artifact: string }
  | { type: "consumable-used"; heroId: string; artifact: string }
  | { type: "curse-lifted"; heroId: string; artifact: string }
  | { type: "new-day"; day: number }
  | { type: "new-week"; day: number }
  | { type: "income"; player: number; amounts: Resources }
  | { type: "monster-defeated"; monsterId: string }
  | {
      type: "town-captured";
      townId: string;
      owner: number;
      /** Previous owner (null: neutral). */
      from?: number | null;
    }
  | { type: "hero-defeated"; heroId: string }
  /**
   * Both sides fell in the same step (RULES_V2 1.12): the winner keeps one
   * creature of its weakest stack.
   */
  | {
      type: "last-stand";
      battle: PendingBattle;
      side: "attacker" | "defender";
      creature: string;
    }
  /**
   * A battle result could not be applied (a resolver bug): the battle is
   * void, nothing changes but the battle count (voidPendingBattle).
   */
  | {
      type: "battle-error";
      battle: PendingBattle;
      error: CommandError;
      message: string;
    }
  | { type: "hero-retreated"; heroId: string }
  | { type: "hero-hired"; heroId: string; player: number; townId: string }
  | { type: "hero-dismissed"; heroId: string }
  /** A hero learnt guild spells in its town (RULES_V2 2.9). */
  | { type: "spells-learnt"; heroId: string; townId: string; spells: string[] }
  | {
      type: "artifacts-won";
      heroId: string;
      fromHeroId: string;
      artifacts: string[];
    }
  | { type: "turn"; player: number }
  /** Loot Pile: gold for a battle won. */
  | { type: "loot"; player: number; gold: number }
  /** A Drill flag gained (ECONOMY 6.3). */
  | { type: "drill"; player: number; creature: string; ability: string }
  | { type: "tavern-refresh"; day: number }
  | { type: "player-eliminated"; player: number }
  | { type: "game-won"; player: number }
  | { type: "game-lost"; player: number };

export type CommandResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: CommandError; message: string };

export type CommandError =
  | "game-over"
  | "not-your-turn"
  | "battle-pending"
  | "hero-limit"
  | "not-offered"
  | "cell-occupied"
  | "not-adjacent"
  | "cannot-retreat"
  | "no-battle"
  | "unknown-hero"
  | "unknown-town"
  | "unknown-object"
  | "unknown-building"
  | "unknown-creature"
  | "not-owner"
  | "not-in-town"
  | "not-on-object"
  | "already-built"
  | "built-today"
  | "requirements"
  | "cannot-build"
  | "resources"
  | "no-dwelling"
  | "stock"
  | "bad-count"
  | "army-full"
  | "bad-slot"
  | "empty-slot"
  | "different-creature"
  | "hero-needs-army"
  | "no-marketplace"
  | "bad-trade"
  | "bad-path"
  | "no-level-up"
  | "bad-choice"
  | "bad-result"
  | "bad-item"
  | "backpack-full"
  | "scroll-case-full"
  | "cursed"
  | "vow"
  | "one-marvel"
  | "not-consumable"
  | "already-used"
  | "no-target"
  | "no-assembly"
  | "site-used"
  | "locked"
  | "no-dig"
  | "landlocked";

/** A choice a site offers (useSite). */
export interface SiteOption {
  id: string;
  label: string;
  /** Unavailable now (shown greyed, with the reason). */
  disabled?: string;
}
