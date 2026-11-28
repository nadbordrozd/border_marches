import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BATTLE_PIECE_ART,
  BATTLE_PIECE_ASSETS,
  DECK_BOARDS,
  DECK_TEXTURE,
} from "../../../src/assets/battle-pieces.ts";
import { ALL_ASSETS } from "../../../src/assets/manifest.ts";
import { STAGE_W } from "../../../src/render/battle/geometry.ts";
import {
  MAST_PENNANT,
  NAVAL_PIECE_ART,
  NAVAL_PIECE_KEYS,
  deckColumns,
  tintPennant,
} from "../../../src/render/battle/naval.ts";

describe("naval battle art (bead bzc.160)", () => {
  it("registers art for every piece key but the water", () => {
    const keys: string[] = Object.values(NAVAL_PIECE_KEYS);
    for (const key of Object.keys(NAVAL_PIECE_ART)) expect(keys).toContain(key);
    expect(keys.filter((k) => !(k in NAVAL_PIECE_ART))).toEqual([
      NAVAL_PIECE_KEYS.water,
    ]);
    // One gun per facing, the attacker's first.
    expect(BATTLE_PIECE_ART["battle-deck-gun"]).toHaveLength(2);
    for (const asset of BATTLE_PIECE_ASSETS) {
      expect(ALL_ASSETS).toContain(asset);
      const head = readFileSync(`public/${asset.path}`).subarray(0, 24);
      expect([head.readUInt32BE(16), head.readUInt32BE(20)], asset.key).toEqual(
        [asset.w, asset.h],
      );
    }
  });

  it("cuts the stage into the deck texture's boards, never one twice running", () => {
    expect(DECK_BOARDS[DECK_BOARDS.length - 1]).toBe(DECK_TEXTURE.w);
    const columns = deckColumns(STAGE_W, DECK_BOARDS);
    expect(columns).toHaveLength(STAGE_W);
    const starts: number[] = [];
    columns.forEach((c, x) => {
      expect(c.tx).toBeGreaterThanOrEqual(0);
      expect(c.tx).toBeLessThan(DECK_TEXTURE.w);
      expect(c.shift).toBeLessThan(DECK_TEXTURE.h);
      const prev = columns[x - 1];
      if (prev && c.tx === prev.tx + 1 && c.shift === prev.shift) return;
      expect(DECK_BOARDS).toContain(c.tx);
      starts.push(c.tx);
    });
    for (let i = 1; i < starts.length; i++)
      expect(starts[i]).not.toBe(starts[i - 1]);
    expect(deckColumns(STAGE_W, DECK_BOARDS)).toEqual(columns);
  });

  it("tints only the pennant of the mast", () => {
    const [mast] = BATTLE_PIECE_ART["battle-mast"];
    const width = mast.w;
    const height = mast.h;
    const data = new Uint8ClampedArray(width * height * 4);
    const put = (x: number, y: number, v: number) =>
      data.set([v, v - 4, v - 10, 255], (y * width + x) * 4);
    put(MAST_PENNANT.minX + 4, 6, 245);
    // The furled sail below the pennant and the pole beside it stay.
    put(MAST_PENNANT.minX + 4, MAST_PENNANT.maxY + 20, 245);
    put(MAST_PENNANT.minX - 1, 6, 245);
    const at = (d: Uint8ClampedArray, x: number, y: number) => [
      ...d.subarray((y * width + x) * 4, (y * width + x) * 4 + 3),
    ];
    const blue = tintPennant({ width, height, data }, "attacker").data;
    const red = tintPennant({ width, height, data }, "defender").data;
    const [br, , bb] = at(blue, MAST_PENNANT.minX + 4, 6);
    const [rr, , rb] = at(red, MAST_PENNANT.minX + 4, 6);
    expect(bb).toBeGreaterThan(br ?? 255);
    expect(rr).toBeGreaterThan(rb ?? 255);
    expect(at(blue, MAST_PENNANT.minX + 4, MAST_PENNANT.maxY + 20)).toEqual([
      245, 241, 235,
    ]);
    expect(at(blue, MAST_PENNANT.minX - 1, 6)).toEqual([245, 241, 235]);
  });
});
