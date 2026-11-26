// The retreat warning (bead border_marches-bzc.92): Retreat in the
// pre-battle dialog asks first and says plainly what is lost under the real
// rules (RULES_V2 1.12, 4.4, 5.4): the whole army, the hero off the map to
// the tavern for the rest of this week and next, rehired for the hiring
// price with a fresh starting army; level, skills and artifacts kept.
// Cancel is the default.
import { describe, expect, it } from "vitest";
import { battleSetup } from "../../src/core/game/index.ts";
import type { GameState } from "../../src/core/game/index.ts";
import { cloneState } from "../../src/core/game/state.ts";
import { HIRE_COST, RETREAT_OFFER_REFRESHES } from "../../src/data/players.ts";
import { getCreature } from "../../src/data/creatures.ts";
import {
  retreatDialogOptions,
  retreatModel,
} from "../../src/ui/dialog-kinds.ts";
import { dialogBox } from "../../src/ui/dialog.ts";
import {
  field,
  gameOn,
  heroStart,
  monster,
  town,
} from "../core/game/helpers.ts";
import { useFakeDocument, type FakeElement } from "./fake-dom.ts";

useFakeDocument();

const fake = (n: unknown): FakeElement => n as FakeElement;

/** Player 0's hero with goblins in two stacks and a troll, before a fight. */
function armed(s: GameState): GameState {
  const next = cloneState(s);
  const hero = next.heroes.find((h) => h.owner === 0)!;
  hero.army = [
    { creature: "goblin", count: 7 },
    { creature: "troll", count: 1 },
    { creature: "goblin", count: 5 },
    null,
    null,
    null,
    null,
  ];
  return next;
}

function neutralFight(): GameState {
  const s = armed(
    gameOn(
      field(8, 3),
      [monster("m", 3, 1, "goblin", 10), town("t", 6, 1, 0)],
      1,
      1,
    ),
  );
  const hero = s.heroes.find((h) => h.owner === 0)!;
  return {
    ...s,
    pendingBattle: { kind: "monster", objectId: "m", heroId: hero.id },
  };
}

describe("retreat warning", () => {
  it("names the whole army per creature type and the hero leaving", () => {
    const s = neutralFight();
    const setup = battleSetup(s)!;
    expect(setup.attacker.canRetreat).toBe(true);
    const hero = s.heroes.find((h) => h.owner === 0)!;
    const m = retreatModel(s, setup, "attacker");
    const goblins = getCreature("goblin").plural;
    const troll = getCreature("troll").name;
    expect(m.title).toBe("Retreat and lose your army?");
    expect(m.sentence).toBe(
      `${hero.name} flees without a fight, and the battle is lost.`,
    );
    expect(m.portrait).toBeTruthy();
    expect(m.lost).toEqual([
      `Your whole army: 12 ${goblins} and 1 ${troll}.`,
      `${hero.name}, who leaves the map at once.`,
    ]);
    expect(RETREAT_OFFER_REFRESHES).toBe(2);
    expect(m.kept).toEqual([
      `The hero's level ${hero.level}, stats, skills, feats, spells, scrolls and artifacts.`,
      `A place in your tavern for the rest of this week and all of next week: rehiring costs ${HIRE_COST} gold and brings only a fresh starting army.`,
    ]);
    expect(m.consequence).toMatch(/common pool, where any player may hire/);
  });

  it("warns that readied potions and blessings are spent", () => {
    const s = cloneState(neutralFight());
    s.heroes.find((h) => h.owner === 0)!.buffs = ["oasis"];
    const m = retreatModel(s, battleSetup(s)!, "attacker");
    expect(m.lost).toContain(
      "Potions and site blessings readied for this battle.",
    );
  });

  it("against a hero, says losing the fight would hand over the artifacts", () => {
    const base = armed(
      gameOn(
        field(8, 3),
        [town("t", 6, 1, 0), town("u", 7, 2, 1), heroStart(3, 1, 1)],
        1,
        1,
      ),
    );
    const hero = base.heroes.find((h) => h.owner === 0)!;
    const foe = base.heroes.find((h) => h.owner === 1)!;
    const s: GameState = {
      ...base,
      pendingBattle: { kind: "hero", objectId: foe.id, heroId: hero.id },
    };
    const m = retreatModel(s, battleSetup(s)!, "attacker");
    expect(m.consequence).toBe(
      `Fighting and losing costs the army too, the hero goes to the common pool, and ${foe.name} takes its artifacts.`,
    );
  });

  it("makes Cancel the default: Enter, Escape and focus; Retreat needs a click", () => {
    const s = neutralFight();
    const options = retreatDialogOptions(
      retreatModel(s, battleSetup(s)!, "attacker"),
    );
    const got: boolean[] = [];
    const built = dialogBox(options, (v) => got.push(v));
    expect(options.cancel).toBe(false);
    expect(built.buttons.map((b) => fake(b).textContent)).toEqual([
      "CancelEnter",
      "Retreat anyway",
    ]);
    expect(built.primary).toBe(built.buttons[0]);
    expect(built.keys.size).toBe(0);
    const text = fake(built.box).textContent;
    expect(text).toContain("You lose");
    expect(text).toContain("You keep");
    expect(text).toContain("Your whole army: 12");
    for (const fn of fake(built.buttons[1]).listeners.get("click") ?? [])
      fn({});
    expect(got).toEqual([true]);
  });
});
