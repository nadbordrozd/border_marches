import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_ASSETS,
  assetByKey,
  assetUrl,
  FOREST_SETS,
  GROUND_TERRAINS,
  GROUND_TEXTURES,
  HERO_ASSETS,
  MOUNTAIN_PIECES,
  RESOURCE_ITEMS,
  RESOURCE_MINES,
  RESOURCE_PICKUPS,
  TOWN_ASSETS,
  TREASURE_PICKUP,
  UNIT_ASSETS,
} from "../../src/assets/manifest";

const ROOT = join(import.meta.dirname, "..", "..");
const PUBLIC = join(ROOT, "public");
const PNG_SIGNATURE = "89504e470d0a1a0a";

const parsed = new Map<string, unknown>();
/** Parsed JSON, read once per file (records run to hundreds of kilobytes). */
function readJson<T>(file: string): T {
  if (!parsed.has(file))
    parsed.set(file, JSON.parse(readFileSync(file, "utf8")));
  return parsed.get(file) as T;
}

/** Imported Pulp Wars files: public path -> sha256 from the provenance table. */
function provenance(): Map<string, string> {
  const doc = readFileSync(
    join(ROOT, "docs/art/IMPORTED_FROM_PULP_WARS.md"),
    "utf8",
  );
  const recorded = new Map<string, string>();
  for (const match of doc.matchAll(
    /\| `[^`]+` \| `public\/([^`]+)` \| \d+x\d+ \| `([0-9a-f]{64})` \|/g,
  ))
    recorded.set(match[1]!, match[2]!);
  return recorded;
}

interface StudioOutput {
  readonly set: string;
  readonly from: string;
  readonly width?: number;
  readonly height?: number;
}

/**
 * Studio-generated game files: every `outputs[]` entry under public/ of a
 * set in art/sets/, keyed by its path relative to public/.
 */
const STUDIO: ReadonlyMap<string, StudioOutput> = new Map(
  readdirSync(join(ROOT, "art/sets"))
    .filter((set) => existsSync(join(ROOT, "art/sets", set, "recipes.json")))
    .flatMap((set) =>
      (
        readJson<{
          outputs?: {
            path: string;
            from: string;
            width?: number;
            height?: number;
          }[];
        }>(join(ROOT, "art/sets", set, "recipes.json")).outputs ?? []
      )
        .filter((output) => output.path.startsWith("public/"))
        .map((output): [string, StudioOutput] => [
          output.path.slice("public/".length),
          { ...output, set },
        ]),
    ),
);

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

  it("matches the sha256 recorded in the provenance table (imported art)", () => {
    const recorded = provenance();
    expect(recorded.size).toBe(ALL_ASSETS.length - STUDIO.size);
    for (const asset of ALL_ASSETS) {
      if (STUDIO.has(asset.path)) continue;
      const sha = createHash("sha256")
        .update(readFileSync(join(PUBLIC, asset.path)))
        .digest("hex");
      expect({ path: asset.path, sha }).toEqual({
        path: asset.path,
        sha: recorded.get(asset.path),
      });
    }
  });

  it("checks studio art against its studio records", () => {
    const listed = new Set(ALL_ASSETS.map((asset) => asset.path));
    const imported = provenance();
    expect(STUDIO.size).toBeGreaterThan(0);
    for (const [path, output] of STUDIO) {
      // Listed in the manifest, never in the Pulp Wars provenance table.
      expect({ path, listed: listed.has(path) }).toEqual({
        path,
        listed: true,
      });
      expect({ path, imported: imported.has(path) }).toEqual({
        path,
        imported: false,
      });
      // Derived from an accepted take whose master is the recorded candidate.
      const set = join(ROOT, "art/sets", output.set);
      const verdicts = readJson<Record<string, { verdict: string }>>(
        join(set, "verdicts.json"),
      );
      expect({ path, verdict: verdicts[output.from]?.verdict }).toEqual({
        path,
        verdict: "ACCEPTED",
      });
      const [, id, n] = /^(.+)#(\d+)$/.exec(output.from)!;
      const records = readJson<
        Record<string, { status: string; candidates: { sha256: string }[] }>
      >(join(set, "records.json"));
      const candidate = records[id!]?.candidates[Number(n)];
      const master = readFileSync(
        join(ROOT, "art/masters", output.set, `${id}-${n}.png`),
      );
      expect({
        path,
        sha: createHash("sha256").update(master).digest("hex"),
      }).toEqual({ path, sha: candidate?.sha256 });
      if (output.width !== undefined)
        expect({ path, ...pngSize(join(PUBLIC, path)) }).toEqual({
          path,
          w: output.width,
          h: output.height,
        });
    }
    // Pixel-exact re-derivation of every output from its master.
    expect(() =>
      execFileSync(process.execPath, ["tools/art/studio-art.mjs", "validate"], {
        cwd: ROOT,
        stdio: "pipe",
      }),
    ).not.toThrow();
    // About 1.5 s alone (mostly the validate child process), several times
    // that when parallel test runs share the machine.
  }, 60_000);

  it("names a pickup, a mine and a 32 px item for every resource", () => {
    for (const resource of ["wood", "ore", "gold", "essence"] as const) {
      expect(assetByKey(RESOURCE_PICKUPS[resource]).category).toBe("object");
      expect(assetByKey(RESOURCE_MINES[resource]).category).toMatch(
        /^(object|mountain)$/,
      );
      const item = RESOURCE_ITEMS[resource];
      expect([item.w, item.h, item.resource]).toEqual([32, 32, resource]);
    }
    expect(assetByKey(TREASURE_PICKUP).category).toBe("object");
  });

  it("links units and portraits, and keeps anchors on the canvas", () => {
    for (const unit of [...UNIT_ASSETS, ...HERO_ASSETS]) {
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
