// Dev mode and the Menu's Dev panel (bead border_marches-bzc.93): `?dev=1`
// and the stored toggle; the panel is hidden while dev mode is off; each
// panel action applies its command through the host. No DOM library in the
// unit tier: tests/ui/fake-dom.ts.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  newGame,
  type CommandResult,
  type GameState,
} from "../../src/core/game/index.ts";
import { townTree } from "../../src/data/factions.ts";
import {
  DEV_MODE_KEY,
  devRequested,
  storeDevMode,
  storedDevMode,
} from "../../src/ui/dev-mode.ts";
import { buildMap, field, heroStart, town } from "../core/game/helpers.ts";
import { FakeElement } from "./fake-dom.ts";

function memory(): Map<string, string> & {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
} {
  const m = new Map<string, string>() as Map<string, string> & {
    getItem(k: string): string | null;
    setItem(k: string, v: string): void;
  };
  m.getItem = (k) => m.get(k) ?? null;
  m.setItem = (k, v) => void m.set(k, v);
  return m;
}

function game(): GameState {
  const map = buildMap(field(10, 10), [
    town("t0", 1, 1, 0),
    heroStart(1, 2, 0),
    town("t1", 8, 8, 1),
    heroStart(8, 7, 1),
  ]);
  return newGame(map, {
    players: [
      { kind: "human", faction: "humans" },
      { kind: "ai", faction: "goblins" },
    ],
  });
}

/** Loads dev-mode and dev-panel fresh with the given URL and storage. */
async function panelWith(search: string, store: ReturnType<typeof memory>) {
  vi.resetModules();
  vi.stubGlobal("document", {
    createElement: (tag: string) => new FakeElement(tag),
  });
  vi.stubGlobal("location", { search });
  vi.stubGlobal("window", { localStorage: store });
  const mod = await import("../../src/ui/dev-panel.ts");
  let state = game();
  const notes: string[] = [];
  const host = {
    state: () => state,
    player: 0,
    heroId: () => state.heroes.find((h) => h.owner === 0)?.id ?? null,
    townId: () => "t0",
    run: (r: CommandResult) => {
      if (!r.ok) return null;
      state = r.state;
      return r.events;
    },
    note: (t: string) => void notes.push(t),
  };
  return { mod, host, notes, state: () => state };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dev mode setting", () => {
  it("?dev=1 or ?dev=true asks for it; anything else does not", () => {
    expect(devRequested("?dev=1")).toBe(true);
    expect(devRequested("?seed=3&dev=true")).toBe(true);
    expect(devRequested("?dev=0")).toBe(false);
    expect(devRequested("")).toBe(false);
  });

  it("the toggle is stored and read back; broken storage means off", () => {
    const store = memory();
    expect(storedDevMode(store)).toBe(false);
    expect(storeDevMode(store, true)).toBe(true);
    expect(store.get(DEV_MODE_KEY)).toBe("1");
    expect(storedDevMode(store)).toBe(true);
    storeDevMode(store, false);
    expect(storedDevMode(store)).toBe(false);
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(storedDevMode(broken)).toBe(false);
    expect(storeDevMode(broken, true)).toBe(false);
    expect(storeDevMode(null, true)).toBe(false);
  });
});

describe("the Dev panel", () => {
  it("is hidden while dev mode is off; the toggle shows it and stores it", async () => {
    const store = memory();
    const { mod, host } = await panelWith("", store);
    const box = mod.devSettings(host) as unknown as FakeElement;
    expect(box.one("gm-dev-panel")).toBeUndefined();
    const toggle = box.one("gm-dev-toggle")!;
    expect(toggle.textContent).toBe("Developer tools: off");
    toggle.listeners.get("click")![0]!({});
    expect(box.one("gm-dev-panel")).toBeDefined();
    expect(box.one("gm-dev-toggle")!.textContent).toBe("Developer tools: on");
    expect(store.get(DEV_MODE_KEY)).toBe("1");
  });

  it("?dev=1 shows it at once, and each button applies its command", async () => {
    const { mod, host, notes, state } = await panelWith("?dev=1", memory());
    const box = mod.devSettings(host) as unknown as FakeElement;
    const click = (cls: string): void =>
      box.one(cls)!.listeners.get("click")![0]!({});
    const gold0 = state().players[0]!.resources.gold;
    click("gm-dev-resources");
    expect(state().players[0]!.resources.gold).toBe(gold0 + 10000);
    click("gm-dev-reveal");
    expect(state().players[0]!.explored.every((e) => e)).toBe(true);
    (box.one("gm-dev-town") as FakeElement & { value: string }).value = "t0";
    click("gm-dev-build");
    expect(state().towns["t0"]!.buildings).toHaveLength(
      townTree("humans")!.order.length,
    );
    const id = state().heroes.find((h) => h.owner === 0)!.id;
    // Spend the hero's movement (the host's state is this test's own).
    const h = state().heroes.find((x) => x.id === id)!;
    h.mp = 0;
    click("gm-dev-refill");
    expect(state().heroes.find((x) => x.id === id)!.mp).toBe(h.maxMp);
    click("gm-dev-build-all");
    expect(notes).toHaveLength(5);
    expect(notes[0]).toContain("+10000 gold");
    expect(notes[2]).toMatch(/built \d+ buildings in /);
    expect(box.one("gm-dev-status")!.textContent).toBe(notes[4]);
  });
});
