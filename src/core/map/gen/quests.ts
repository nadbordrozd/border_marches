/**
 * Quests for seer huts, quest gates and caretaker lodges (bead bzc.13,
 * CONTENT_MAP_OBJECTS section 5), set after everything is placed because a
 * quest may name a placed guard, site or artifact.
 *
 * A quest's cost and its reward are both shown, and the reward's value
 * stays within about a quarter of the cost's (a guard's FV counts as
 * value / 60%). A lodge's errand is "bring resources", "defeat a named
 * guard" or "visit a site".
 */
import { findArtifact } from "../../../data/artifacts.ts";
import type { Prize, Quest } from "../../../data/objectTypes.ts";
import { STRAY_HOMES } from "../../../data/strays.ts";
import type { Rng } from "../../rng.ts";
import type { MapObject } from "../types.ts";
import { questReward } from "./contents.ts";
import type { GenState } from "./state.ts";

type Kind = Quest["kind"];

/** Sites a "visit" quest may name. */
const VISITABLE = new Set(["site", "dwelling", "bank", "mine"]);

export function assignQuests(st: GenState, rng: Rng): void {
  const { g } = st;
  const objs = st.objects;
  const zoneOf = (o: MapObject): number => st.zone[g.idx(o.x, o.y)] ?? 0;
  const tierOf = (o: MapObject): number => {
    const z = st.zones[zoneOf(o)];
    return z === undefined ? 1 : z.role === "hold" ? 3 : Math.min(3, z.tier);
  };
  const monsters = objs.filter(
    (o) => o.kind === "monster" && o.data["pass"] !== true,
  );
  const sites = objs.filter(
    (o) =>
      VISITABLE.has(o.kind) &&
      typeof o.data["type"] === "string" &&
      o.data["type"] !== "seer-hut" &&
      o.data["type"] !== "caretaker-lodge",
  );
  const artifacts = objs
    .filter(
      (o) => o.kind === "artifact" && typeof o.data["artifact"] === "string",
    )
    .map((o) => String(o.data["artifact"]));
  const hutCreatures = objs
    .filter((o) => o.data["type"] === "stray-hut")
    .map((o) => String(o.data["creature"]));

  const make = (o: MapObject, kinds: readonly Kind[], value: number): Quest => {
    const options = kinds.filter((k) => {
      if (k === "guard") return monsters.length > 0;
      if (k === "visit") return sites.some((s) => zoneOf(s) !== zoneOf(o));
      if (k === "artifact") return artifacts.length > 0;
      if (k === "creatures") return hutCreatures.length > 0;
      return true;
    });
    const kind = rng.pick(options.length > 0 ? options : ["resources" as Kind]);
    switch (kind) {
      case "guard": {
        // The guard whose fight is closest to the value (FV = 60%).
        const want = value * 0.6;
        const best = [...monsters].sort(
          (a, b) =>
            Math.abs(Number(a.data["fv"] ?? 0) - want) -
              Math.abs(Number(b.data["fv"] ?? 0) - want) ||
            a.id.localeCompare(b.id),
        )[0];
        if (best !== undefined) return { kind, monster: best.id };
        break;
      }
      case "visit": {
        const far = sites.filter((s) => zoneOf(s) !== zoneOf(o));
        return { kind, object: rng.pick(far).id };
      }
      case "artifact": {
        const sorted = [...artifacts].sort(
          (a, b) =>
            Math.abs((findArtifact(a)?.value ?? 0) - value) -
            Math.abs((findArtifact(b)?.value ?? 0) - value),
        );
        return { kind, artifact: sorted[0] ?? artifacts[0] ?? "" };
      }
      case "creatures": {
        const c = rng.pick(hutCreatures);
        const hire = STRAY_HOMES[c as keyof typeof STRAY_HOMES]?.hire ?? 100;
        return {
          kind,
          creature: c,
          count: Math.max(3, Math.round(value / hire)),
        };
      }
      case "level":
        return { kind, level: Math.min(12, 3 + Math.round(value / 1000)) };
      default:
        break;
    }
    // Resources: about the value, mostly gold with some wood and ore.
    const gold = Math.round((value * 0.6) / 100) * 100;
    const wood = Math.round((value * 0.2) / 100);
    const ore = Math.round((value * 0.2) / 150);
    return { kind: "resources", cost: { gold, wood, ore } };
  };

  for (const o of objs) {
    const t = o.data["type"];
    const value = Number(o.data["value"] ?? 2000) || 2000;
    if (t === "seer-hut") {
      o.data["quest"] = make(
        o,
        ["artifact", "creatures", "resources", "level", "guard", "visit"],
        value,
      );
      const reward: Prize = questReward(rng, value, tierOf(o));
      o.data["reward"] = reward;
    } else if (t === "quest-gate") {
      o.data["quest"] = make(o, ["level", "guard", "visit", "resources"], 2500);
    } else if (t === "caretaker-lodge") {
      o.data["quest"] = make(o, ["resources", "guard", "visit"], value);
    }
  }
}
