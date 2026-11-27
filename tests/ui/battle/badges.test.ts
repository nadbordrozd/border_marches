// Condition badges as icons and link lines only for the active or hovered
// stack (UI_V2 UI2-04, bead border_marches-bzc.55).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  conditionKind,
  conditionKindIds,
} from "../../../src/core/battle/index.ts";
import { registerSpells } from "../../../src/core/magic/index.ts";
import { iconFor } from "../../../src/assets/icons.ts";
import { isKeyword, keyword } from "../../../src/data/keywords.ts";
import {
  BADGE_SIZE,
  CHIP_DX,
  CHIP_DY,
  CHIP_H,
  MAX_BADGES,
  badgeAt,
  badgeRects,
  badgeRow,
  pipOf,
  visibleLinks,
} from "../../../src/render/battle/grammar-view.ts";
import type {
  ConditionPip,
  LinkLine,
} from "../../../src/render/battle/grammar-view.ts";

registerSpells();

function pip(
  kind: string,
  over: Partial<{ bane: boolean; hold: boolean; link: string | null }> = {},
  uid = 0,
): ConditionPip {
  return pipOf({
    uid,
    kind,
    school: "bloom",
    polarity: over.bane === true ? "bane" : "boon",
    hold: over.hold ?? false,
    link: over.link ?? null,
  });
}

describe("condition badges (UI2-04)", () => {
  it("every condition kind in the engine has its own 16 px icon", () => {
    const ids = conditionKindIds();
    // The humans' link conditions and the spells' kinds are registered.
    expect(ids).toEqual(
      expect.arrayContaining(["sworn", "challenged", "venomed", "warded"]),
    );
    // Steam's icons come with the Deepforge creature art (bead bzc.131);
    // until then it draws the fallback.
    const artPending = new Set(["steam"]);
    for (const id of ids) {
      expect(isKeyword(id), `keyword ${id}`).toBe(true);
      expect(keyword(id).icon, `keyword icon ${id}`).toEqual({
        kind: "condition",
        id,
      });
      if (artPending.has(id)) continue;
      const ref = iconFor("condition", id, 16);
      const file = join("public", ref.asset.path);
      expect(existsSync(file), file).toBe(true);
      expect(ref.fallback, `${conditionKind(id).name} has art`).toBe(false);
      expect(ref.asset.w, `${id} 16 px`).toBe(16);
    }
    // The grammar demo's Guarded (src/ui/battle/debug.ts) has art too.
    const guard = iconFor("condition", "demo-guard", 16);
    expect([guard.fallback, guard.asset.w]).toEqual([false, 16]);
  });

  it("shows at most three badges, Holds, links, banes then boons, and +N", () => {
    const pips = [
      pip("lucky", {}, 1),
      pip("venomed", { bane: true }, 2),
      pip("heartened", {}, 3),
      pip("sworn", { link: "d0" }, 4),
      pip("frozen", { bane: true, hold: true }, 5),
    ];
    const row = badgeRow(pips);
    expect(MAX_BADGES).toBe(3);
    expect(row.shown.map((p) => p.kind)).toEqual([
      "frozen",
      "sworn",
      "venomed",
    ]);
    expect(row.more).toBe(2);
    expect(badgeRow(pips.slice(0, 2))).toEqual({
      shown: [pips[1], pips[0]],
      more: 0,
    });
    expect(badgeRow([])).toEqual({ shown: [], more: 0 });
  });

  it("lays the badges in one row under the count chip", () => {
    const feet = { x: 100, y: 200 };
    const pips = [
      pip("venomed", { bane: true }, 1),
      pip("lucky", {}, 2),
      pip("shaken", { bane: true }, 3),
      pip("burning", { bane: true }, 4),
    ];
    const rects = badgeRects(feet, pips);
    expect(rects).toHaveLength(4);
    const chipBottom = Math.round(feet.y + CHIP_DY) + CHIP_H;
    for (const r of rects) {
      expect(r.y).toBeGreaterThan(chipBottom);
      expect(r.h).toBe(BADGE_SIZE);
    }
    expect(rects[0]!.x).toBe(feet.x + CHIP_DX);
    expect(rects[1]!.x).toBeGreaterThanOrEqual(rects[0]!.x + BADGE_SIZE);
    expect(rects.slice(0, 3).map((r) => r.pip?.kind)).toEqual([
      "venomed",
      "shaken",
      "burning",
    ]);
    expect(rects[3]).toMatchObject({ pip: null, more: 1 });
    expect(badgeRects(feet, [])).toEqual([]);
  });

  it("finds the stack whose badges are pointed at", () => {
    const units = [
      {
        id: "a0",
        x: 100,
        y: 200,
        visible: true,
        count: 5,
        pips: [pip("lucky")],
      },
      {
        id: "a1",
        x: 300,
        y: 200,
        visible: false,
        count: 5,
        pips: [pip("lucky")],
      },
      { id: "a2", x: 500, y: 200, visible: true, count: 5, pips: [] },
    ];
    const r = badgeRects(units[0]!, units[0]!.pips)[0]!;
    expect(badgeAt(units, { x: r.x + 8, y: r.y + 8 })).toBe("a0");
    expect(badgeAt(units, { x: r.x + 8, y: r.y - 20 })).toBeNull();
    // Hidden stacks and stacks without conditions have no badges.
    expect(badgeAt(units, { x: 300 + 12, y: r.y + 8 })).toBeNull();
    expect(badgeAt(units, { x: 500 + 12, y: r.y + 8 })).toBeNull();
  });

  it("draws link lines only for the active or the hovered stack", () => {
    const links: LinkLine[] = [
      { near: "a0", far: "d0", color: "#fff", label: "Sworn" },
      { near: "a1", far: "a2", color: "#fff", label: "Scapegoat" },
    ];
    expect(visibleLinks(links, null, null)).toEqual([]);
    expect(visibleLinks(links, "a0", null)).toEqual([links[0]]);
    expect(visibleLinks(links, "d1", "d0")).toEqual([links[0]]);
    expect(visibleLinks(links, "a2", "a0")).toEqual(links);
    expect(visibleLinks(links, "d1", "a3")).toEqual([]);
  });
});
