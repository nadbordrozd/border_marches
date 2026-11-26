/**
 * Hand-built faction battles for the debug battle view (`?view=battle&
 * scenario=realm|horde|restless`): v0.2 armies with their birthrights,
 * Drills, a hero with a Command (C 2 or 3) and an item act, set on chosen
 * hexes, so every action of the bar can be looked at without playing a
 * game. `active=<stack id>` hands the turn to that stack.
 */

import { engineSetupFromGame, getStack } from "../../core/battle/index.ts";
import { Draft, Resolver } from "../../core/battle/resolve.ts";
import type {
  BattleSetup as EngineBattleSetup,
  BattleState,
  Hex,
  StackId,
} from "../../core/battle/index.ts";
import type {
  BattleSetup as GameBattleSetup,
  BattleStack as GameBattleStack,
} from "../../core/game/battle.ts";
import type { FactionId } from "../../data/types.ts";
import type { CreatureId } from "../../data/types.ts";

interface ScenarioArmy {
  readonly faction: FactionId | null;
  readonly heroName: string | null;
  readonly command?: string;
  readonly commandC?: number;
  readonly itemActs?: readonly string[];
  readonly drills?: readonly string[];
  readonly stacks: readonly (readonly [CreatureId, number, number, number])[];
}

interface Scenario {
  readonly terrain: GameBattleSetup["terrain"];
  readonly attacker: ScenarioArmy;
  readonly defender: ScenarioArmy;
  /** Conditions to put on stacks at the start (UI check). */
  readonly decorate?: (fx: Resolver) => void;
}

const SCENARIOS: Readonly<Record<string, Scenario>> = {
  realm: {
    terrain: "grass",
    attacker: {
      faction: "humans",
      heroName: "Sir Aldric",
      command: "swear-in",
      commandC: 2,
      itemActs: ["a-pinch-of-sand"],
      drills: ["longbowman:pin-down", "man-at-arms:bodyguard"],
      stacks: [
        ["squire", 30, 3, 4],
        ["longbowman", 12, 1, 6],
        ["man-at-arms", 14, 4, 6],
        ["friar", 6, 1, 3],
        ["knight", 5, 2, 8],
        ["dragonslayer", 2, 1, 9],
      ],
    },
    defender: {
      faction: null,
      heroName: null,
      stacks: [
        ["goblin", 40, 9, 4],
        ["wolf-rider", 10, 10, 6],
        ["ogre", 3, 12, 5],
      ],
    },
    decorate: (fx) => {
      fx.addCondition("a1", { kind: "lucky", clock: 3 });
      fx.addCondition("d1", { kind: "venomed", size: 3, clock: 2 });
      fx.addCondition("d0", { kind: "shaken", clock: 2 });
      // Knights: Heartened, for the keep-or-spend switch.
      fx.addCondition("a4", { kind: "heartened" });
    },
  },
  horde: {
    terrain: "steppe",
    attacker: {
      faction: "goblins",
      heroName: "Skarn the Loud",
      command: "heave-ho",
      commandC: 2,
      drills: ["wolf-rider:hit-and-run", "bomb-chucker:fire-pots"],
      stacks: [
        ["goblin", 40, 6, 3],
        ["bomb-chucker", 12, 1, 5],
        ["wolf-rider", 8, 7, 7],
        ["boomshaman", 4, 2, 2],
        ["ogre", 4, 6, 5],
        ["orc-warboss", 2, 3, 8],
      ],
    },
    defender: {
      faction: null,
      heroName: null,
      stacks: [
        ["squire", 12, 9, 5],
        ["man-at-arms", 10, 9, 7],
        ["longbowman", 8, 10, 4],
        ["knight", 3, 12, 6],
      ],
    },
  },
  restless: {
    terrain: "wasteland",
    attacker: {
      faction: "undead",
      heroName: "Morwen Ashe",
      command: "one-more-time",
      commandC: 3,
      itemActs: ["a-pinch-of-sand"],
      drills: ["vampire:mesmerise"],
      stacks: [
        ["skeleton", 30, 4, 3],
        ["ghoul", 12, 3, 5],
        ["banshee", 6, 1, 4],
        ["gravecaller", 5, 2, 6],
        ["vampire", 3, 5, 7],
        ["late-king", 1, 1, 8],
      ],
    },
    defender: {
      faction: null,
      heroName: null,
      stacks: [
        ["squire", 20, 7, 6],
        ["longbowman", 10, 11, 4],
        ["man-at-arms", 10, 10, 7],
      ],
    },
    decorate: (fx) => {
      fx.addCondition("d0", { kind: "jinxed", size: 25, clock: 3 });
    },
  },
  // Several stacks of one creature, as a neutral group splits on the map,
  // for the result screen's losses per unit type (bead bzc.92).
  split: {
    terrain: "grass",
    attacker: {
      faction: "humans",
      heroName: "Sir Aldric",
      stacks: [
        ["squire", 20, 1, 2],
        ["longbowman", 8, 0, 4],
        ["knight", 4, 2, 5],
        ["squire", 15, 1, 6],
        ["longbowman", 6, 0, 8],
      ],
    },
    defender: {
      faction: null,
      heroName: null,
      stacks: [
        ["goblin", 30, 12, 1],
        ["wolf-rider", 14, 11, 3],
        ["goblin", 28, 12, 4],
        ["wolf-rider", 12, 11, 6],
        ["goblin", 28, 12, 7],
      ],
    },
  },
};

