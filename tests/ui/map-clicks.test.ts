// Clicking towns on the adventure map (bead border_marches-50f): plan a
// path with a hero selected, open an own town on a double-click, with no
// hero or with the hero inside; enemy and neutral towns as before.
import { describe, expect, it } from "vitest";
import {
  DOUBLE_CLICK_MS,
  isDoubleClick,
  townClickAction,
  type TownClick,
} from "../../src/ui/map-clicks.ts";

const base: TownClick = {
  own: true,
  heroSelected: true,
  heroInTown: false,
  plannedHere: false,
  double: false,
};

describe("townClickAction: own towns", () => {
  it("plans a path there with a hero selected, then walks after the double-click window", () => {
    expect(townClickAction(base)).toBe("plan");
    expect(townClickAction({ ...base, plannedHere: true })).toBe("walk-later");
  });

  it("opens on a double-click, never walking", () => {
    expect(townClickAction({ ...base, double: true })).toBe("open");
    expect(townClickAction({ ...base, double: true, plannedHere: true })).toBe(
      "open",
    );
  });

  it("opens on a single click with no hero or with the hero inside", () => {
    expect(townClickAction({ ...base, heroSelected: false })).toBe("open");
    expect(townClickAction({ ...base, heroInTown: true })).toBe("open");
  });
});

describe("townClickAction: enemy and neutral towns", () => {
  const foreign = { ...base, own: false };

  it("plans, then walks on the next click, as before", () => {
    expect(townClickAction(foreign)).toBe("plan");
    expect(townClickAction({ ...foreign, plannedHere: true })).toBe("walk");
    expect(townClickAction({ ...foreign, double: true })).toBe("plan");
  });

  it("does nothing without a hero, and never opens", () => {
    expect(townClickAction({ ...foreign, heroSelected: false })).toBe("none");
    expect(townClickAction({ ...foreign, heroInTown: true })).toBe("none");
    expect(
      townClickAction({ ...foreign, heroSelected: false, double: true }),
    ).toBe("none");
  });
});

describe("isDoubleClick", () => {
  it("needs the same town within DOUBLE_CLICK_MS", () => {
    const last = { key: "town-1", at: 1000 };
    expect(isDoubleClick(null, "town-1", 1000)).toBe(false);
    expect(isDoubleClick(last, "town-1", 1000 + DOUBLE_CLICK_MS)).toBe(true);
    expect(isDoubleClick(last, "town-1", 1001 + DOUBLE_CLICK_MS)).toBe(false);
    expect(isDoubleClick(last, "town-2", 1100)).toBe(false);
  });
});
