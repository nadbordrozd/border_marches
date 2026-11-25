/**
 * The one dialog shell (UI2-15, bead bzc.65): every modal of the game is
 * built here, in the same order and with the same keys. A dialog reads top
 * to bottom as
 *
 *   title, picture, one sentence (what this is), body (armies, lists ...),
 *   choices (rows to pick, keys 1-9), the consequence (dim), buttons.
 *
 * Every part but the title and the buttons is optional. The primary button
 * (or choice) is the action the player came for and answers Enter; the
 * cancel value answers Escape; a button may name its own letter key and the
 * first nine choices answer 1-9. Each key shows as a chip on its button.
 *
 * `modal` in dom.ts is this module's `dialog`; dom.ts re-exports it, so this
 * module builds its nodes itself instead of importing dom.ts (no cycle).
 */
import { fxEvent } from "../audio/fx.ts";
import { reducedMotion } from "./motion.ts";
import "./dialog.css";

export interface DialogButton<T> {
  label: string;
  value: T;
  /** The action the player came for: Enter, gold, focused at open. */
  primary?: boolean;
  disabled?: boolean;
  /** Its own one-letter key ("Q"), shown as a chip. */
  key?: string;
}

/** A row to pick in the dialog's body: a picture, words, a dim note. */
export interface DialogChoice<T> {
  value: T;
  /** Words, or words and nodes (resource icons inline). */
  label: string | ReadonlyArray<Node | string>;
  /** The label as plain words, for screen readers (when nodes). */
  text?: string;
  picture?: Node | null;
  /** A dim second line: a cost, why it is unavailable, what a click does. */
  note?: Node | string | null;
  disabled?: boolean;
  /** As a button's primary: Enter picks it. */
  primary?: boolean;
}

export interface DialogOptions<T> {
  title: string;
  /** The thing itself, framed under the title (a site, a chest). */
  picture?: Node | null;
  /** One sentence: what this is or what happens. */
  sentence?: Node | string | null;
  body?: Node | string;
  choices?: ReadonlyArray<DialogChoice<T>>;
  /** What choosing costs or leaves behind (dim, above the buttons). */
  consequence?: Node | string | null;
  buttons: ReadonlyArray<DialogButton<T>>;
  /** Value for Escape; omit to make Escape do nothing. */
  cancel?: T;
  className?: string;
  /** Called once the dialog is in the page, with its buttons in order. */
  onOpen?: (buttons: HTMLButtonElement[]) => void;
}

// ------------------------------------------------------------ keys

/** How many choices get a number key. */
export const CHOICE_KEYS = 9;

/** More choices than this stand in two columns. */
export const MANY_CHOICES = 6;

/**
 * The key chip of every button and choice (null: none): the primary one
 * "Enter", a button holding the cancel value "Esc", a button's own key in
 * capitals, choices "1" to "9" in order. One primary at most: the first.
 */
export function dialogKeys<T>(
  buttons: ReadonlyArray<Pick<DialogButton<T>, "value" | "primary" | "key">>,
  choices: ReadonlyArray<Pick<DialogChoice<T>, "primary">>,
  cancel: { readonly value: T } | null,
): { buttons: Array<string | null>; choices: Array<string | null> } {
  let primaryTaken = false;
  const enter = (primary: boolean | undefined): boolean => {
    if (primary !== true || primaryTaken) return false;
    primaryTaken = true;
    return true;
  };
  const choiceKeys = choices.map((c, i) =>
    enter(c.primary) ? "Enter" : i < CHOICE_KEYS ? String(i + 1) : null,
  );
  const buttonKeys = buttons.map((b) => {
    if (enter(b.primary)) return "Enter";
    if (cancel !== null && Object.is(b.value, cancel.value)) return "Esc";
    return b.key === undefined ? null : b.key.toUpperCase();
  });
  return { buttons: buttonKeys, choices: choiceKeys };
}

// ------------------------------------------------------------ nodes

type Child = Node | string | null | undefined | false;

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (className !== "") n.className = className;
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    n.append(c);
  }
  return n;
}

function chip(key: string): HTMLElement {
  return node("kbd", "gm-kbd", key);
}

function shortcut(key: string): string {
  return key === "Esc" ? "Escape" : key;
}

/** The built dialog box, not yet in the page (unit-tested). */
export interface DialogBox {
  box: HTMLElement;
  /** Buttons in the order given (onOpen gets these). */
  buttons: HTMLButtonElement[];
  /** Choice rows in the order given. */
  choices: HTMLButtonElement[];
  /** The Enter target, if any. */
  primary: HTMLButtonElement | null;
  /** Letter and number keys (upper case) to the node they click. */
  keys: Map<string, HTMLButtonElement>;
}

/**
 * Builds the dialog's box in the shell's order; a click on a button or an
 * enabled choice calls `close` with its value.
 */