export function scenarioNames(): string[] {
  return Object.keys(SCENARIOS);
}

function gameSide(
  army: ScenarioArmy,
  side: "attacker" | "defender",
): GameBattleSetup["attacker"] {
  const stacks: GameBattleStack[] = army.stacks.map(([creature, count]) => ({
    creature,
    count,
  }));
  return {
    owner: side === "attacker" ? 0 : null,
    hero:
      army.heroName === null
        ? null
        : {
            id: `debug-${side}`,
            attack: 3,
            defense: 2,
            name: army.heroName,
          },
    stacks,
    defenseBonus: 0,
    faction: army.faction,
    drills: [...(army.drills ?? [])],
    specials: [],
  };
}

/** The game and engine setups of a scenario, or null for an unknown name. */
export function scenarioSetup(
  name: string,
  seed: number,
): { game: GameBattleSetup; engine: EngineBattleSetup } | null {
  const sc = SCENARIOS[name];
  if (!sc) return null;
  const game: GameBattleSetup = {
    seed,
    terrain: sc.terrain,
    attacker: gameSide(sc.attacker, "attacker"),
    defender: gameSide(sc.defender, "defender"),
    battle: {
      kind: "monster",
      objectId: "debug-monster",
      heroId: "debug-attacker",
    },
  };
  const base = engineSetupFromGame(game);
  const place = (
    army: ScenarioArmy,
    setup: EngineBattleSetup["attacker"],
  ): EngineBattleSetup["attacker"] => ({
    ...setup,
    hero:
      setup.hero === null
        ? null
        : {
            ...setup.hero,
            ...(army.command ? { command: army.command } : {}),
            ...(army.commandC ? { commandC: army.commandC } : {}),
            ...(army.itemActs ? { itemActs: [...army.itemActs] } : {}),
          },
    stacks: setup.stacks.map((s, i) => {
      const at = army.stacks[i];
      const hex: Hex | undefined = at ? { col: at[2], row: at[3] } : undefined;
      return hex ? { ...s, hex } : s;
    }),
  });
  return {
    game,
    engine: {
      ...base,
      obstacles: [],
      attacker: place(sc.attacker, base.attacker),
      defender: place(sc.defender, base.defender),
    },
  };
}

/** The scenario's start decorations (conditions), if any. */
export function decorateScenario(
  name: string,
  state: BattleState,
): BattleState {
  const sc = SCENARIOS[name];
  if (!sc?.decorate) return state;
  const d = new Draft(state);
  const fx = new Resolver(d, () => false);
  d.beginStep();
  d.within(null, "debug", () => sc.decorate?.(fx));
  return d.toState();
}

/**
 * Hands the turn to `id` (a debug view only): it becomes the active stack
 * at the front of the queue.
 */
export function giveTurn(state: BattleState, id: StackId): BattleState {
  getStack(state, id);
  return {
    ...state,
    activeStackId: id,
    queue: [id, ...state.queue.filter((x) => x !== id)],
    waiting: state.waiting.filter((x) => x !== id),
  };
}
