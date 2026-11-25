/**
 * Plain-text dump of a map for eyeballing generator output and debugging.
 *
 * Each cell prints as two characters so the map looks roughly square in a
 * terminal. Legend: {@link ASCII_LEGEND}.
 */
import type { GameMap, MapObject } from "./types.ts";

export const ASCII_LEGEND = [
  "g grass  j jungle  s steppe  b badlands  w wasteland",
  "~ shallow water  = deep water  ^ mountain  T forest  # road",
  "@ player town  o open start  n neutral town  & Warlord's Hold",
  "h hero start  X monster",
  "mines: W sawmill  O ore pit  E essence spring  G gold mine",
  "pickups: l wood (logs)  r ore (rocks)  c essence (crystals)  $ gold  * chest",
  "D dwelling  % site  B bank  A artifact  _ buried  | gate  t waystone",
  "P prop (impassable decoration)",
].join("\n");

const TERRAIN_CHAR: Record<string, string> = {
  grass: "g",
  jungle: "j",
  steppe: "s",
  badlands: "b",
  wasteland: "w",
};

const MINE_CHAR: Record<string, string> = {
  wood: "W",
  ore: "O",
  essence: "E",
  gold: "G",
};

const PICKUP_CHAR: Record<string, string> = {
  wood: "l",
  ore: "r",
  essence: "c",
  gold: "$",
};

function objectChar(o: MapObject): string {
  switch (o.kind) {
    case "town":
      if (o.data["owner"] !== null) return "@";
      if (o.data["hold"] !== false) return "&";
      return o.data["start"] !== undefined ? "o" : "n";
    case "hero-start":
      return "h";
    case "monster":
      return "X";
    case "mine":
      return MINE_CHAR[String(o.data["resource"])] ?? "M";
    case "pickup":
      return o.data["chest"] === true
        ? "*"
        : (PICKUP_CHAR[String(o.data["resource"])] ?? "?");
    case "dwelling":
      return "D";
    case "site":
      return "%";
    case "bank":
      return "B";
    case "artifact":
      return "A";
    case "buried":
      return "_";
    case "gate":
      return "|";
    case "teleport":
      return "t";
  }
}

export interface AsciiOptions {
  /** Draw objects over the ground (default true). */
  objects?: boolean;
  /** Draw zone ids instead of terrain letters on open ground. */
  zones?: boolean;
  /** Print open ground as "." instead of terrain letters (shapes only). */
  shapes?: boolean;
  /** Characters per cell (1 or 2, default 2). */
  cellWidth?: 1 | 2;
}

export function mapToAscii(map: GameMap, options: AsciiOptions = {}): string {
  const {
    objects = true,
    zones = false,
    shapes = false,
    cellWidth = 2,
  } = options;
  const grid: string[][] = [];
  for (let y = 0; y < map.height; y++) {
    const row: string[] = [];
    for (let x = 0; x < map.width; x++) {
      const i = y * map.width + x;
      const c = map.cells[i];
      let ch = "?";
      let fill = " ";
      if (c) {
        if (c.terrain === "water") {
          ch = c.deep === true ? "=" : "~";
          fill = ch;
        } else if (c.obstacle === "mountain") {
          ch = "^";
          fill = "^";
        } else if (c.obstacle === "forest") {
          ch = "T";
          fill = "T";
        } else if (c.prop === true) {
          ch = "P";
          fill = "P";
        } else if (c.road) {
          ch = "#";
          fill = " ";
        } else if (shapes) {
          ch = ".";
        } else if (zones && map.zones) {
          ch = String((map.zones[i] ?? 0) % 10);
        } else {
          ch = TERRAIN_CHAR[c.terrain] ?? "?";
        }
      }
      row.push(cellWidth === 2 ? ch + fill : ch);
    }
    grid.push(row);
  }
  if (objects) {
    for (const o of map.objects) {
      const ch = objectChar(o);
      for (const [x, y] of o.blocked) {
        const row = grid[y];
        if (row) row[x] = cellWidth === 2 ? ch + ch : ch;
      }
      const row = grid[o.y];
      if (row) row[o.x] = cellWidth === 2 ? ch + " " : ch;
    }
  }
  return grid.map((r) => r.join("").trimEnd()).join("\n");
}
