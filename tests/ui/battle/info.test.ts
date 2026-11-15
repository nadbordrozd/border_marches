import { describe, expect, it } from "vitest";
import { getStack } from "../../../src/core/battle/index.ts";
import { stackInfo } from "../../../src/ui/battle/info.ts";
import { at, battle, patch, unit } from "./helpers.ts";

describe("stackInfo", () => {
  it("shows standing modifiers: hero, War Drums, Venom, Defend", () => {
    let s = battle(
      [unit("raptor", 7, at(3, 5)), unit("shaman", 2, at(4, 5))],
      [unit("orc-brute", 19, at(10, 5))],
    );
    s = patch(s, "a0", {
      defending: true,
      statuses: [{ id: "venom", expiresAfterRound: 2, sourceId: "d0" }],
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
      note: "5 base, +2 hero, −3 Venom = 4, ×1.3 defending",
    });
    expect(info.ability?.name).toBe("Pack Hunter");
    expect(info.statuses).toEqual([
      "Venom: −3 Defense until the end of round 2",
      "Defending: +30% Defense until its next turn",
      "Can retaliate this round",
    ]);
  });

  it("neutral stacks have plain stats and shots for shooters", () => {
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
    expect(info.ability).toBeNull();
  });
});
