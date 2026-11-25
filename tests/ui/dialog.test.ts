// The one dialog shell (UI2-15, bead border_marches-bzc.65): every dialog
// reads title, picture, sentence, body, choices, consequence, buttons; the
// primary answers Enter, the cancel value Escape, a button its own letter,
// the first nine choices 1-9; a click closes with its value. No DOM
// library in the unit tier: tests/ui/fake-dom.ts.
import { describe, expect, it } from "vitest";
import { CHOICE_KEYS, dialogBox, dialogKeys } from "../../src/ui/dialog.ts";
import type { DialogOptions } from "../../src/ui/dialog.ts";
import { useFakeDocument, type FakeElement } from "./fake-dom.ts";

useFakeDocument();

const fake = (n: unknown): FakeElement => n as FakeElement;

function click(n: unknown): void {
  for (const fn of fake(n).listeners.get("click") ?? []) fn({});
}

describe("dialog keys", () => {
  it("gives Enter to the primary, Esc to the cancel value, letters and numbers to the rest", () => {
    const keys = dialogKeys(
      [
        { value: "fight", primary: true },
        { value: "auto", key: "q" },
        { value: "leave" },
      ],
      [{}, {}],
      { value: "leave" },
    );
    expect(keys.buttons).toEqual(["Enter", "Q", "Esc"]);
    expect(keys.choices).toEqual(["1", "2"]);
  });

  it("lets a primary choice take Enter, and only one thing has it", () => {
    const keys = dialogKeys(
      [{ value: "ok", primary: true }],
      [{}, { primary: true }, { primary: true }],
      null,
    );
    expect(keys.choices).toEqual(["1", "Enter", "3"]);
    expect(keys.buttons).toEqual([null]);
  });

  it("numbers only the first nine choices", () => {
    const keys = dialogKeys(
      [],
      Array.from({ length: 12 }, () => ({})),
      null,
    );
    expect(keys.choices.filter((k) => k !== null)).toHaveLength(CHOICE_KEYS);
    expect(keys.choices[9]).toBeNull();
  });
});

describe("dialog box", () => {
  // Built in each test: the fake document exists only once tests run.
  const options = (): DialogOptions<string> => ({
    title: "Arena",
    picture: document.createElement("img"),
    sentence: "The hero gains +2 Attack or +2 Defense.",
    choices: [
      { value: "a", label: "+2 Attack" },
      {
        value: "d",
        label: "+2 Defense",
        note: "already learned",
        disabled: true,
      },
    ],
    consequence: "Once per hero.",
    buttons: [{ label: "Leave", value: "" }],
    cancel: "",
    className: "gm-site-dialog",
  });

  it("lays the parts out in the shell's order", () => {
    const built = dialogBox(options(), () => undefined);
    const box = fake(built.box);
    expect(box.className).toBe(
      "gm-modal gm-dialog gm-site-dialog gm-dialog-pictured",
    );
    expect(box.getAttribute("role")).toBe("dialog");
    expect(box.getAttribute("aria-label")).toBe("Arena");
    expect(box.children.map((c) => c.className)).toEqual([
      "gm-modal-title",
      "gm-dialog-picture",
      "gm-dialog-sentence",
      "gm-dialog-choices",
      "gm-dialog-consequence",
      "gm-modal-buttons",
    ]);
  });

  it("puts the key chip on each choice and button", () => {
    const built = dialogBox(options(), () => undefined);
    expect(
      built.choices.map((c) => fake(c).one("gm-kbd")?.textContent),
    ).toEqual(["1", "2"]);
    expect(fake(built.buttons[0]).one("gm-kbd")?.textContent).toBe("Esc");
    expect(fake(built.buttons[0]).getAttribute("aria-keyshortcuts")).toBe(
      "Escape",
    );
    expect([...built.keys.keys()]).toEqual(["1", "2"]);
    expect(built.primary).toBeNull();
    expect(fake(built.choices[1]).disabled).toBe(true);
    expect(fake(built.choices[1]).textContent).toContain("already learned");
  });

  it("closes with the value of the clicked choice or button", () => {
    const got: string[] = [];
    const built = dialogBox(options(), (v) => got.push(v));
    click(built.choices[0]);
    click(built.buttons[0]);
    expect(got).toEqual(["a", ""]);
  });

  it("marks the primary button gold and leaves out empty parts", () => {
    const built = dialogBox(
      {
        title: "End the turn?",
        buttons: [
          { label: "End turn", value: "end", primary: true },
          { label: "Keep playing", value: "stay" },
        ],
        cancel: "stay",
      },
      () => undefined,
    );
    expect(built.primary).toBe(built.buttons[0]);
    expect(fake(built.buttons[0]).classList.contains("gm-primary")).toBe(true);
    expect(fake(built.buttons[0]).one("gm-kbd")?.textContent).toBe("Enter");
    expect(fake(built.box).children.map((c) => c.className)).toEqual([
      "gm-modal-title",
      "gm-modal-buttons",
    ]);
  });
});
