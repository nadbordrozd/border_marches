/**
 * Adventure spell targeting (bead bzc.47, src/ui/adventure-targets.ts):
 * the valid map targets of each spell, as the game's own cast judges them,
 * and a page that cannot be chosen with its one-line reason.
 */

import { describe, expect, it } from "vitest";
import type { GameState, HeroState } from "../../src/core/game/index.ts";
import { cloneState } from "../../src/core/game/state.ts";
import { withHeroMagic } from "../../src/core/magic/index.ts";
import {
  adventureAims,
  adventureTargetKind,
  adventureUsable,
  aimHint,
} from "../../src/ui/adventure-targets.ts";
import { field, gameOn, monster } from "../core/game/helpers.ts";

const RANKS = { bloom: 1, accord: 2, clock: 1, hush: 1, storm: 1 };
const SCHOOL_SKILLS: Record<string, string> = {
  bloom: "greencraft",
  accord: "covenant",
  clock: "horology",
  hush: "quietus",
  storm: "stormcalling",
};

function hero(s: GameState): HeroState {
  return s.heroes.find((h) => h.id === "hero-0") as HeroState;
}

/** A plain hero (Power 1, 10 mana) with the school ranks that knows `spells`. */
function learn(s: GameState, spells: string[], mana = 10): GameState {
  const next = cloneState(s);
  const h = hero(next);
  h.power = 1;
  h.lore = 1;
  h.feats = [];
  h.worn = h.worn.map(() => null);
  h.skills = Object.entries(SCHOOL_SKILLS).map(([school, id]) => ({
    id,
    rank: RANKS[school as keyof typeof RANKS],
  }));
  h.mana = 10;
  h.pages = [];
  h.scrolls = [];
  withHeroMagic(h, { knownSpells: spells, mana });
  return next;
}

describe("adventure target types", () => {
  it("are plain words with an icon", () => {
    expect(adventureTargetKind("nearbyMonster")).toEqual({
      icon: "enemy",
      label: "A neutral stack within 2 cells",
    });
    expect(adventureTargetKind("none").icon).toBe("self");
    expect(aimHint("parley")).toBe(
      "Parley: click a glowing neutral stack to cast. Esc cancels.",
    );
  });
});

describe("adventure targets", () => {
  it("glow on the neutral stacks a spell can take, not the strong ones", () => {
    const s = learn(
      gameOn(
        field(9, 5),
        [
          monster("weak", 3, 1, "goblin", 10),
          monster("strong", 1, 2, "goblin", 40),
          monster("far", 7, 4, "goblin", 10),
        ],
        2,
        1,
      ),
      ["parley"],
    );
    expect(adventureAims(s, hero(s), "parley", false)).toEqual([
      { x: 3, y: 1, label: "10 Goblin", target: { monsterId: "weak" } },
    ]);
    expect(adventureUsable(s, hero(s), "parley", false).reason).toBeNull();
  });

  it("grey a spell with no target in reach, with the reason", () => {
    const none = learn(gameOn(field(9, 5), [], 2, 1), ["parley"]);
    expect(adventureUsable(none, hero(none), "parley", false)).toEqual({
      reason: "No neutral stack within 2 cells",
      aims: [],
    });
    const strong = learn(
      gameOn(field(9, 5), [monster("m", 3, 1, "goblin", 40)], 2, 1),
      ["parley"],
    );
    expect(adventureUsable(strong, hero(strong), "parley", false).reason).toBe(
      "No stack nearby it can take: fight value 2320 is above 750",
    );
  });

  it("put the game's own refusal first (mana)", () => {
    const s = learn(
      gameOn(field(9, 5), [monster("m", 3, 1, "goblin", 10)], 2, 1),
      ["parley"],
      0,
    );
    expect(adventureUsable(s, hero(s), "parley", false).reason).toMatch(
      /^Needs \d+ mana, the hero has 0$/,
    );
  });

  it("are the explored cells in range for Ask the Dead", () => {
    const s = learn(gameOn(field(40, 9), [], 0, 4), ["ask-the-dead"]);
    const aims = adventureAims(s, hero(s), "ask-the-dead", false) ?? [];
    expect(aims.length).toBeGreaterThan(0);
    const explored = s.players[0]?.explored ?? [];
    for (const a of aims) {
      expect(explored[a.y * 40 + a.x]).toBe(true);
      expect(a.x).toBeLessThanOrEqual(15);
    }
    expect(aims.some((a) => a.x === 14)).toBe(false);
  });

  it("do not glow where Ask the Dead would reveal nothing new", () => {
    const s = learn(gameOn(field(40, 9), [], 0, 4), ["ask-the-dead"]);
    const aims = adventureAims(s, hero(s), "ask-the-dead", false) ?? [];
    // Next to the fog edge something is revealed; the hero's own cell,
    // deep in what it already sees, may reveal nothing.
    expect(aims.some((a) => a.noEffect === undefined)).toBe(true);
    expect(
      adventureUsable(s, hero(s), "ask-the-dead", false).reason,
    ).toBeNull();
    // Everything explored: the page is greyed with the reason.
    const all = cloneState(s);
    const p0 = all.players[0];
    if (p0) p0.explored = p0.explored.map(() => true);
    const none = adventureAims(all, hero(all), "ask-the-dead", false) ?? [];
    expect(none.length).toBeGreaterThan(0);
    expect(none.every((a) => a.noEffect !== undefined)).toBe(true);
    expect(adventureUsable(all, hero(all), "ask-the-dead", false).reason).toBe(
      "Would have no effect: everything in reach is already explored",
    );
  });

  it("are none for a spell without a target", () => {
    const s = learn(gameOn(field(9, 5), [], 2, 1), ["borrowed-day"]);
    expect(adventureAims(s, hero(s), "borrowed-day", false)).toBeNull();
  });
});
