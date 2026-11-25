/**
 * Bead border_marches-bzc.48: where the renderer draws placed decorations
 * and props, and their scene entries.
 */
import { describe, expect, it } from "vitest";
import { CELL_PX } from "../../src/assets/manifest";
import { DECORATIONS } from "../../src/assets/decorations";
import { SEAT_PX } from "../../src/assets/object-art";
import {
  decorationCells,
  placeDecoration,
} from "../../src/render/map/decorations";
import { decorationShowcase } from "../../src/render/map/decoration-showcase";
import {
  compareEntries,
  decorationEntries,
  decorationEntry,
} from "../../src/render/map/scene";

const CELL = CELL_PX;
const passable = DECORATIONS.find((d) => d.passable);
const wide = DECORATIONS.find((d) => !d.passable && d.cols === 2);
const single = DECORATIONS.find((d) => !d.passable && d.cols === 1);

describe("placeDecoration", () => {
  it("stands a passable decoration's foot on the cell centre or a given point", () => {
    expect(passable).toBeDefined();
    if (passable === undefined) return;
    const look = passable.looks[0]!;
    const d = placeDecoration({ id: passable.id, x: 3, y: 2 });
    expect([d.footX, d.footY]).toEqual([
      3 * CELL + CELL / 2,
      2 * CELL + CELL / 2,
    ]);
    expect(d.x + look.foot.x).toBe(Math.round(d.footX));
    expect(d.y + look.foot.y).toBe(d.footY);
    const at = placeDecoration({
      id: passable.id,
      x: 3,
      y: 2,
      at: { x: 10, y: 70 },
    });
    expect([at.footX, at.footY]).toEqual([3 * CELL + 10, 2 * CELL + 70]);
    expect(decorationCells({ id: passable.id, x: 3, y: 2 })).toEqual([[3, 2]]);
  });

  it("seats a prop on its footprint's bottom centre, inside its row", () => {
    for (const def of [single, wide]) {
      expect(def).toBeDefined();
      if (def === undefined) continue;
      for (let v = 0; v < def.looks.length; v += 1) {
        const d = placeDecoration({ id: def.id, variant: v, x: 4, y: 1 });
        expect(d.footX).toBe(4 * CELL + (def.cols * CELL) / 2);
        expect(d.footY).toBe(2 * CELL - SEAT_PX.site);
        expect(d.y).toBeGreaterThanOrEqual(CELL);
        expect(d.x).toBeGreaterThanOrEqual(4 * CELL);
        expect(d.x + d.asset.w).toBeLessThanOrEqual((4 + def.cols) * CELL);
      }
    }
    if (wide !== undefined)
      expect(decorationCells({ id: wide.id, x: 4, y: 1 })).toEqual([
        [4, 1],
        [5, 1],
      ]);
  });

  it("throws on an unknown id", () => {
    expect(() => placeDecoration({ id: "nope", x: 0, y: 0 })).toThrow();
  });
});

describe("decoration entries", () => {
  it("draw in the body pass, sorted by foot", () => {
    const id = single?.id ?? "";
    const back = decorationEntry({ id, x: 2, y: 1 });
    const front = decorationEntry({ id, x: 2, y: 3 });
    expect(back.pass).toBe("TALL_BODY");
    expect(back.sprites[0]?.key).toBe(single?.looks[0]?.key);
    expect(compareEntries(back, front)).toBeLessThan(0);
    const sorted = decorationEntries([
      { id, x: 2, y: 3 },
      { id, x: 2, y: 1 },
    ]);
    expect(sorted.map((e) => e.row)).toEqual([back.row, front.row]);
  });
});

describe("decoration showcase", () => {
  it("shows every look of every decoration inside the map", () => {
    const { map, decorations } = decorationShowcase();
    for (const def of DECORATIONS)
      for (let v = 0; v < def.looks.length; v += 1)
        expect(
          decorations.some((p) => p.id === def.id && (p.variant ?? 0) === v),
          `${def.id} ${v}`,
        ).toBe(true);
    for (const p of decorations)
      for (const [x, y] of decorationCells(p)) {
        expect(x).toBeLessThan(map.width);
        expect(y).toBeLessThan(map.height);
      }
    expect(map.cells).toHaveLength(map.width * map.height);
  });
});
