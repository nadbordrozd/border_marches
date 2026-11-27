// The ground lab's painter (bead bzc.127): src/render/map/ground.ts
// paintGround with two hooks, so each experiment changes only what it is
// about. `model.texel(rank, wx, wy, out, o)` writes a ground's colour at a
// world pixel; `model.rankAt(layout, ranks, wx, wy)` says which ground shows
// where grounds meet (and whether a transition band lies there). With
// CURRENT_MODEL it reproduces paintGround byte for byte (checked on every
// run), so every difference on the sheets comes from the experiment.

const CELL = 80;
// ground.ts SHELF.reach (not exported).
const SHELF_REACH = 27;
// ground.ts FOREST_SHADE (not exported).
const FOREST_SHADE = {
  grass: [22, 58, 38],
  jungle: [14, 46, 34],
  steppe: [74, 60, 22],
  badlands: [72, 32, 20],
  wasteland: [34, 30, 28],
  volcanic: [26, 20, 20],
  snow: [60, 78, 96],
  sand: [120, 88, 44],
  frosting: [150, 70, 110],
};

const modulo = (value, by) => ((value % by) + by) % by;

/** Samples a tileable image at world pixel (wx, wy) modulo its size. */
export function sampleTile(img, wx, wy, out, o) {
  const s = (modulo(wy, img.height) * img.width + modulo(wx, img.width)) * 4;
  out[o] = img.data[s];
  out[o + 1] = img.data[s + 1];
  out[o + 2] = img.data[s + 2];
  out[o + 3] = 255;
}

/** The game's own textures and transition: what paintGround draws. */
export function currentModel(B, textures) {
  const list = B.GROUND_RANK.map((g) => textures[g]);
  return {
    name: "current",
    texel: (rank, wx, wy, out, o) => sampleTile(list[rank], wx, wy, out, o),
    rankAt: (layout, ranks, wx, wy) => ({
      rank: B.groundRankAt(
        layout.atLeast,
        layout.width,
        layout.height,
        ranks,
        wx,
        wy,
      ),
    }),
  };
}

/**
 * paintGround (src/render/map/ground.ts) with the model's hooks. The water,
 * shelf, coast, forest shade and roads are the game's. `model.band(info,
 * rank, wx, wy, out, o)` (optional) recolours a transition band pixel;
 * `model.after(rank, wx, wy, out, o)` (optional) runs after the ground
 * texel, before the coast, shade and road.
 */
export function paintLab(B, layout, sources, model, x0, y0, w, h, out) {
  const cx0 = Math.max(0, Math.floor(x0 / CELL));
  const cy0 = Math.max(0, Math.floor(y0 / CELL));
  const cx1 = Math.min(layout.width - 1, Math.floor((x0 + w - 1) / CELL));
  const cy1 = Math.min(layout.height - 1, Math.floor((y0 + h - 1) / CELL));
  const WATER = B.GROUND_RANK.length;
  const put = (o, c) => {
    out[o] = c[0];
    out[o + 1] = c[1];
    out[o + 2] = c[2];
    out[o + 3] = 255;
  };
  const blend = (o, c, a) => {
    out[o] = out[o] + (c[0] - out[o]) * a;
    out[o + 1] = out[o + 1] + (c[1] - out[o + 1]) * a;
    out[o + 2] = out[o + 2] + (c[2] - out[o + 2]) * a;
  };
  for (let cy = cy0; cy <= cy1; cy += 1)
    for (let cx = cx0; cx <= cx1; cx += 1) {
      const i = cy * layout.width + cx;
      const kind = layout.kind[i];
      const ox = cx * CELL;
      const oy = cy * CELL;
      const lx0 = Math.max(0, x0 - ox);
      const ly0 = Math.max(0, y0 - oy);
      const lx1 = Math.min(CELL, x0 + w - ox);
      const ly1 = Math.min(CELL, y0 + h - oy);
      const coastBits = layout.coast[i];
      const depthBits = layout.depth[i];
      const wooded = layout.canopy?.near[i] === 1;
      const ranks = layout.ranks[i] ?? [];
      const links = layout.roads[i] ?? [];
      const water = kind === WATER;
      const deep = layout.deep[i] === 1;
      const v = layout.variant[i] % 2;
      const shallowTile =
        sources.water.shallow[v % sources.water.shallow.length];
      const deepTile = sources.water.deep[v % sources.water.deep.length];
      const shade = water ? undefined : FOREST_SHADE[B.GROUND_RANK[kind]];
      for (let ly = ly0; ly < ly1; ly += 1)
        for (let lx = lx0; lx < lx1; lx += 1) {
          const wx = ox + lx;
          const wy = oy + ly;
          const o = ((wy - y0) * w + (wx - x0)) * 4;
          let land = !water;
          let shore = Infinity;
          if (coastBits !== 0) {
            const field = B.cellField(
              layout.land,
              layout.width,
              layout.height,
              wx + 0.5,
              wy + 0.5,
            );
            const t = B.coastThreshold(wx + 0.5, wy + 0.5);
            land = field.f > t;
            shore =
              Math.abs(field.f - t) /
              Math.max(1e-4, Math.hypot(field.gx, field.gy));
          }
          if (!land) {
            const tile = deep && water ? deepTile : shallowTile;
            sampleTile(tile, lx, ly, out, o);
            if (water && (depthBits !== 0 || (deep && coastBits !== 0))) {
              const field = B.cellField(
                layout.deep,
                layout.width,
                layout.height,
                wx + 0.5,
                wy + 0.5,
              );
              const signed =
                (0.5 - field.f) /
                Math.max(1e-4, Math.hypot(field.gx, field.gy));
              if (Math.abs(signed) <= SHELF_REACH) {
                const share = B.waterDepthShare(signed, wx + 0.5, wy + 0.5);
                const s = (ly * shallowTile.width + lx) * 4;
                const t = (ly * deepTile.width + lx) * 4;
                for (let c = 0; c < 3; c += 1)
                  out[o + c] =
                    shallowTile.data[s + c] * (1 - share) +
                    deepTile.data[t + c] * share;
              }
            }
            if (coastBits !== 0) {
              const k = B.coastAt(false, shore, wx + 0.5, wy + 0.5);
              if (k === "wet") put(o, B.COAST.wet);
              else if (k === "surf") blend(o, B.COAST.surf, B.COAST.surfAlpha);
              else if (k === "foam") blend(o, B.COAST.foam, B.COAST.foamAlpha);
            }
          } else {
            let rank;
            let info;
            if (ranks.length > 1) {
              info = model.rankAt(layout, ranks, wx, wy);
              rank = info.rank;
            } else rank = water ? (ranks[0] ?? 0) : kind;
            model.texel(rank, wx, wy, out, o);
            if (info?.band !== undefined && model.band !== undefined)
              model.band(info, rank, wx, wy, out, o);
            if (model.after !== undefined) model.after(rank, wx, wy, out, o);
            if (coastBits !== 0) {
              const k = B.coastAt(true, shore, wx + 0.5, wy + 0.5);
              if (k === "sand") put(o, B.COAST.sand);
              else if (k === "wet") put(o, B.COAST.wet);
              else if (k === "lip") put(o, B.COAST.lip);
            }
            if (wooded && shade !== undefined && layout.canopy !== undefined) {
              const alpha = B.canopyTint(layout.canopy, wx, wy);
              if (alpha > 0) blend(o, shade, alpha);
            }
          }
          if (links.length > 0) {
            const r = B.roadPixelAt(links, wx, wy);
            if (r !== B.ROAD_PIXEL.CLEAR) put(o, B.ROAD_COLOURS[r]);
          }
        }
    }
}
