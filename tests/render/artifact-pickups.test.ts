/**
 * Artifacts on the adventure map (bead bzc.105): a loose artifact is drawn
 * as its own icon on a cloth, its card names it and shows it; a Mystery Bag
 * keeps its artifact secret until it is opened.
 */
import { describe, expect, it } from "vitest";
import { moveHeroAlong } from "../../src/core/game/index.ts";
import { cloneState } from "../../src/core/game/state.ts";
import { mysteryArtifactOf, mysteryItem } from "../../src/core/map/mystery.ts";
import type { MapObject } from "../../src/core/map/types.ts";
import { ICON_ASSETS } from "../../src/assets/icons.ts";
import { assetByKey, CELL_PX } from "../../src/assets/manifest.ts";
import { ARTIFACT_CLOTH } from "../../src/assets/map-objects.ts";
import { findArtifact } from "../../src/data/artifacts.ts";
import { mapAssetList } from "../../src/render/map/assets.ts";
import { artifactShowcase } from "../../src/render/map/artifact-showcase.ts";
import {
  artifactIconKey,
  objectEntries,
  shownArtifact,
} from "../../src/render/map/scene.ts";
import { mapCard, objectPictureKey } from "../../src/ui/map-card.ts";
import { siteResult } from "../../src/ui/visit-results.ts";
import { resultIcons } from "../../src/ui/dialog-kinds.ts";
import { inspectCard, inspectKey } from "../../src/ui/inspect.ts";
import { validateMap } from "../../src/core/map/types.ts";
import { field, gameOn, ok } from "../core/game/helpers.ts";
import { useFakeDocument, type FakeElement } from "../ui/fake-dom.ts";

useFakeDocument();

function loose(id: string, artifact: string, x = 1, y = 0): MapObject {
  return {
    id,
    kind: "artifact",
    x,
    y,
    footprint: { w: 1, h: 1 },
    blocked: [],
    data: { type: "loose-artifact", artifact, value: 2000 },
  };
}

const keysOf = (obj: MapObject): string[] =>
  objectEntries([obj]).flatMap((e) => e.sprites.map((s) => s.key));

describe("a loose artifact on the map (bead bzc.105)", () => {
  it("is drawn with its own icon, one per artifact id", () => {
    const ids = [
      "bloodstone-ring",
      "brass-bugle",
      "ball-and-chain",
      "blue-tonic",
    ];
    const icons = ids.map((a) => keysOf(loose("la", a)).at(-1));
    expect(icons).toEqual(ids.map((a) => `icon-artifacts-${a}`));
    expect(new Set(icons).size).toBe(ids.length);
    for (const a of ids) expect(artifactIconKey(a)).toBe(`icon-artifacts-${a}`);
    // Never the generic loose-artifact sprite.
    for (const a of ids)
      expect(keysOf(loose("la", a))).not.toContain("map-object-loose-artifact");
  });

  it("rests on the cloth, inside its cell, with a ground shadow", () => {
    const [e] = objectEntries([loose("la", "bloodstone-ring", 3, 2)]);
    expect(e?.objectId).toBe("la");
    expect(e?.cells).toEqual([[3, 2]]);
    const [cloth, icon] = e!.sprites;
    expect(cloth?.key).toBe(ARTIFACT_CLOTH.key);
    expect(icon?.sw).toBe(32);
    // The icon stands on the cloth, both inside the cell.
    for (const s of [cloth!, icon!]) {
      expect(s.dx).toBeGreaterThanOrEqual(3 * CELL_PX);
      expect(s.dx + s.sw).toBeLessThanOrEqual(4 * CELL_PX);
      expect(s.dy).toBeGreaterThanOrEqual(2 * CELL_PX);
      expect(s.dy + s.sh).toBeLessThanOrEqual(3 * CELL_PX);
    }
    expect(icon!.dy + icon!.sh).toBeGreaterThan(cloth!.dy);
    expect(icon!.dy + icon!.sh).toBeLessThan(cloth!.dy + cloth!.sh);
    expect(e!.shadows.length).toBeGreaterThan(0);
  });

  it("falls back to the artifact fallback icon for an unknown id", () => {
    expect(keysOf(loose("la", "no-such-thing")).at(-1)).toBe(
      "icon-fallback-artifact",
    );
  });

  it("loads with the map's images", () => {
    const keys = new Set(mapAssetList().map((a) => a.key));
    expect(keys.has(ARTIFACT_CLOTH.key)).toBe(true);
    expect(keys.has("icon-fallback-artifact")).toBe(true);
    for (const a of ICON_ASSETS.filter((i) => i.kind === "artifact"))
      expect(keys.has(a.key)).toBe(true);
    expect(assetByKey(ARTIFACT_CLOTH.key)).toBe(ARTIFACT_CLOTH);
  });

  it("names the real artifact on its card and shows its icon", () => {
    const s = cloneState(
      gameOn(field(4, 1), [loose("la", "bloodstone-ring", 2, 0)]),
    );
    for (const p of s.players) p.explored.fill(true);
    const c = mapCard(s, 0, 2, 0, "hero-0")!;
    const def = findArtifact("bloodstone-ring")!;
    expect(c.title).toBe(def.name);
    expect(c.subtitle).toMatch(/^Wonder · Ring$/);
    expect(c.picture).toEqual({
      key: "icon-artifacts-bloodstone-ring",
      scale: 2,
    });
    expect(c.lines[0]).toMatchObject({ kind: "text", text: def.text });
    expect(objectPictureKey(loose("la", "brass-bugle"))).toBe(
      "icon-artifacts-brass-bugle",
    );
  });

  it("warns of a curse on the card", () => {
    const s = cloneState(gameOn(field(4, 1), [loose("la", "ball-and-chain")]));
    for (const p of s.players) p.explored.fill(true);
    const c = mapCard(s, 0, 1, 0, "hero-0")!;
    expect(c.lines.some((l) => l.kind === "text" && l.tone === "bad")).toBe(
      true,
    );
  });

  it("stays hidden under fog", () => {
    const s = cloneState(gameOn(field(4, 1), [loose("la", "brass-bugle", 3)]));
    s.players[0]!.explored.fill(false);
    expect(mapCard(s, 0, 3, 0, "hero-0")?.title).toBe("Unexplored");
  });
});

