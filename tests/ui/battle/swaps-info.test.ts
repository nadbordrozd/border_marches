/**
 * Swaps on hover (intent.ts), the exact preview of positional acts and
 * condition clocks (magic.ts castPreview, grammar.ts chainLines), and the
 * info panel's abilities with their sources (info.ts).
 */

import { describe, expect, it } from "vitest";
import {
  createBattle,
  getStack,
  legalActions,
} from "../../../src/core/battle/index.ts";
import type { BattleState } from "../../../src/core/battle/index.ts";
import { hexToStage } from "../../../src/render/battle/geometry.ts";
import { stackInfo } from "../../../src/ui/battle/info.ts";
import {
  hoverIntent,
  indexLegalActions,
} from "../../../src/ui/battle/intent.ts";
import { castPreview, roundsChange } from "../../../src/ui/battle/magic.ts";
import {
  decorateScenario,
  giveTurn,
  scenarioSetup,
} from "../../../src/ui/battle/scenarios.ts";
import { at, battle, unit } from "../../core/battle/faction-helpers.ts";

/** A Realm army whose natives deploy Sworn in pairs (slot order). */
function realm(): BattleState {
  const sc = scenarioSetup("realm", 3);
  if (!sc) throw new Error("no scenario");
  return giveTurn(
    decorateScenario("realm", createBattle(sc.engine).state),
    "a0",
  );
}

describe("swaps (Sworn)", () => {
  it("indexes the swap apart from walks and offers it on the partner", () => {
    const s = realm();
    const legal = indexLegalActions(legalActions(s));
    expect([...legal.swaps.keys()]).toEqual(["a1"]);
    const partner = getStack(s, "a1");
    expect(legal.moves.has(partner.hex.col + partner.hex.row * 15)).toBe(false);
    const it = hoverIntent(
      s,
      legal,
      partner.hex,
      hexToStage(partner.hex),
      true,
    );
    expect(it.kind).toBe("swap");
    if (it.kind !== "swap") return;
    expect(it.action).toEqual({
      type: "move",
      stackId: "a0",
      to: partner.hex,
      swapWith: "a1",
    });
    const pv = castPreview(s, it.action);
    expect(pv.summary).toEqual([
      "Squires: swaps places",
      "Longbowmen: swaps places",
    ]);
    expect(pv.lines).toEqual(["Squires swap places with Longbowmen"]);
  });

  it("a shot needs no swap when the shooter can shoot where it stands", () => {
    const s = giveTurn(realm(), "a1");
    const legal = indexLegalActions(legalActions(s));
    for (const a of legal.shots.values()) expect(a.swapWith).toBeUndefined();
  });
});

describe("previews of positional acts and clocks", () => {
  it("names the push of a Hurl and the clock a Pinch of Sand winds", () => {
    const s = giveTurn(
      battle(
        {
          hero: { attack: 0, defense: 0, itemActs: ["a-pinch-of-sand"] },
          stacks: [unit("ogre", 2, at(5, 5))],
        },
        { stacks: [unit("squire", 5, at(6, 5))] },
      ),
      "a0",
    );
    const hurl = castPreview(s, {
      type: "ability",
      stackId: "a0",
      ability: "hurl",
      targets: [{ stack: "d0" }],
    });
    expect(hurl.summary).toEqual(["Squires: pushed 6 hexes"]);
    expect(hurl.lines).toEqual(["Ogres: Hurl", "Squires pushed 6 hexes"]);
    const sc = scenarioSetup("realm", 3);
    if (!sc) throw new Error("no scenario");
    const r = giveTurn(
      decorateScenario("realm", createBattle(sc.engine).state),
      "a0",
    );
    const uid = getStack(r, "d0").conditions[0]?.uid ?? -1;
    const pinch = castPreview(r, {
      type: "heroAct",
      stackId: "a0",
      act: "a-pinch-of-sand",
      targets: [{ stack: "d0", condition: uid }],
    });
    expect(pinch.summary).toEqual(["Goblins: Shaken for 2 → 4 rounds"]);
    expect(pinch.lines).toContain("Shaken on Goblins now lasts 4 rounds");
  });

  it("words a condition's new length in rounds, never as a clock", () => {
    expect(roundsChange(2, 4)).toBe("for 2 → 4 rounds");
    expect(roundsChange(2, 1)).toBe("for 2 → 1 round");
    expect(roundsChange(undefined, 3)).toBe("for 3 rounds");
    expect(roundsChange(null, 2)).toBe("for the whole battle → 2 rounds");
    expect(roundsChange(2, null)).toBe("for 2 rounds → the whole battle");
  });
});

describe("the info panel's abilities", () => {
  it("names each ability's source: own, Drill, birthright", () => {
    const sc = scenarioSetup("horde", 3);
    if (!sc) throw new Error("no scenario");
    const s = createBattle(sc.engine).state;
    const info = stackInfo(s, getStack(s, "a2"));
    expect(info.abilities.map((a) => [a.name, a.source, a.activated])).toEqual([
      ["Worry", "ability", null],
      ["Hit and Run", "drill", null],
      ["Launched", "birthright", null],
    ]);
    expect(info.birthright?.name).toBe("Launched");
    expect(info.drills).toEqual(["Racing Track"]);
    const ogres = stackInfo(s, getStack(s, "a4"));
    expect(ogres.abilities[0]).toMatchObject({
      name: "Hurl",
      activated: "Every turn, instead of attacking. It may walk first.",
    });
  });

  it("shows a caster's pages at its Power, and Sworn as a birthright", () => {
    const sc = scenarioSetup("restless", 3);
    if (!sc) throw new Error("no scenario");
    const s = createBattle(sc.engine).state;
    const g = stackInfo(s, getStack(s, "a3"));
    expect(g.pages.map((p) => [p.id, p.spent])).toEqual([
      ["second-shift", false],
      ["pass-on", false],
    ]);
    expect(g.castPower).toBe(3);
    const v = stackInfo(s, getStack(s, "a4"));
    expect(v.abilities.find((a) => a.id === "mesmerise")).toMatchObject({
      source: "drill",
      activated:
        "Once per battle, instead of attacking. It may walk first. Not used yet.",
    });
    const r = realm();
    const squires = stackInfo(r, getStack(r, "a0"));
    expect(squires.birthright?.name).toBe("Sworn");
    expect(squires.abilities.map((a) => a.name)).toEqual(["Attend"]);
  });
});
