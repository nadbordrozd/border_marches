/**
 * The fog of war: the dusk cloud. Ported from Pulp Wars
 * src/render/canvas/fog-of-war-v7.ts (`fogTexturePixelsV7`,
 * `fogEdgePixelsV7`, palette "dusk"); LESSONS_MAP_AND_FACTION_SPRITES.md
 * section 3.13.
 *
 * Every unexplored cell shows one continuous texture of mist with round
 * puffs, repeating every seven cells with no cell grid; each puff has a pale
 * rim at its bottom left, a shaded rim and a short cast shadow at its top
 * right (the sun is at the bottom left). Every explored cell beside the fog
 * draws round lobes reaching about 6 px (up to about 12) out of the fog with
 * a thin pale rim, then an 8 px feather of shadow.
 *
 * Border Marches draws the fog as an overlay over the whole scene (HoMaM
 * style), so multi-cell art packed over the whole map is simply covered where
 * it is unexplored, and never changes shape when the fog lifts. The edge
 * reads only which of the eight neighbours are unexplored.
 */
import { CELL_PX } from "../../assets/manifest";
import { hashUnit, modulo } from "./hash";
import {
  cellField,
  edgeDistance,
  BIT_E,
  BIT_N,
  BIT_NE,
  BIT_NW,
  BIT_S,
  BIT_SE,
  BIT_SW,
  BIT_W,
} from "./ground";

type Rgb = readonly [number, number, number];

const CELL = CELL_PX;
export const FOG_PHASES = 7;
export const FOG_TEXTURE_SIZE = CELL * FOG_PHASES;

export const FOG_STYLE = {
  mistDark: [90, 86, 142] as Rgb,
  mistLight: [104, 100, 158] as Rgb,
  puff: [130, 126, 184] as Rgb,
  puffLit: [176, 170, 222] as Rgb,
  puffShade: [112, 108, 166] as Rgb,
  cast: [76, 72, 124] as Rgb,
  rim: [208, 200, 240] as Rgb,
  shadow: [54, 50, 100] as Rgb,
  featherAlpha: 0.42,
  puffs: 46,
  lobeRadius: [7, 18],
  reach: 6,
  scallop: 5.5,
  waves: [1.4, 0.7],
  rimWidth: 1.2,
  feather: 8,
} as const;

/** Nothing of the fog's edge lies farther than this from the fog, px. */
export const FOG_EDGE_REACH = 40;
/** The level of the explored field the cloud's edge follows. */
export const FOG_FIELD_LEVEL = 0.74;

function tileNoise(
  x: number,
  y: number,
  across: number,
  down: number,
  salt: number,
): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const at = (ix: number, iy: number): number =>
    hashUnit(modulo(ix, across), modulo(iy, down), salt);
  const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
  const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
  return top + (bottom - top) * sy;
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

let texture: Uint8ClampedArray | null = null;

