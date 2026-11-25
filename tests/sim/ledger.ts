/**
 * Day ledgers for ECONOMY.md section 8 (the simulation tier; never part of
 * `npx vitest run`): the week 1 build-and-recruit paths of 8.2 and the
 * tier 6 dates of 8.3, computed from the current building and creature
 * data so they can be refreshed after a price change.
 *
 *   node tests/sim/run.mjs ./tests/sim/ledger.ts [--price id=gold,...]
 *
 * The assumptions are ECONOMY.md 8's: the same start region for every
 * faction (pickups below; Sawmill flagged day 2, Ore Pit day 4, Essence
 * Spring day 5, a second Sawmill day 8, a Gold Mine day 9); income at each
 * day's start from day 2 (a mine pays from the day after its flag); one
 * building a day, then recruits; no trading. `--price squire=55,...`
 * overrides creature gold prices (to check the ledger against the
 * documented old numbers).
 */
import { CREATURES } from "../../src/data/creatures.ts";
import { STARTING_RESOURCES, MINES, CHEST } from "../../src/data/economy.ts";
import { rosterOf } from "../../src/data/factionCreatures.ts";
import {
  CHURCHYARD_TREE,
  REALM_TREE,
  WARCAMP_TREE,
} from "../../src/data/factionTowns.ts";
import type { TreeData } from "../../src/data/factionTowns.ts";
import type { CreatureDef, ResourceAmounts } from "../../src/data/types.ts";
import { creatureFightValue } from "../../src/core/battle/damage.ts";

type Res = { gold: number; wood: number; ore: number; essence: number };
const KEYS = ["gold", "wood", "ore", "essence"] as const;

const FACTIONS = [
  { id: "humans", name: "Realm", tree: REALM_TREE },
  { id: "undead", name: "Restless", tree: CHURCHYARD_TREE },
  { id: "goblins", name: "Horde", tree: WARCAMP_TREE },
] as const;

/** Week 1 pickups by day (ECONOMY 8.2). */
const WEEK1: Readonly<Record<number, Partial<Res>>> = {
  1: { wood: 7, gold: 500 },
  2: { gold: 600 },
  3: { essence: 3, wood: 6 },
  4: { ore: 4, gold: CHEST.gold },
  6: { wood: 8 },
  7: { gold: 400 },
};

/**
 * From week 2, each week (ECONOMY 8 header): two gold piles (500), a chest
 * as gold, a wood pile (7), an ore pile (4) and essence crystals (3), on
 * the week's days 1 to 5.
 */
const LATER: Readonly<Record<number, Partial<Res>>> = {
  1: { gold: 500 },
  2: { wood: 7 },
  3: { gold: 500, ore: 4 },
  4: { gold: CHEST.gold },
  5: { essence: 3 },
};

interface Mine {
  readonly day: number;
  readonly kind: keyof typeof MINES;
}

const MINE_DAYS: readonly Mine[] = [
  { day: 2, kind: "wood" },
  { day: 4, kind: "ore" },
  { day: 5, kind: "essence" },
  { day: 8, kind: "wood" },
  { day: 9, kind: "gold" },
];

function pickupsOn(day: number): Partial<Res> {
  if (day <= 7) return WEEK1[day] ?? {};
  return LATER[((day - 1) % 7) + 1] ?? {};
}

function afford(r: Res, c: ResourceAmounts, n = 1): boolean {
  return KEYS.every((k) => r[k] >= (c[k] ?? 0) * n);
}

function pay(r: Res, c: ResourceAmounts, n = 1): void {
  for (const k of KEYS) r[k] -= (c[k] ?? 0) * n;
}

/** The dwelling of tier `t` (1-based) of a faction. */
function dwellingOf(tree: TreeData, creature: string): string {
  for (const id of tree.order)
    if (tree.buildings[id]?.dwelling === creature) return id;
  throw new Error(`no dwelling for ${creature}`);
}

/** Every prerequisite of `id` first, in tree order (a build chain). */
function chainTo(tree: TreeData, id: string, built: Set<string>): string[] {
  const out: string[] = [];
  const visit = (x: string): void => {
    if (built.has(x) || out.includes(x)) return;
    const def = tree.buildings[x];
    if (def === undefined) throw new Error(`no building ${x}`);
    for (const r of def.requires) visit(r);
    out.push(x);
  };
  visit(id);
  return out;
}

