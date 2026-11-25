// Right-click inspects (UI2-18, bead border_marches-bzc.68): what a press
// does while a card is pinned, and where a card goes.
import { describe, expect, it } from "vitest";
import { pinPress, placeBeside, placeTip } from "../../src/ui/tooltip.ts";

describe("pinPress", () => {
  it("does nothing special while no card is pinned", () => {
    expect(pinPress(false, false, 0)).toBe("none");
    expect(pinPress(false, false, 2)).toBe("none");
  });

  it("keeps the card for a press inside it (hovering keywords, reading)", () => {
    expect(pinPress(true, true, 0)).toBe("none");
    expect(pinPress(true, true, 2)).toBe("none");
  });

  it("closes the card on a left press elsewhere and eats that click", () => {
    expect(pinPress(true, false, 0)).toBe("close-eat");
  });

  it("lets a right press elsewhere through, so it pins the next card", () => {
    expect(pinPress(true, false, 2)).toBe("close");
    expect(pinPress(true, false, 1)).toBe("close");
  });
});

describe("placeBeside (a keyword's box next to a pinned card)", () => {
  const card = { left: 300, top: 100, right: 850, bottom: 400 };
  type Rect = { left: number; top: number; right: number; bottom: number };
  const overlaps = (
    c: Rect,
    at: { left: number; top: number },
    w: number,
    h: number,
  ) =>
    at.left < c.right &&
    c.left < at.left + w &&
    at.top < c.bottom &&
    c.top < at.top + h;

  it("goes to the right of the card when it fits", () => {
    const at = placeBeside(card, 220, 120, 1280, 800);
    expect(at).toEqual({ left: 856, top: 100 });
  });

  it("goes to the left when the right is too narrow", () => {
    const right = { ...card, left: 700, right: 1200 };
    const at = placeBeside(right, 220, 120, 1280, 800);
    expect(at.left + 220).toBeLessThanOrEqual(700);
    expect(overlaps(right, at, 220, 120)).toBe(false);
  });

  it("goes below when neither side fits, and never covers the card", () => {
    const wide = { left: 100, top: 100, right: 1180, bottom: 400 };
    const at = placeBeside(wide, 220, 120, 1280, 800);
    expect(at.top).toBeGreaterThanOrEqual(400);
    expect(overlaps(wide, at, 220, 120)).toBe(false);
  });

  it("goes above when below is out of the window too", () => {
    const wide = { left: 100, top: 500, right: 1180, bottom: 760 };
    const at = placeBeside(wide, 220, 120, 1280, 800);
    expect(at.top + 120).toBeLessThanOrEqual(500);
  });
});

describe("placeTip for a pinned card", () => {
  it("stays inside the window near its edges", () => {
    const at = placeTip(1270, 790, 330, 200, 1280, 800);
    expect(at.left + 330).toBeLessThanOrEqual(1280 - 6);
    expect(at.top + 200).toBeLessThanOrEqual(800 - 6);
    expect(at.left).toBeGreaterThanOrEqual(6);
    expect(at.top).toBeGreaterThanOrEqual(6);
  });
});
