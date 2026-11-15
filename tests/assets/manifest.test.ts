import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_ASSETS,
  assetByKey,
  assetUrl,
  FOREST_SETS,
  GROUND_TERRAINS,
  GROUND_TEXTURES,
  MOUNTAIN_PIECES,
  TOWN_ASSETS,
  UNIT_ASSETS,
} from "../../src/assets/manifest";

const ROOT = join(import.meta.dirname, "..", "..");
const PUBLIC = join(ROOT, "public");
const PNG_SIGNATURE = "89504e470d0a1a0a";

/** Width and height from a PNG's IHDR chunk. */
function pngSize(file: string): { w: number; h: number } {
  const head = readFileSync(file).subarray(0, 24);
  expect(head.subarray(0, 8).toString("hex"), file).toBe(PNG_SIGNATURE);
  expect(head.subarray(12, 16).toString("latin1"), file).toBe("IHDR");
  return { w: head.readUInt32BE(16), h: head.readUInt32BE(20) };
}

function pngsUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return pngsUnder(full);
    return name.endsWith(".png") ? [full] : [];
  });
}

describe("asset manifest", () => {
  it("has unique keys and paths", () => {
    const keys = ALL_ASSETS.map((asset) => asset.key);
    const paths = ALL_ASSETS.map((asset) => asset.path);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("matches every PNG's header", () => {
    for (const asset of ALL_ASSETS) {
      const size = pngSize(join(PUBLIC, asset.path));
      expect({ key: asset.key, ...size }).toEqual({
        key: asset.key,
        w: asset.w,
        h: asset.h,
      });
    }
  });

  it("lists every PNG under public/assets", () => {
    const listed = new Set(ALL_ASSETS.map((asset) => asset.path));
    const files = pngsUnder(join(PUBLIC, "assets")).map((file) =>
      relative(PUBLIC, file).split(sep).join("/"),
    );
    expect(files.filter((file) => !listed.has(file))).toEqual([]);
  });

  it("matches the sha256 recorded in the provenance table", () => {
    const doc = readFileSync(
      join(ROOT, "docs/art/IMPORTED_FROM_PULP_WARS.md"),
      "utf8",
    );
    const recorded = new Map<string, string>();
    for (const match of doc.matchAll(
      /\| `[^`]+` \| `public\/([^`]+)` \| \d+x\d+ \| `([0-9a-f]{64})` \|/g,
    ))
      recorded.set(match[1]!, match[2]!);
    expect(recorded.size).toBe(ALL_ASSETS.length);
    for (const asset of ALL_ASSETS) {
      const sha = createHash("sha256")
        .update(readFileSync(join(PUBLIC, asset.path)))
        .digest("hex");
      expect({ path: asset.path, sha }).toEqual({
        path: asset.path,
        sha: recorded.get(asset.path),
      });
    }
  });

  it("links units and portraits, and keeps anchors on the canvas", () => {
    for (const unit of UNIT_ASSETS) {
      expect(assetByKey(unit.portrait).category).toBe("portrait");
      expect(unit.anchor.x).toBeGreaterThan(0);
      expect(unit.anchor.x).toBeLessThan(unit.w);
      expect(unit.anchor.y).toBeLessThan(unit.h);
      expect(unit.feet.contactY).toBeLessThanOrEqual(unit.h);
      expect(unit.feet.footRight).toBeLessThanOrEqual(unit.w);
    }
    for (const town of TOWN_ASSETS) {
      expect(town.ground.contactY).toBeLessThanOrEqual(town.h);
      if (town.flag !== null) expect(town.flag.x).toBeLessThan(town.w);
    }
  });

  it("covers every land terrain with a ground texture and a forest set", () => {
    for (const terrain of GROUND_TERRAINS) {
      const ground = GROUND_TEXTURES[terrain];
      expect(ground.w).toBe(ground.columns * 80);
      expect(assetByKey(ground.swatch).category).toBe("ground-swatch");
      const forest = FOREST_SETS[terrain];
      expect(forest.pieces).toHaveLength(20);
      expect(forest.seams.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("has every mountain kind", () => {
    const kinds = new Set(MOUNTAIN_PIECES.map((piece) => piece.kind));
    expect([...kinds].sort()).toEqual([
      "low-ridge",
      "low-single",
      "mine",
      "tall-ridge",
      "tall-single",
    ]);
  });

  it("resolves URLs against a base", () => {
    const asset = assetByKey("dinosaur-caveman");
    expect(assetUrl(asset)).toBe("/assets/units/dinosaur-caveman.png");
    expect(assetUrl(asset, "./")).toBe("./assets/units/dinosaur-caveman.png");
    expect(assetUrl(asset, "/game")).toBe(
      "/game/assets/units/dinosaur-caveman.png",
    );
    expect(() => assetByKey("nope")).toThrow();
  });
});
