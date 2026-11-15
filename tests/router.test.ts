import { describe, expect, it } from "vitest";
import { parseRoute } from "../src/router.ts";

describe("parseRoute", () => {
  it("defaults to the game view", () => {
    expect(parseRoute("")).toMatchObject({ view: "game", seed: null });
    expect(parseRoute("?view=nonsense")).toMatchObject({ view: "game" });
  });

  it("reads view and seed", () => {
    expect(parseRoute("?view=map&seed=123")).toMatchObject({
      view: "map",
      seed: 123,
    });
    expect(parseRoute("?view=battle")).toMatchObject({
      view: "battle",
      seed: null,
    });
  });

  it("ignores invalid seeds and keeps other params", () => {
    expect(parseRoute("?seed=-4").seed).toBeNull();
    expect(parseRoute("?seed=abc").seed).toBeNull();
    expect(parseRoute("?view=map&zoom=2").params.get("zoom")).toBe("2");
  });
});