/** The periodic cloud texture (FOG_TEXTURE_SIZE square, opaque RGBA). */
export function fogTexturePixels(): Uint8ClampedArray {
  if (texture !== null) return texture;
  const size = FOG_TEXTURE_SIZE;
  const spec = FOG_STYLE;
  const lobes: { x: number; y: number; r: number }[] = [];
  const centres: { x: number; y: number }[] = [];
  const wrapped = (a: number, b: number): number => {
    const d = Math.abs(a - b) % size;
    return Math.min(d, size - d);
  };
  for (let puff = 0; puff < spec.puffs; puff += 1) {
    let best = { x: 0, y: 0 };
    let bestGap = -1;
    for (let candidate = 0; candidate < 12; candidate += 1) {
      const x = hashUnit(puff, candidate, 11) * size;
      const y = hashUnit(puff, candidate, 15) * size;
      let gap = Infinity;
      for (const other of centres)
        gap = Math.min(
          gap,
          Math.hypot(wrapped(x, other.x), 1.6 * wrapped(y, other.y)),
        );
      if (gap > bestGap) {
        bestGap = gap;
        best = { x, y };
      }
    }
    centres.push(best);
    const big = hashUnit(puff, 3, 11) < 0.3;
    const count = (big ? 4 : 2) + Math.floor(hashUnit(puff, 4, 11) * 3);
    for (let lobe = 0; lobe < count; lobe += 1) {
      const r =
        (spec.lobeRadius[0] +
          (spec.lobeRadius[1] - spec.lobeRadius[0]) *
            hashUnit(puff, lobe, 12)) *
        (big ? 1 : 0.8);
      lobes.push({
        x:
          best.x +
          (lobe - (count - 1) / 2) * (big ? 13 : 9) +
          5 * (hashUnit(puff, lobe, 13) - 0.5),
        y: best.y - r * 0.55,
        r,
      });
    }
  }
  const height = new Float32Array(size * size).fill(-1);
  for (const lobe of lobes) {
    const reach = Math.ceil(lobe.r) + 1;
    for (let dy = -reach; dy <= reach; dy += 1)
      for (let dx = -reach; dx <= reach; dx += 1) {
        const px = Math.floor(lobe.x) + dx;
        const py = Math.floor(lobe.y) + dy;
        const value =
          1 - Math.hypot(px + 0.5 - lobe.x, py + 0.5 - lobe.y) / lobe.r;
        const at = modulo(py, size) * size + modulo(px, size);
        if (value > (height[at] ?? -1)) height[at] = value;
      }
  }
  const heightAt = (x: number, y: number): number =>
    height[modulo(y, size) * size + modulo(x, size)] ?? -1;
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) {
      const fx = x / size;
      const fy = y / size;
      const mottle =
        0.6 * tileNoise(fx * 6, fy * 6, 6, 6, 21) +
        0.28 * tileNoise(fx * 13, fy * 13, 13, 13, 22) +
        0.12 * tileNoise(fx * 31, fy * 31, 31, 31, 23);
      const here = heightAt(x, y);
      let colour: Rgb;
      if (here > 0) {
        const lit = heightAt(x - 2, y + 2) <= 0;
        const shaded = heightAt(x + 2, y - 2) <= 0;
        colour = lit ? spec.puffLit : shaded ? spec.puffShade : spec.puff;
      } else {
        const mist = mix(
          spec.mistDark,
          spec.mistLight,
          Math.min(1, Math.max(0, (mottle - 0.3) / 0.4)),
        );
        colour = heightAt(x - 3, y + 3) > 0 ? mix(mist, spec.cast, 0.7) : mist;
      }
      const at = (y * size + x) * 4;
      pixels[at] = colour[0];
      pixels[at + 1] = colour[1];
      pixels[at + 2] = colour[2];
      pixels[at + 3] = 255;
    }
  texture = pixels;
  return pixels;
}

/** How far the cloud reaches out of the fog at world pixel (wx, wy). */
export function fogEdgeReach(wx: number, wy: number): number {
  const turn = (2 * Math.PI) / FOG_TEXTURE_SIZE;
  return (
    FOG_STYLE.reach +
    FOG_STYLE.scallop *
      (Math.abs(Math.sin(turn * (8 * wx + 9 * wy) + 0.6)) - 0.64) +
    FOG_STYLE.waves[0] * Math.sin(turn * (18 * wy - 15 * wx) + 2.3) +
    FOG_STYLE.waves[1] * Math.sin(turn * (41 * wx + 33 * wy) + 4.4)
  );
}

const NEIGHBOURS: readonly (readonly [number, number, number])[] = [
  [0, -1, BIT_N],
  [1, 0, BIT_E],
  [0, 1, BIT_S],
  [-1, 0, BIT_W],
  [1, -1, BIT_NE],
  [1, 1, BIT_SE],
  [-1, 1, BIT_SW],
  [-1, -1, BIT_NW],
];

/** Neighbour bits of the unexplored cells round explored cell (x, y). */
export function fogBits(
  explored: (x: number, y: number) => boolean,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  let bits = 0;
  for (const [dx, dy, bit] of NEIGHBOURS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    if (!explored(nx, ny)) bits |= bit;
  }
  return bits;
}

