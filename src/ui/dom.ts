/**
 * Small DOM helpers shared by the game screens: element builder, modal
 * dialogs (the shell in dialog.ts), toasts and image URLs of manifest
 * assets.
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

/** A small key chip ("E") shown on buttons and in hints. */
export function kbd(key: string): HTMLElement {
  return el("kbd.gm-kbd", key);
}

/**
 * A button that shows its keyboard shortcut as a chip after the label and
 * announces it (aria-keyshortcuts).
 */
export function keyButton(
  label: string,
  key: string,
  onClick: (e: MouseEvent) => void,
  className = "gm-btn",
): HTMLButtonElement {
  const b = button(label, onClick, className);
  b.append(kbd(key));
  b.setAttribute("aria-keyshortcuts", key);
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

// Every dialog is built by the one shell in dialog.ts (UI2-15).
export {
  alertModal,
  dialog as modal,
  modalOpen,
  onModalChange,
} from "./dialog.ts";
export type {
  DialogButton as ModalButton,
  DialogChoice,
  DialogOptions as ModalOptions,
} from "./dialog.ts";

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