interface Options {
  /** Build order: building ids or t<tier> (that tier's dwelling). */
  readonly path: readonly string[];
  /** Recruit on day d? */
  readonly recruit: (day: number) => boolean;
  readonly days: number;
  readonly noSpring?: boolean;
  /** Stop when the first tier 6 creature is recruited. */
  readonly untilTier6?: boolean;
  readonly prices: ReadonlyMap<string, number>;
}

interface DayRow {
  day: number;
  pickups: string;
  build: string;
  recruit: string;
  res: Res;
}

interface Run {
  rows: DayRow[];
  goldIn: number;
  buildings: number;
  creatures: number;
  fv: number;
  /** Day the tier 6 dwelling stood and the first tier 6 was recruited. */
  t6Dwelling: number | null;
  t6Creature: number | null;
  waits: string[];
}

function costOf(def: CreatureDef, prices: ReadonlyMap<string, number>) {
  const gold = prices.get(def.id);
  return gold === undefined ? def.cost : { ...def.cost, gold };
}

function run(faction: (typeof FACTIONS)[number], o: Options): Run {
  const tree = faction.tree;
  const roster = rosterOf(faction.id);
  const r: Res = { ...STARTING_RESOURCES } as Res;
  const built = new Set(
    tree.order.filter((id) => tree.buildings[id]?.startBuilt === true),
  );
  const stock = new Map<string, number>();
  for (const c of roster)
    if (built.has(dwellingOf(tree, c.id))) stock.set(c.id, c.growth);
  const path = o.path.map((p) =>
    /^t\d$/.test(p) ? dwellingOf(tree, roster[Number(p[1]) - 1]!.id) : p,
  );
  const tier6 = roster[5] as CreatureDef;
  const t6Id = dwellingOf(tree, tier6.id);
  const out: Run = {
    rows: [],
    goldIn: r.gold,
    buildings: 0,
    creatures: 0,
    fv: 0,
    t6Dwelling: null,
    t6Creature: null,
    waits: [],
  };
  let next = 0;
  for (let day = 1; day <= o.days; day++) {
    if (day > 1) {
      const hall = Math.max(
        ...[...built].map((id) => tree.buildings[id]?.hallIncome ?? 0),
      );
      r.gold += hall;
      out.goldIn += hall;
      for (const m of MINE_DAYS) {
        if (m.day >= day) continue;
        if (o.noSpring === true && m.kind === "essence") continue;
        const def = MINES[m.kind];
        r[def.resource as keyof Res] += def.income;
        if (def.resource === "gold") out.goldIn += def.income;
      }
      if (day % 7 === 1)
        for (const c of roster)
          if (built.has(dwellingOf(tree, c.id)))
            stock.set(c.id, (stock.get(c.id) ?? 0) + c.growth);
    }
    const pk = pickupsOn(day);
    for (const k of KEYS) r[k] += pk[k] ?? 0;
    out.goldIn += pk.gold ?? 0;
    const row: DayRow = {
      day,
      pickups: KEYS.filter((k) => pk[k] !== undefined)
        .map((k) => `${k} ${pk[k]}`)
        .join(", "),
      build: "-",
      recruit: "-",
      res: r,
    };
    // One building a day, in path order, when affordable.
    const want = path[next];
    if (want !== undefined) {
      const def = tree.buildings[want];
      if (def === undefined) throw new Error(`no building ${want}`);
      const ready = def.requires.every((x) => built.has(x));
      if (ready && afford(r, def.cost)) {
        pay(r, def.cost);
        out.buildings += def.cost.gold ?? 0;
        built.add(want);
        next++;
        row.build = def.name;
        if (def.dwelling !== undefined)
          stock.set(
            def.dwelling,
            (stock.get(def.dwelling) ?? 0) +
              (CREATURES[def.dwelling as keyof typeof CREATURES]?.growth ?? 0),
          );
        if (want === t6Id) out.t6Dwelling = day;
      } else out.waits.push(`day ${day}: ${def.name}`);
    }
    // Recruit, highest tier first (tier 6 always, to date it).
    const bought: string[] = [];
    for (const c of [...roster].reverse()) {
      const isT6 = c.id === tier6.id;
      if (!o.recruit(day) && !isT6) continue;
      const have = stock.get(c.id) ?? 0;
      const cost = costOf(c, o.prices);
      let n = 0;
      while (n < have && afford(r, cost, n + 1)) n++;
      if (isT6 && !o.recruit(day)) n = Math.min(n, 1);
      if (n <= 0) continue;
      pay(r, cost, n);
      stock.set(c.id, have - n);
      out.creatures += (cost.gold ?? 0) * n;
      out.fv += n * creatureFightValue(c);
      bought.push(`${n} ${c.name}`);
      if (isT6 && out.t6Creature === null) out.t6Creature = day;
    }
    if (bought.length > 0) row.recruit = bought.join(", ");
    row.res = { ...r };
    out.rows.push(row);
    if (o.untilTier6 === true && out.t6Creature !== null) break;
  }
  return out;
}

