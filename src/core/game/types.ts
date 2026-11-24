/**
 * The adventure-layer game state and the command result shapes.
 *
 * The state is plain JSON-compatible data (save games can serialise it as
 * is). Commands never mutate their input: they return a new state. The map
 * is shared by reference between states and must never be mutated.
 */
import type { GameMap, ResourceId } from "../map/types.ts";
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
  /** Movement points at the start of each day. */
  maxMp: number;
  attack: number;
  defense: number;
  xp: number;
  /** Level reached by XP (choices for it may still be pending). */
  level: number;
  /** Level-up choices not yet made; see chooseLevelUp. */
  pendingLevelUps: number;
  army: ArmySlots;
  /**
   * Artifact ids, worn and carried (bead bzc.10 gives them slots). Opaque
   * here: they move to the winner of a hero battle (RULES_V2 4.4).
   */
  artifacts: string[];
  /** On the map. False: in the pool or waiting at a tavern after retreat. */
  alive: boolean;
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
  kind: "monster" | "town" | "hero";
  objectId: string;
  /** The attacking hero. */
  heroId: string;
  townId?: string;
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
}

export type MoveStopReason =
  "arrived" | "no-mp" | "guarded" | "object" | "attack";

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
  /** The hero stands on a chest: call takeChest with "gold" or "xp". */
  | { type: "chest-offer"; heroId: string; pickupId: string }
  | { type: "battle"; battle: PendingBattle }
  | { type: "xp"; heroId: string; amount: number }
  | { type: "level-up"; heroId: string; level: number }
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
  | { type: "hero-retreated"; heroId: string }
  | { type: "hero-hired"; heroId: string; player: number; townId: string }
  | { type: "hero-dismissed"; heroId: string }
  | {
      type: "artifacts-won";
      heroId: string;
      fromHeroId: string;
      artifacts: string[];
    }
  | { type: "turn"; player: number }
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
  | "bad-result";