/**
 * Paints the fog over world rectangle (x0, y0, w, h) into `out` (RGBA,
 * cleared to transparent by the caller). Returns false when nothing of the
 * rectangle is fog or fog edge.
 */
export function paintFog(
  explored: (x: number, y: number) => boolean,
  width: number,
  height: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  out: Uint8ClampedArray,
): boolean {
  const tex = fogTexturePixels();
  const size = FOG_TEXTURE_SIZE;
  const spec = FOG_STYLE;
  let any = false;
  // The smooth explored field (a Border Marches addition): the cloud's edge
  // follows a level of it instead of the cell edges, so the edge of the
  // known world is a curve, not a staircase. It only ever covers explored
  // ground, never uncovers fog.
  const known = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1)
      known[y * width + x] = explored(x, y) ? 1 : 0;
  const cx0 = Math.max(0, Math.floor(x0 / CELL));
  const cy0 = Math.max(0, Math.floor(y0 / CELL));
  const cx1 = Math.min(width - 1, Math.floor((x0 + w - 1) / CELL));
  const cy1 = Math.min(height - 1, Math.floor((y0 + h - 1) / CELL));
  for (let cy = cy0; cy <= cy1; cy += 1)
    for (let cx = cx0; cx <= cx1; cx += 1) {
      const fog = !explored(cx, cy);
      const bits = fog ? 0 : fogBits(explored, width, height, cx, cy);
      if (!fog && bits === 0) continue;
      any = true;
      const ox = cx * CELL;
      const oy = cy * CELL;
      const lx0 = Math.max(0, x0 - ox);
      const ly0 = Math.max(0, y0 - oy);
      const lx1 = Math.min(CELL, x0 + w - ox);
      const ly1 = Math.min(CELL, y0 + h - oy);
      for (let ly = ly0; ly < ly1; ly += 1)
        for (let lx = lx0; lx < lx1; lx += 1) {
          const wx = ox + lx;
          const wy = oy + ly;
          const o = ((wy - y0) * w + (wx - x0)) * 4;
          const s = (modulo(wy, size) * size + modulo(wx, size)) * 4;
          if (fog) {
            out[o] = tex[s] ?? 0;
            out[o + 1] = tex[s + 1] ?? 0;
            out[o + 2] = tex[s + 2] ?? 0;
            out[o + 3] = 255;
            continue;
          }
          const reach = fogEdgeReach(wx + 0.5, wy + 0.5);
          const field = cellField(known, width, height, wx + 0.5, wy + 0.5);
          // The cloud reaches up to a level of the smooth field that passes
          // outside the corners of fog cells, so a staircase of fog cells
          // gets one rounded, scalloped edge about a quarter cell deep.
          const smooth =
            (field.f - FOG_FIELD_LEVEL) /
              Math.max(1e-4, Math.hypot(field.gx, field.gy)) +
            FOG_STYLE.reach;
          const distance = Math.min(
            edgeDistance(bits, lx + 0.5, ly + 0.5),
            smooth,
          );
          if (distance > FOG_EDGE_REACH) continue;
          if (distance < reach) {
            const rim = reach - distance < spec.rimWidth;
            out[o] = rim ? spec.rim[0] : (tex[s] ?? 0);
            out[o + 1] = rim ? spec.rim[1] : (tex[s + 1] ?? 0);
            out[o + 2] = rim ? spec.rim[2] : (tex[s + 2] ?? 0);
            out[o + 3] = 255;
          } else {
            const fade = 1 - (distance - Math.max(reach, 0)) / spec.feather;
            if (fade <= 0) continue;
            out[o] = spec.shadow[0];
            out[o + 1] = spec.shadow[1];
            out[o + 2] = spec.shadow[2];
            out[o + 3] = Math.round(255 * spec.featherAlpha * fade * fade);
          }
        }
    }
  return any;
}