function table(name: string, x: Run): void {
  console.log(`\n**${name}**\n`);
  console.log(
    "| Day | Pickups and mines | Build | Recruit | Gold | Wood | Ore | Essence |",
  );
  console.log("| --: | --- | --- | --- | --: | --: | --: | --: |");
  for (const row of x.rows) {
    const mines = MINE_DAYS.filter((m) => m.day === row.day)
      .map((m) => `flag ${MINES[m.kind].name}`)
      .join(", ");
    const pk = [row.pickups, mines].filter((s) => s !== "").join(", ");
    console.log(
      `| ${row.day} | ${pk === "" ? "-" : pk} | ${row.build} | ${row.recruit} | ${row.res.gold} | ${row.res.wood} | ${row.res.ore} | ${row.res.essence} |`,
    );
  }
  console.log(
    `\ngold in ${x.goldIn}, buildings ${x.buildings}, creatures ${x.creatures}, army FV ${x.fv}${x.waits.length > 0 ? `, waits: ${x.waits.join("; ")}` : ""}`,
  );
}

/** ECONOMY 8.2's week 1 paths. */
const WEEK1_PATHS: Readonly<Record<string, readonly string[]>> = {
  humans: ["town-hall", "t2", "fort-1", "t3", "t4", "marketplace"],
  undead: ["town-hall", "t2", "fort-1", "t3", "marketplace", "t4"],
  goblins: ["town-hall", "t2", "fort-1", "t3", "marketplace", "t4"],
};

export function main(args: readonly string[]): number {
  const prices = new Map<string, number>();
  const i = args.indexOf("--price");
  if (i >= 0)
    for (const kv of (args[i + 1] ?? "").split(",")) {
      const [id, v] = kv.split("=");
      if (id !== undefined && v !== undefined) prices.set(id, Number(v));
    }
  console.log("## 8.2 Week 1");
  for (const f of FACTIONS)
    table(
      f.name,
      run(f, {
        path: WEEK1_PATHS[f.id] as readonly string[],
        recruit: () => true,
        days: 7,
        prices,
      }),
    );
  console.log("\n## 8.3 First tier 6 (dwelling day, creature day)\n");
  const scenarios: [string, Partial<Options>][] = [
    ["Rush: recruit in week 1 only, then save", { recruit: (d) => d <= 7 }],
    ["Recruit everything affordable every day", { recruit: () => true }],
    ["Rush with no essence spring", { recruit: (d) => d <= 7, noSpring: true }],
  ];
  console.log(`| Scenario | ${FACTIONS.map((f) => f.name).join(" | ")} |`);
  console.log(`| --- | ${FACTIONS.map(() => "---").join(" | ")} |`);
  for (const [label, s] of scenarios) {
    const cells = FACTIONS.map((f) => {
      const tree = f.tree;
      const t6 = dwellingOf(tree, (rosterOf(f.id)[5] as CreatureDef).id);
      const x = run(f, {
        path: [
          "town-hall",
          ...chainTo(tree, t6, new Set(["town-hall"])).filter(
            (id) => tree.buildings[id]?.startBuilt !== true,
          ),
        ],
        recruit: s.recruit ?? (() => true),
        days: 60,
        untilTier6: true,
        prices,
        ...(s.noSpring === true ? { noSpring: true } : {}),
      });
      return `day ${x.t6Dwelling ?? "-"}, **day ${x.t6Creature ?? "-"}**`;
    });
    console.log(`| ${label} | ${cells.join(" | ")} |`);
  }
  return 0;
}
