// The town screen's visiting hero (bead border_marches-bzc.94): a click on
// the hero's portrait opens the hero sheet over the town, and the town
// redraws when the sheet closes. No DOM library in the unit tier:
// tests/ui/fake-dom.ts.
import { describe, expect, it } from "vitest";
import { newGame } from "../../src/core/game/index.ts";
import type { CommandResult, GameState } from "../../src/core/game/index.ts";
import { generateMap } from "../../src/core/map/generate.ts";
import type { HeroScreenHost } from "../../src/ui/hero-screen.ts";
import {
  openHeroFromTown,
  visitingHeroLead,
  type TownHost,
} from "../../src/ui/town.ts";
import { useFakeDocument, type FakeElement } from "./fake-dom.ts";

useFakeDocument();

const node = (n: unknown): FakeElement => n as FakeElement;
const click = (n: FakeElement): void => {
  for (const fn of n.listeners.get("click") ?? []) fn({});
};

function game(): GameState {
  return newGame(generateMap(7, { size: "S", players: 2 }), {
    players: [
      { kind: "human", faction: "humans" },
      { kind: "ai", faction: "undead" },
    ],
  });
}

describe("the visiting hero's portrait", () => {
  it("is a button that opens that hero's sheet", () => {
    const hero = game().heroes.find((h) => h.owner === 0)!;
    const opened: string[] = [];
    const lead = node(visitingHeroLead(hero, (id) => opened.push(id)));
    expect(lead.tagName).toBe("BUTTON");
    expect(lead.classList.contains("gm-town-army-hero")).toBe(true);
    expect(lead.dataset["hero"]).toBe(hero.id);
    expect(lead.getAttribute("aria-label")).toContain(hero.name);
    expect(lead.one("gm-town-army-portrait")).toBeDefined();
    expect(lead.one("gm-town-army-caption")?.textContent).toBe(hero.name);
    expect(opened).toEqual([]);
    click(lead);
    expect(opened).toEqual([hero.id]);
  });
});

describe("opening the hero sheet from the town", () => {
  it("shows the sheet over the town, then redraws the town", async () => {
    const s = game();
    const hero = s.heroes.find((h) => h.owner === 0)!;
    const ran: CommandResult[] = [];
    const host: TownHost = {
      state: () => s,
      run: (r) => {
        ran.push(r);
        return r.ok;
      },
      resourceBar: () => document.createElement("div"),
    };
    const log: string[] = [];
    let close: () => void = () => {};
    let sheetHost: HeroScreenHost | null = null;
    const open = (h: HeroScreenHost, id: string): Promise<null> => {
      sheetHost = h;
      log.push(`open ${id}`);
      return new Promise((resolve) => {
        close = () => {
          log.push("close");
          resolve(null);
        };
      });
    };
    const done = openHeroFromTown(
      host,
      hero.id,
      () => log.push("redraw"),
      open,
    );
    await Promise.resolve();
    // The town is not redrawn while the sheet is open.
    expect(log).toEqual([`open ${hero.id}`]);
    // The sheet reads the town's game and runs commands through it, and
    // its spellbook is read only (no canCast) inside the town.
    expect(sheetHost!.state()).toBe(s);
    const result = { ok: false, error: "no-hero" } as unknown as CommandResult;
    expect(sheetHost!.run(result)).toBe(false);
    expect(ran).toEqual([result]);
    expect(sheetHost!.canCast).toBeUndefined();
    close();
    await done;
    expect(log).toEqual([`open ${hero.id}`, "close", "redraw"]);
  });
});