export function dialogBox<T>(
  options: DialogOptions<T>,
  close: (value: T) => void,
): DialogBox {
  const box = node("div", "gm-modal gm-dialog");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", options.title);
  if (options.className) box.classList.add(options.className);
  box.append(node("h2", "gm-modal-title", options.title));
  const picture = options.picture ?? null;
  if (picture !== null) {
    box.classList.add("gm-dialog-pictured");
    box.append(node("div", "gm-dialog-picture", picture));
  }
  const sentence = options.sentence ?? null;
  if (sentence !== null && sentence !== "")
    box.append(node("p", "gm-dialog-sentence", sentence));
  if (options.body !== undefined)
    box.append(node("div", "gm-modal-body", options.body));
  const choices = options.choices ?? [];
  const hasCancel = "cancel" in options;
  const keys = dialogKeys(
    options.buttons,
    choices,
    hasCancel ? { value: options.cancel as T } : null,
  );
  const keyMap = new Map<string, HTMLButtonElement>();
  let primary: HTMLButtonElement | null = null;
  const mark = (b: HTMLButtonElement, key: string | null): void => {
    if (key === null) return;
    b.append(chip(key));
    b.setAttribute("aria-keyshortcuts", shortcut(key));
    if (key === "Enter") {
      primary = b;
      b.classList.add("gm-primary");
    } else if (key !== "Esc") keyMap.set(key, b);
  };
  const choiceNodes: HTMLButtonElement[] = [];
  if (choices.length > 0) {
    if (choices.length > MANY_CHOICES) box.classList.add("gm-dialog-many");
    const list = node("div", "gm-dialog-choices");
    choices.forEach((c, i) => {
      const label = typeof c.label === "string" ? [c.label] : [...c.label];
      const note = c.note ?? null;
      const row = node(
        "button",
        "gm-btn gm-dialog-choice",
        c.picture === undefined || c.picture === null
          ? null
          : node("span", "gm-dialog-choice-pic", c.picture),
        node(
          "span",
          "gm-dialog-choice-text",
          node("span", "gm-dialog-choice-label", ...label),
          note === null ? null : node("span", "gm-dialog-choice-note", note),
        ),
      );
      row.type = "button";
      if (c.text !== undefined) row.setAttribute("aria-label", c.text);
      row.disabled = c.disabled === true;
      row.addEventListener("click", () => close(c.value));
      mark(row, keys.choices[i] ?? null);
      choiceNodes.push(row);
      list.append(row);
    });
    box.append(list);
  }
  const consequence = options.consequence ?? null;
  if (consequence !== null && consequence !== "")
    box.append(node("p", "gm-dialog-consequence", consequence));
  const row = node("div", "gm-modal-buttons");
  const buttonNodes: HTMLButtonElement[] = [];
  options.buttons.forEach((b, i) => {
    const n = node("button", "gm-btn", b.label);
    n.type = "button";
    n.addEventListener("click", () => close(b.value));
    n.disabled = b.disabled === true;
    mark(n, keys.buttons[i] ?? null);
    buttonNodes.push(n);
    row.append(n);
  });
  box.append(row);
  return {
    box,
    buttons: buttonNodes,
    choices: choiceNodes,
    primary,
    keys: keyMap,
  };
}

// ------------------------------------------------------------ the modal

let modalDepth = 0;
const modalListeners = new Set<() => void>();

/** Whether a modal is open (keyboard shortcuts pause meanwhile). */
export function modalOpen(): boolean {
  return modalDepth > 0;
}

/**
 * Calls `listener` whenever a modal opens or closes (the map turns its
 * input off meanwhile); returns the unsubscribe function.
 */
export function onModalChange(listener: () => void): () => void {
  modalListeners.add(listener);
  return () => modalListeners.delete(listener);
}

function modalChanged(): void {
  for (const listener of modalListeners) listener();
}

function typing(): boolean {
  const a = document.activeElement;
  return (
    a instanceof HTMLInputElement ||
    a instanceof HTMLTextAreaElement ||
    a instanceof HTMLSelectElement
  );
}

/** Shows a dialog over everything; resolves with the chosen value. */
export function dialog<T>(options: DialogOptions<T>): Promise<T> {
  return new Promise((resolve) => {
    modalDepth++;
    modalChanged();
    const backdrop = node("div", "gm-backdrop");
    let closed = false;
    const close = (value: T): void => {
      if (closed) return;
      closed = true;
      window.removeEventListener("keydown", onKey, true);
      modalDepth--;
      modalChanged();
      resolve(value);
      // Closing: a short fade (bead bzc.26); nothing waits for it.
      if (reducedMotion() || typeof backdrop.animate !== "function") {
        backdrop.remove();
        return;
      }
      fxEvent("ui.dialog.close");
      backdrop.classList.add("gm-closing");
      setTimeout(() => backdrop.remove(), 110);
    };
    const built = dialogBox(options, close);
    const { box, primary } = built;
    backdrop.append(box);
    (document.getElementById("ui") ?? document.body).append(backdrop);
    const onKey = (e: KeyboardEvent): void => {
      // Only the topmost modal reacts.
      if (backdrop.nextElementSibling?.matches(".gm-backdrop:not(.gm-closing)"))
        return;
      if (e.key === "Escape" && "cancel" in options) {
        e.preventDefault();
        e.stopPropagation();
        close(options.cancel as T);
        return;
      }
      if (e.key === "Enter" && primary !== null && !primary.disabled) {
        if (typing()) return;
        e.preventDefault();
        e.stopPropagation();
        primary.click();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || typing()) return;
      const target = built.keys.get(e.key.toUpperCase());
      if (target !== undefined && !target.disabled) {
        e.preventDefault();
        e.stopPropagation();
        target.click();
      }
    };
    window.addEventListener("keydown", onKey, true);
    fxEvent("ui.dialog.open");
    if (primary !== null) primary.focus();
    else {
      // No default action: Enter must not pick the first row.
      box.tabIndex = -1;
      box.focus();
    }
    options.onOpen?.(built.buttons);
  });
}

/** A one-button message. */
export function alertModal(title: string, body: Node | string): Promise<void> {
  return dialog<undefined>({
    title,
    ...(typeof body === "string" ? { sentence: body } : { body }),
    buttons: [{ label: "OK", value: undefined, primary: true }],
    cancel: undefined,
  });
}