describe("the Mystery Bag on the map (bead bzc.105)", () => {
  const bag = mysteryItem({ seed: 7 }, "mb", 1, 0);
  const secret = findArtifact(String(bag.data["artifact"]))!;

  it("is drawn with its own art, never its artifact's icon", () => {
    expect(shownArtifact(bag)).toBeNull();
    const keys = keysOf(bag);
    expect(keys).toEqual(["map-object-mystery-bag"]);
    expect(objectPictureKey(bag)).toBe("map-object-mystery-bag");
  });

  it("says on its card that it holds an unknown artifact", () => {
    const s = cloneState(gameOn(field(4, 1), [bag]));
    for (const p of s.players) p.explored.fill(true);
    const c = mapCard(s, 0, 1, 0, "hero-0")!;
    expect(c.title).toBe("Mystery Bag");
    const text = c.lines
      .flatMap((l) => (l.kind === "text" ? [l.text] : []))
      .join(" ");
    expect(text).toContain("unknown artifact");
    expect(JSON.stringify(c)).not.toContain(secret.name);
  });

  it("reveals the artifact in the pickup dialog when opened", () => {
    const s = cloneState(gameOn(field(4, 1), [bag]));
    const r = ok(moveHeroAlong(s, "hero-0", [{ x: 1, y: 0 }]));
    const e = r.events.find((x) => x.type === "site");
    if (e?.type !== "site") throw new Error("no site line");
    const shown = siteResult(r.state, bag, e.text, null, r.state.heroes[0]);
    expect(shown.show).toBe("dialog");
    expect(shown.title).toBe("Mystery Bag");
    expect(shown.sentence).toContain(secret.name);
    const icon = {
      kind: "artifact" as const,
      id: mysteryArtifactOf(s.map, bag),
    };
    expect(shown.icons).toEqual([icon]);
    // Its tile is an inspectable card (bead bzc.108), the inventory's own.
    const box = resultIcons(shown.icons) as unknown as FakeElement;
    const tiles = box.all("gm-inspect");
    expect(tiles.map((t) => t.dataset["inspect"])).toEqual([inspectKey(icon)]);
    expect(tiles[0]!.hasAttribute("data-tip")).toBe(true);
    const card = inspectCard(icon) as unknown as FakeElement;
    expect(card.textContent).toContain(secret.text);
    // Gone from the map once opened.
    expect(r.state.collected).toContain("mb");
  });
});

describe("the artifacts showcase map (bead bzc.105)", () => {
  it("is a valid map of loose artifacts and Mystery Bags", () => {
    const map = artifactShowcase();
    expect(validateMap(map)).toEqual([]);
    const entries = objectEntries(map.objects);
    const keys = new Set(entries.flatMap((e) => e.sprites.map((s) => s.key)));
    expect(keys.has("map-object-mystery-bag")).toBe(true);
    expect(
      [...keys].filter((k) => k.startsWith("icon-artifacts-")).length,
    ).toBe(8);
  });
});
