/**
 * Small DOM helpers shared by the game screens: element builder, modal
 * dialogs, toasts and image URLs of manifest assets.
 */
import { assetByKey, assetUrl, RESOURCE_ITEMS } from "../assets/manifest.ts";
import type { ResourceId } from "../core/map/types.ts";
import { RESOURCE_IDS, RESOURCE_NAMES } from "../data/economy.ts";
import type { ResourceAmounts } from "../data/types.ts";

type Child = Node | string | null | undefined | false;

/** `el("div.a.b", child, ...)`: a tag with optional classes, and children. */
export function el<K extends keyof HTMLElementTagNameMap>(
  spec: K | `${K}.${string}`,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const [tag, ...classes] = spec.split(".");
  const node = document.createElement(tag as K);
  if (classes.length > 0) node.className = classes.join(" ");
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c);
  }
  return node;
}

export function button(
  label: string,
  onClick: (e: MouseEvent) => void,
  className = "gm-btn",
): HTMLButtonElement {
  const b = el("button");
  b.type = "button";
  b.className = className;
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

/** The URL of a manifest image by key. */
export function imageUrl(key: string): string {
  return assetUrl(assetByKey(key), import.meta.env.BASE_URL);
}

export function img(key: string, className = "", scale = 1): HTMLImageElement {
  const asset = assetByKey(key);
  const image = el("img");
  image.src = assetUrl(asset, import.meta.env.BASE_URL);
  image.width = asset.w * scale;
  image.height = asset.h * scale;
  image.alt = "";
  image.draggable = false;
  if (className) image.className = className;
  return image;
}

export function resourceIcon(
  r: ResourceId,
  className = "gm-res-icon",
): HTMLImageElement {
  const image = img(RESOURCE_ITEMS[r].key, className);
  image.alt = RESOURCE_NAMES[r];
  image.title = RESOURCE_NAMES[r];
  return image;
}

/** A cost as icons and numbers; resources the player lacks shown in red. */
export function costView(
  cost: ResourceAmounts,
  have?: Readonly<Record<ResourceId, number>>,
): HTMLElement {
  const box = el("span.gm-cost");
  let any = false;
  for (const r of RESOURCE_IDS) {
    const n = cost[r] ?? 0;
    if (n <= 0) continue;
    any = true;
    const part = el(
      "span.gm-cost-part",
      resourceIcon(r, "gm-cost-icon"),
      String(n),
    );
    if (have !== undefined && have[r] < n) part.classList.add("gm-short");
    box.append(part);
  }
  if (!any) box.append("free");
  return box;
}

// ---------------------------------------------------------------- modals

export interface ModalButton<T> {
  label: string;
  value: T;
  primary?: boolean;
  disabled?: boolean;
}

export interface ModalOptions<T> {
  title: string;
  body?: Node | string;
  buttons: ModalButton<T>[];
  /** Value for Escape; omit to make Escape do nothing. */
  cancel?: T;
  className?: string;
  /** Called once the dialog is in the page, with its buttons in order. */
  onOpen?: (buttons: HTMLButtonElement[]) => void;
}

let modalDepth = 0;

/** Whether a modal is open (keyboard shortcuts pause meanwhile). */
export function modalOpen(): boolean {
  return modalDepth > 0;
}

/** Shows a modal dialog over everything; resolves with the clicked value. */
export function modal<T>(options: ModalOptions<T>): Promise<T> {
  return new Promise((resolve) => {
    modalDepth++;
    const backdrop = el("div.gm-backdrop");
    const box = el("div.gm-modal");
    if (options.className) box.classList.add(options.className);
    box.append(el("h2.gm-modal-title", options.title));
    if (options.body !== undefined) {
      const body = el("div.gm-modal-body");
      body.append(options.body);
      box.append(body);
    }
    const row = el("div.gm-modal-buttons");
    const close = (value: T): void => {
      window.removeEventListener("keydown", onKey, true);
      backdrop.remove();
      modalDepth--;
      resolve(value);
    };
    let primary: HTMLButtonElement | null = null;
    const nodes: HTMLButtonElement[] = [];
    for (const b of options.buttons) {
      const node = button(b.label, () => close(b.value));
      if (b.primary === true) {
        node.classList.add("gm-primary");
        primary = node;
      }
      node.disabled = b.disabled === true;
      nodes.push(node);
      row.append(node);
    }
    box.append(row);
    backdrop.append(box);
    (document.getElementById("ui") ?? document.body).append(backdrop);
    const onKey = (e: KeyboardEvent): void => {
      // Only the topmost modal reacts.
      if (backdrop.nextElementSibling?.classList.contains("gm-backdrop"))
        return;
      if (e.key === "Escape" && "cancel" in options) {
        e.preventDefault();
        e.stopPropagation();
        close(options.cancel as T);
      } else if (e.key === "Enter" && primary !== null && !primary.disabled) {
        if (document.activeElement instanceof HTMLInputElement) return;
        e.preventDefault();
        e.stopPropagation();
        primary.click();
      }
    };
    window.addEventListener("keydown", onKey, true);
    primary?.focus();
    options.onOpen?.(nodes);
  });
}

/** A one-button message. */
export function alertModal(title: string, body: Node | string): Promise<void> {
  return modal<undefined>({
    title,
    body,
    buttons: [{ label: "OK", value: undefined, primary: true }],
    cancel: undefined,
  });
}

// ---------------------------------------------------------------- toasts

/** A short message that floats up and fades (e.g. "+5 wood"). */
export function toast(
  text: string,
  kind: "info" | "gain" | "week" = "info",
): void {
  const host = document.getElementById("ui") ?? document.body;
  let stack = host.querySelector<HTMLElement>(".gm-toasts");
  if (stack === null) {
    stack = el("div.gm-toasts");
    host.append(stack);
  }
  const node = el("div.gm-toast", text);
  node.classList.add(`gm-toast-${kind}`);
  stack.append(node);
  setTimeout(() => node.remove(), kind === "week" ? 3200 : 2200);
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
