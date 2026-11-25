import { describe, expect, it } from "vitest";
import { getStack, makeCondition } from "../../../src/core/battle/index.ts";
import { roundLimitInfo, stackInfo } from "../../../src/ui/battle/info.ts";
import { at, battle, patch, unit } from "./helpers.ts";

describe("stackInfo", () => {
  it("shows standing modifiers: hero, War Drums, Venom, Defend", () => {
    let s = battle(
      [unit("raptor", 7, at(3, 5)), unit("shaman", 2, at(4, 5))],
      [unit("orc-brute", 19, at(10, 5))],
    );
    s = patch(s, "a0", {
      defending: true,
      conditions: [
        makeCondition({ kind: "venomed", size: 3, clock: 2 }, 900, "d0"),
      ],
    });
    const info = stackInfo(s, getStack(s, "a0"));
    expect(info.title).toBe("Raptors");
    expect(info.stats[0]).toEqual({
      label: "Attack",
      value: "12",
      note: "8 base, +2 hero, +2 War Drums",
    });
    // 5 + 2 hero - 3 venom = 4, defending: round_half_up(4 x 1.3) = 5.
    expect(info.stats[1]).toEqual({
      label: "Defense",
      value: "5",
      note: "5 base, +2 hero, −3 Venomed = 4, ×1.3 defending",
    });
    expect(info.ability?.name).toBe("Pack Hunter");
    expect(info.statuses).toEqual([
      "Venomed (Bloom bane, size 3, 2 rounds left): -3 Defense (never below 0) for 2 rounds.",
      "Defending: +30% Defense until its next turn",
      "Can retaliate this round",
    ]);
  });

  it("shows plain stats and shots for shooters", () => {
    const s = battle(
      [unit("caveman", 5, at(0, 5))],
      [unit("bomb-chucker", 8, at(14, 5))],
      null,
    );
    const info = stackInfo(s, getStack(s, "d0"));
    expect(info.stats.map((x) => [x.label, x.value, x.note])).toEqual([
      ["Attack", "6", ""],
      ["Defense", "3", ""],
      ["Damage", "3", "per creature"],
      ["Health", "12/12", "top creature"],
      ["Speed", "4", ""],
      ["Shots", "8/8", ""],
    ]);
    // The Bomb Chucker is the Horde's since v0.2 (FACTION_GOBLINS 5).
    expect(info.ability?.name).toBe("Bomb");
  });
});

describe("roundLimitInfo", () => {
  it("shows rounds left and who wins at the limit as the board stands", () => {
    // 7 Raptors (FV 173) against 5 Orc Brutes (FV 227).
    const s = battle(
      [unit("raptor", 7, at(3, 5))],
      [unit("orc-brute", 5, at(10, 5))],
    );
    const info = roundLimitInfo(s, "attacker");
    expect(info.label).toBe("Round 1 of 15");
    expect(info.left).toBe("15 rounds left");
    expect(info.value).toEqual({ attacker: 7 * 173, defender: 5 * 227 });
    expect(info.winner).toBe("attacker");
    expect(info.verdict).toBe("At the limit: you win, 1211 to 1135");
    expect(roundLimitInfo(s, "defender").verdict).toBe(
      "At the limit: the enemy wins, 1211 to 1135",
    );
    // A wounded top creature counts its HP left: 5 x 22 + 10 = 120 HP of
    // 22-HP Raptors is floor(173 x 120 / 22) = 943. The last round says so.
    const hurt = patch({ ...s, round: 15 }, "a0", { count: 6, topHp: 10 });
    const last = roundLimitInfo(hurt, null);
    expect(last.left).toBe("Last round");
    expect(last.value.attacker).toBe(943);
    expect(last.winner).toBe("defender");
    expect(last.verdict).toBe("At the limit: the defender wins, 1135 to 943");
  });
});
