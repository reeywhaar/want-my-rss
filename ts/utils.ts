export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * takes predicate and if it is not falsy then pass it
 * as first argument to fn, if falsy then fnNot will be
 * called with no arguments
 *
 * used as rendering helper
 */
export function vif<T, C, B>(
  predicate: () => T,
  fn: (input: NonNullable<T>) => C,
  fnNot: () => B = () => "" as unknown as B
): C | B {
  let l;
  try {
    l = predicate();
  } catch (e) {}
  if (l) {
    return fn(l);
  }
  return fnNot();
}

/**
 * mappers for query params for "t" function
 */
const accessMappers: {
  [key: string]: (el: HTMLElement, prop: string) => any;
} = {
  ">": (el, prop) => el.querySelector(":scope " + prop),
  "^": (el, prop) => el.getAttribute(prop),
  ":": (el) => el.textContent!.trim(),
  "%": (el) => el.innerHTML!.trim(),
  ".": (el, prop) => (el as any)[prop],
};

const entityMap: { [key: string]: string } = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "/": "&#x2F;",
  "`": "&#x60;",
  "=": "&#x3D;",
};

/**
 * Escapes html
 */
export function escapeHtml(input: string): string {
  return input.replace(/[&<>"'`=\/]/g, (s) => entityMap[s]);
}

enum EscapeFlag {
  None = 0b00,
  Escape = 0b01,
}

/**
 * t stands for "trace"
 *
 * t is a traversal tool for xml type documents
 *
 */
export function t<T extends object>(
  el: T,
  query: string,
  def: any = "",
  escape: EscapeFlag = EscapeFlag.None
): string {
  try {
    let action: ((el: object, prop: string) => any) | undefined;
    let current: string | undefined;
    let isEscape: boolean = false;
    for (let char of query) {
      if (char === "\\") {
        isEscape = true;
        continue;
      }
      if (accessMappers.hasOwnProperty(char) && !isEscape) {
        if (typeof action !== "undefined") {
          el = action(el, current!);
          current = undefined;
        }
        action = accessMappers[char] as any;
      } else {
        if (typeof current === "undefined") current = "";
        current += char;
      }
      isEscape = false;
    }

    let out = action!(el, current!);
    if (!out) return def;
    if (escape & t.escape) out = escapeHtml(out);
    return out || def;
  } catch (e) {
    return def;
  }
}

/**
 * escapes html entities
 */
t.escape = EscapeFlag.Escape;

export function longest(...strings: string[]): string {
  let longest = strings[0];
  for (let i = 1; i < strings.length; i++) {
    if (strings[i].length > longest.length) longest = strings[i];
  }
  return longest;
}

export function randomInt(min: number = 0, max: number = 1000): number {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

export function findParent(
  el: HTMLElement,
  selector: string
): HTMLElement | null {
  while (!el.matches(selector)) {
    if (el === document.body) return null;
    el = el.parentElement!;
  }
  return el;
}

export function isRelativeUrl(url: string): boolean {
  return !/^(?:[a-z]+:)?\/\//i.test(url);
}

export function withDomain(base: string, url: string): string {
  if (isRelativeUrl(url)) return [base, url].join("");
  return url;
}
