// A tiny stand-in document for the hero sheet's unit tests (beads
// border_marches-tez, bzc.45, bzc.69): no DOM library in the unit tier, so
// this covers what the sheet's builders touch.
import { afterAll, beforeAll, vi } from "vitest";

export class FakeElement {
  readonly tagName: string;
  readonly children: FakeElement[] = [];
  readonly style: Record<string, unknown> = {
    setProperty(this: Record<string, unknown>, k: string, v: string) {
      this[k] = v;
    },
  };
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Array<(e: unknown) => void>>();
  private text = "";
  private classes: string[] = [];
  [prop: string]: unknown;

  constructor(tag: string) {
    this.tagName = tag.toUpperCase();
  }

  get className(): string {
    return this.classes.join(" ");
  }
  set className(v: string) {
    this.classes = v.split(/\s+/).filter((c) => c !== "");
  }
  get classList() {
    return {
      add: (...c: string[]) => {
        for (const x of c) if (!this.classes.includes(x)) this.classes.push(x);
      },
      remove: (...c: string[]) => {
        this.classes = this.classes.filter((x) => !c.includes(x));
      },
      contains: (c: string) => this.classes.includes(c),
    };
  }
  get textContent(): string {
    return this.text + this.children.map((c) => c.textContent).join("");
  }
  set textContent(v: string) {
    this.text = v;
    this.children.length = 0;
  }
  append(...nodes: Array<FakeElement | string>): void {
    for (const n of nodes) {
      if (typeof n === "string") {
        const t = new FakeElement("#text");
        t.textContent = n;
        this.children.push(t);
      } else this.children.push(n);
    }
  }
  setAttribute(k: string, v: string): void {
    this.attributes.set(k, v);
  }
  getAttribute(k: string): string | null {
    return this.attributes.get(k) ?? null;
  }
  hasAttribute(k: string): boolean {
    return this.attributes.has(k);
  }
  removeAttribute(k: string): void {
    this.attributes.delete(k);
  }
  addEventListener(type: string, fn: (e: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  /** Every descendant with the class, in document order. */
  all(cls: string): FakeElement[] {
    return this.children.flatMap((c) => [
      ...(c.classList.contains(cls) ? [c] : []),
      ...c.all(cls),
    ]);
  }
  one(cls: string): FakeElement | undefined {
    return this.all(cls)[0];
  }
}

/** Stubs `document` with the stand-in for the calling test file. */
export function useFakeDocument(): void {
  beforeAll(() => {
    vi.stubGlobal("document", {
      createElement: (tag: string) => new FakeElement(tag),
    });
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });
}
