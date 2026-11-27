// The ground experiments of bead bzc.127, as painter models (painter.mjs).
// Everything is a pure function of world pixels and fixed salts, as the
// game's ground is, so any of it could run per chunk in the renderer.
//
// A  richer code layers over the game's own textures: patch bombing (each
//    region of about two cells reads the texture at its own offset, so the
//    period never shows), two scales of soft colour drift in three dithered
//    palettes, a fine 2-4 px mottle, and a detail overlay of tufts,
//    pebbles or ripples drawn in code at its own period.
// B  PixelLab grounds: several 400 px takes per ground (not tileable)
//    mixed by the same patch bombing, each region centred in one take.
// C  mask transitions: the border between two grounds cut by a generated
//    brush mask (PixelLab, moss-on-stone splatter) plus a slow noise, so it
//    interlocks in lobes and specks both ways, with a terrain-specific
//    rim band on the lower ground.
// Combo  B's takes with A's drift and overlay, C's transitions and ground
//    patches under objects.

const CELL = 80;
const modulo = (value, by) => ((value % by) + by) % by;
const luma = (r, g, b) => 0.3 * r + 0.59 * g + 0.11 * b;

/** Noise helpers over a 32-bit coordinate hash (the game's hash4). */
export function noiseKit(hash4) {
  const unit = (x, y, salt) => hash4(x, y, salt, 0x6c1b) / 4294967296;
  const value = (wx, wy, spacing, salt) => {
    const fx = wx / spacing;
    const fy = wy / spacing;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const ux = tx * tx * (3 - 2 * tx);
    const uy = ty * ty * (3 - 2 * ty);
    const top = unit(x0, y0, salt) * (1 - ux) + unit(x0 + 1, y0, salt) * ux;
    const bottom =
      unit(x0, y0 + 1, salt) * (1 - ux) + unit(x0 + 1, y0 + 1, salt) * ux;
    return top * (1 - uy) + bottom * uy;
  };
  const fbm = (wx, wy, spacing, salt, octaves = 3) => {
    let sum = 0;
    let norm = 0;
    let amp = 1;
    let sp = spacing;
    for (let k = 0; k < octaves; k += 1) {
      sum += amp * value(wx, wy, sp, salt + 31 * k);
      norm += amp;
      amp *= 0.5;
      sp /= 2.1;
    }
    return sum / norm;
  };
  return { unit, value, fbm };
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(
  (v) => (v + 0.5) / 16 - 0.5,
);
const bayer = (wx, wy) => BAYER4[(wy & 3) * 4 + (wx & 3)];

/**
 * Patch bombing: the world cut into warped Voronoi regions about `spacing`
 * px across; each region reads one of `images` at its own offset. Tileable
 * images use a random offset; takes that do not tile (`centred`) are read
 * round their middle, so a region never reaches a take's edge. Returns the
 * source pixel index (image, offset into its data).
 */
export function patchBomber(N, images, { spacing, warp, salt, centred }) {
  return (wx, wy) => {
    const qx = wx + warp * (N.fbm(wx, wy, 46, salt + 1, 2) * 2 - 1);
    const qy = wy + warp * (N.fbm(wx, wy, 46, salt + 2, 2) * 2 - 1);
    const gx = Math.floor(qx / spacing);
    const gy = Math.floor(qy / spacing);
    let best = Infinity;
    let bx = 0;
    let by = 0;
    let sx = 0;
    let sy = 0;
    for (let dy = -1; dy <= 1; dy += 1)
      for (let dx = -1; dx <= 1; dx += 1) {
        const cx = gx + dx;
        const cy = gy + dy;
        const px =
          (cx + 0.5 + (N.unit(cx, cy, salt + 3) - 0.5) * 0.8) * spacing;
        const py =
          (cy + 0.5 + (N.unit(cx, cy, salt + 4) - 0.5) * 0.8) * spacing;
        const d = Math.hypot(qx - px, qy - py);
        if (d < best) {
          best = d;
          bx = cx;
          by = cy;
          sx = px;
          sy = py;
        }
      }
    const pick = Math.floor(N.unit(bx, by, salt + 5) * images.length);
    const img = images[pick];
    let tx;
    let ty;
    if (centred) {
      const slackX = Math.max(0, img.width / 2 - spacing * 1.05);
      const slackY = Math.max(0, img.height / 2 - spacing * 1.05);
      tx = Math.round(
        wx - sx + img.width / 2 + (N.unit(bx, by, salt + 6) - 0.5) * 2 * slackX,
      );
      ty = Math.round(
        wy -
          sy +
          img.height / 2 +
          (N.unit(bx, by, salt + 7) - 0.5) * 2 * slackY,
      );
      tx = Math.min(img.width - 1, Math.max(0, tx));
      ty = Math.min(img.height - 1, Math.max(0, ty));
    } else {
      tx = modulo(
        wx + Math.floor(N.unit(bx, by, salt + 6) * img.width),
        img.width,
      );
      ty = modulo(
        wy + Math.floor(N.unit(bx, by, salt + 7) * img.height),
        img.height,
      );
    }
    return { img, s: (ty * img.width + tx) * 4 };
  };
}

/** Per ground: the two drift tints (darker/cooler, lighter/warmer), multipliers. */
const DRIFT = {
  grass: { low: [0.9, 0.95, 1.0], high: [1.05, 1.05, 0.9] },
  badlands: { low: [0.9, 0.88, 0.9], high: [1.07, 1.03, 0.92] },
  sand: { low: [0.95, 0.93, 0.9], high: [1.03, 1.03, 1.05] },
};
const DEFAULT_DRIFT = { low: [0.94, 0.94, 0.95], high: [1.04, 1.04, 1.03] };

/**
 * Two scales of soft colour drift (about 6 cells and 1.3 cells), cut into
 * three palettes with a dithered single-pixel edge: never a gradient.
 * Returns -1, 0 or 1.
 */
export function driftLevel(N, wx, wy, salt) {
  // Rotated and warped, so no contour runs along the noise lattice.
  const wx2 = wx + 60 * (N.value(wx, wy, 90, salt + 21) - 0.5);
  const wy2 = wy + 60 * (N.value(wx, wy, 90, salt + 22) - 0.5);
  const rx = 0.83 * wx2 - 0.56 * wy2;
  const ry = 0.56 * wx2 + 0.83 * wy2;
  const v =
    0.6 * N.fbm(rx, ry, 470, salt, 3) +
    0.4 * N.fbm(wy2, -wx2, 110, salt + 9, 2);
  const d = v + bayer(wx, wy) * 0.03;
  return d < 0.44 ? -1 : d > 0.56 ? 1 : 0;
}

/** A fine 2-4 px mottle, -1, 0 or 1. */
export function mottleLevel(N, wx, wy, salt) {
  const v =
    0.6 * N.value(wx, wy, 3.3, salt) + 0.4 * N.value(wx, wy, 7.5, salt + 3);
  return v < 0.33 ? -1 : v > 0.67 ? 1 : 0;
}

function tintPixel(out, o, t, k = 1) {
  for (let c = 0; c < 3; c += 1) out[o + c] = out[o + c] * (1 + (t[c] - 1) * k);
}

// ----------------------------------------------------------- detail overlay

const OVERLAY_PERIOD = 720; // 9 cells: with the 5 or 8 cell bases, 45 or 72 cells

function put(img, x, y, rgb) {
  const px = modulo(x, img.width);
  const py = modulo(y, img.height);
  img.data.set([rgb[0], rgb[1], rgb[2], 255], (py * img.width + px) * 4);
}

const shadeOf = (rgb, k) =>
  rgb.map((c) => Math.max(0, Math.min(255, Math.round(c * k))));

/**
 * A detail overlay drawn in code, tileable at OVERLAY_PERIOD: grass tufts
 * and clover, pebbles and cracks, or ripple dashes and tiny stones. Lit
 * from the bottom left (ART_DIRECTION: sun at the bottom left), so a
 * pebble's light pixel is at its lower left and its shade at its upper
 * right. `base` is the ground's mean colour. Details keep 14 px off cell
 * centres when tall (tufts), as the ground rule asks.
 */
export function detailOverlay(N, ground, base, salt) {
  const size = OVERLAY_PERIOD;
  const img = {
    width: size,
    height: size,
    data: new Uint8ClampedArray(size * size * 4),
  };
  const step = ground === "grass" ? 11 : ground === "badlands" ? 13 : 15;
  const dark = shadeOf(base, 0.72);
  const darker = shadeOf(base, 0.58);
  const light = shadeOf(base, 1.18);
  const lighter = shadeOf(base, 1.32);
  for (let gy = 0; gy < size / step; gy += 1)
    for (let gx = 0; gx < size / step; gx += 1) {
      const r = N.unit(gx, gy, salt);
      const x = Math.floor((gx + N.unit(gx, gy, salt + 1)) * step);
      const y = Math.floor((gy + N.unit(gx, gy, salt + 2)) * step);
      const near =
        Math.hypot(modulo(x, CELL) - CELL / 2, modulo(y, CELL) - CELL / 2) < 14;
      // Details gather in loose clumps: a slow noise thins them out.
      const clump = N.value(x, y, 60, salt + 3);
      if (r > 0.25 + 0.9 * clump) continue;
      const kind = N.unit(gx, gy, salt + 4);
      if (ground === "grass") {
        if (kind < 0.55 && !near) {
          // A tuft: 3-5 blades fanning up from one root, dark at the root.
          const blades = 3 + Math.floor(N.unit(gx, gy, salt + 5) * 3);
          for (let b = 0; b < blades; b += 1) {
            const lean = b - (blades - 1) / 2;
            const tall = 3 + Math.floor(N.unit(gx + b, gy, salt + 6) * 3);
            const tipLit = N.unit(gx + b, gy, salt + 7) < 0.45;
            for (let k = 0; k < tall; k += 1) {
              const px = x + Math.round(lean * (k / tall) * 1.4);
              put(
                img,
                px,
                y - k,
                k === tall - 1 && tipLit ? light : k === 0 ? darker : dark,
              );
            }
          }
          put(img, x - 1, y + 1, darker);
          put(img, x + 1, y + 1, darker);
        } else if (kind < 0.85) {
          // Clover: a dark 2 x 2 leaf pair with a light pixel.
          put(img, x, y, dark);
          put(img, x + 1, y, dark);
          put(img, x, y + 1, darker);
          put(img, x + 1, y - 1, light);
        } else {
          // A flower speck, white or yellow, with a dark stem pixel.
          if (kind < 0.94) {
            put(img, x, y, lighter);
            put(img, x + 1, y + 1, light);
            continue;
          }
          put(img, x, y, kind < 0.97 ? [246, 240, 214] : [240, 214, 90]);
          put(img, x, y + 1, darker);
        }
      } else if (ground === "badlands") {
        if (kind < 0.6) {
          // A pebble: 2-4 px, light lower left, shade upper right.
          const s = 1 + Math.floor(N.unit(gx, gy, salt + 5) * 3);
          const stone =
            N.unit(gx, gy, salt + 8) < 0.5 ? [196, 160, 128] : [150, 136, 124];
          for (let dy = 0; dy < s; dy += 1)
            for (let dx = 0; dx < s + 1; dx += 1)
              put(img, x + dx, y + dy, stone);
          put(img, x, y + s - 1, shadeOf(stone, 1.2));
          put(img, x + s, y - 1, darker);
          put(img, x + s + 1, y, darker);
        } else {
          // A hairline crack: a short wandering dark line.
          let px = x;
          let py = y;
          const len = 4 + Math.floor(N.unit(gx, gy, salt + 5) * 6);
          for (let k = 0; k < len; k += 1) {
            put(img, px, py, darker);
            px += 1;
            if (N.unit(px, py, salt + 9) < 0.45)
              py += N.unit(px, py, salt + 10) < 0.5 ? -1 : 1;
          }
        }
      } else {
        if (kind < 0.7) {
          // A ripple dash: a light crest over a darker trough.
          const len = 4 + Math.floor(N.unit(gx, gy, salt + 5) * 6);
          for (let k = 0; k < len; k += 1) {
            const dy = Math.round(Math.sin((k / len) * Math.PI) * -1);
            put(img, x + k, y + dy, light);
            put(img, x + k, y + dy + 1, dark);
          }
        } else {
          put(img, x, y, darker);
          put(img, x - 1, y + 1, light);
        }
      }
    }
  return img;
}

// ------------------------------------------------------------- transitions

/** Per lower ground: its rim where another ground lies over it. */
const RIM = {
  grass: { line: 0.74, band: 0.9, width: 4 },
  badlands: { line: 0.7, band: 0.86, width: 5 },
  sand: { line: 0.84, band: 1.06, width: 5 },
};
const DEFAULT_RIM = { line: 0.8, band: 0.92, width: 4 };

/**
 * The mask transition: for each higher rank, the signed distance to the
 * smooth field's contour (as groundRankAt) plus a reach driven by the edge
 * brush in [-1, 1], so lobes run both ways. Within the rim width under the
 * cut the lower ground is marked as band.
 */
export function maskRankAt(B, edge, { base = 2, amp = 11 } = {}) {
  return (layout, ranks, wx, wy) => {
    let band;
    for (let k = ranks.length - 1; k >= 1; k -= 1) {
      const rank = ranks[k];
      const values = layout.atLeast[rank];
      const field = B.cellField(
        values,
        layout.width,
        layout.height,
        wx + 0.5,
        wy + 0.5,
      );
      const inside =
        (field.f - B.borderLevel(wx + 0.5, wy + 0.5, rank)) /
        Math.max(1e-4, Math.hypot(field.gx, field.gy));
      const d = inside + base + amp * edge(wx, wy, rank);
      if (d > 0) return band === undefined ? { rank } : { rank, band };
      if (band === undefined && d > -6) band = { over: rank, depth: -d };
    }
    return band === undefined ? { rank: ranks[0] } : { rank: ranks[0], band };
  };
}

/** Recolours a rim pixel of the lower ground under a cut. */
export function rimBand(B) {
  return (info, rank, wx, wy, out, o) => {
    const rim = RIM[B.GROUND_RANK[rank]] ?? DEFAULT_RIM;
    const depth = info.band.depth;
    if (info.band.over === rank) return;
    if (depth < 1.2) tintPixel(out, o, [rim.line, rim.line, rim.line]);
    else if (depth + bayer(wx, wy) * 2 < rim.width)
      tintPixel(out, o, [rim.band, rim.band, rim.band]);
  };
}

/**
 * The edge brush: a generated moss-on-stone mask (luminance, bombed so it
 * never repeats) mixed with a slow noise for the big lobes. In [-1, 1].
 */
export function brushEdge(N, brushImages, salt) {
  const lumas = brushImages.map((img) => {
    const l = new Float32Array(img.width * img.height);
    let lo = Infinity;
    let hi = -Infinity;
    for (let p = 0; p < l.length; p += 1) {
      l[p] = luma(img.data[p * 4], img.data[p * 4 + 1], img.data[p * 4 + 2]);
      lo = Math.min(lo, l[p]);
      hi = Math.max(hi, l[p]);
    }
    let mean = 0;
    for (let p = 0; p < l.length; p += 1) {
      l[p] = ((l[p] - lo) / Math.max(1, hi - lo)) * 2 - 1;
      mean += l[p] / l.length;
    }
    // Centred, so the mask moves the border both ways as much.
    for (let p = 0; p < l.length; p += 1) l[p] -= mean;
    return { width: img.width, height: img.height, l };
  });
  const spacing = Math.min(
    150,
    ...lumas.map((m) => Math.floor(Math.min(m.width, m.height) / 2 / 1.12)),
  );
  const bomb = patchBomber(N, lumas, {
    spacing,
    warp: 10,
    salt,
    centred: true,
  });
  return (wx, wy, rank) => {
    const { img, s } = bomb(wx + 37 * rank, wy + 53 * rank);
    const b = img.l[s >> 2];
    const slow = (N.fbm(wx, wy, 52, salt + 40 + rank, 2) - 0.5) * 3.2;
    return Math.max(-1.4, Math.min(1.4, 0.5 * b + 0.7 * slow));
  };
}

/**
 * A procedural edge with no generated mask: big lobes (about 50 px), mid
 * bites (14 px) and fine specks (4 px), roughly in [-1, 1].
 */
export function noiseEdge(N, salt) {
  return (wx, wy, rank) => {
    const big = (N.fbm(wx, wy, 52, salt + rank, 2) - 0.5) * 3.2;
    const mid = (N.value(wx, wy, 14, salt + 7 + rank) - 0.5) * 1.4;
    const fine = (N.value(wx, wy, 4, salt + 11 + rank) - 0.5) * 0.7;
    return Math.max(-1.4, Math.min(1.4, 0.75 * big + mid + fine));
  };
}

// ------------------------------------------------------------------ models

/**
 * A texel function: `bomb` (optional patch bombing per rank) or the plain
 * tile, then the drift palettes (`drift` strength), the fine mottle
 * (`mottle` strength) and the detail overlay (`overlays` per rank).
 */
export function layeredTexel(
  B,
  N,
  { tiles, bombs, drift = 0, mottle = 0, overlays, patches },
) {
  return (rank, wx, wy, out, o) => {
    const ground = B.GROUND_RANK[rank];
    let shownRank = rank;
    let shownGround = ground;
    if (patches !== undefined) {
      const p = patches(wx, wy, ground);
      if (p !== undefined) {
        shownGround = p.ground;
        shownRank = B.GROUND_RANK.indexOf(p.ground);
      }
    }
    const bomb = bombs?.[shownGround];
    if (bomb !== undefined) {
      const { img, s } = bomb(wx, wy);
      out[o] = img.data[s];
      out[o + 1] = img.data[s + 1];
      out[o + 2] = img.data[s + 2];
      out[o + 3] = 255;
    } else {
      const img = tiles[shownGround];
      const s =
        (modulo(wy, img.height) * img.width + modulo(wx, img.width)) * 4;
      out[o] = img.data[s];
      out[o + 1] = img.data[s + 1];
      out[o + 2] = img.data[s + 2];
      out[o + 3] = 255;
    }
    if (shownRank !== rank) {
      // A trodden patch: the patch ground dulled toward a dusty tan.
      const l = luma(out[o], out[o + 1], out[o + 2]);
      for (let c = 0; c < 3; c += 1)
        out[o + c] = out[o + c] + (l - out[o + c]) * 0.4;
      tintPixel(out, o, [1.0, 0.94, 0.84]);
    }
    if (drift > 0) {
      const level = driftLevel(N, wx, wy, 300 + shownRank);
      const t = DRIFT[shownGround] ?? DEFAULT_DRIFT;
      if (level < 0) tintPixel(out, o, t.low, drift);
      else if (level > 0) tintPixel(out, o, t.high, drift);
    }
    if (mottle > 0) {
      const level = mottleLevel(N, wx, wy, 500 + shownRank);
      if (level !== 0) {
        const k = 1 + level * mottle;
        tintPixel(out, o, [k, k, k]);
      }
    }
    const over = overlays?.[shownGround];
    if (over !== undefined) {
      const s =
        (modulo(wy, over.height) * over.width + modulo(wx, over.width)) * 4;
      if (over.data[s + 3] > 0) {
        out[o] = over.data[s];
        out[o + 1] = over.data[s + 1];
        out[o + 2] = over.data[s + 2];
      }
    }
  };
}

/**
 * Ground patches under objects (Heroes III: a site stands in its own patch
 * of trodden earth): an ellipse round each footprint, its edge cut by the
 * brush. Returns the patch ground at (wx, wy) or undefined.
 */
export function objectPatches(N, edge, sites) {
  return (wx, wy, ground) => {
    for (const site of sites) {
      const dx = (wx - site.cx) / site.rx;
      const dy = (wy - site.cy) / site.ry;
      const d = Math.hypot(dx, dy);
      if (d > 1.6) continue;
      if (d < 1 + 0.22 * edge(wx, wy, 9))
        return { ground: site.patch?.[ground] ?? "badlands" };
    }
    return undefined;
  };
}

function stats(img) {
  const n = img.width * img.height;
  const mean = [0, 0, 0];
  for (let p = 0; p < n; p += 1)
    for (let c = 0; c < 3; c += 1) mean[c] += img.data[p * 4 + c] / n;
  let v = 0;
  const ml = luma(mean[0], mean[1], mean[2]);
  for (let p = 0; p < n; p += 1) {
    const l =
      luma(img.data[p * 4], img.data[p * 4 + 1], img.data[p * 4 + 2]) - ml;
    v += (l * l) / n;
  }
  return { mean, std: Math.sqrt(v) };
}

/**
 * A take recoloured to a game ground's palette: the take's structure (its
 * tufts, pebbles and patches) kept, its mean colour moved to the game
 * texture's and its contrast scaled to `gain` times the game texture's
 * (capped at the take's own). So a PixelLab take keeps the ground's
 * identity colour (ART_DIRECTION section 5) whatever hue the model drew.
 */
export function matchTake(img, ref, gain) {
  const a = stats(img);
  const b = stats(ref);
  const k = Math.min(1, (b.std * gain) / Math.max(1, a.std));
  const out = {
    width: img.width,
    height: img.height,
    data: new Uint8ClampedArray(img.data.length),
  };
  for (let p = 0; p < img.width * img.height; p += 1) {
    for (let c = 0; c < 3; c += 1)
      out.data[p * 4 + c] = b.mean[c] + (img.data[p * 4 + c] - a.mean[c]) * k;
    out.data[p * 4 + 3] = 255;
  }
  return out;
}

/** The mean colour of an image (for the overlay palettes). */
export function meanColour(img) {
  const sum = [0, 0, 0];
  const n = img.width * img.height;
  for (let p = 0; p < n; p += 1)
    for (let c = 0; c < 3; c += 1) sum[c] += img.data[p * 4 + c];
  return sum.map((v) => Math.round(v / n));
}
