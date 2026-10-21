import { ThemeLabelType } from "./themeType.js";
import { type Storage } from "./storage.js";
import { Disposable } from "./disposable.js";

const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

/** The palette shown for a theme choice, auto following the system */
export function resolveTheme(theme: ThemeLabelType): "day" | "night" {
  if (theme === "auto") return systemDark.matches ? "night" : "day";
  return theme;
}

export class ThemeService {
  storage: typeof Storage;
  switchCounter = 0;

  constructor(storage: typeof Storage) {
    this.storage = storage;
  }

  async get(): Promise<ThemeLabelType> {
    const theme = await this.storage.get("theme");
    return theme === "day" || theme === "night" ? theme : "auto";
  }

  /** Shows the theme on the page, fading colors over when `animate` */
  apply(theme: ThemeLabelType, animate = false) {
    const resolved = resolveTheme(theme);
    const root = document.documentElement;
    if (root.dataset.theme === resolved) return;
    if (!animate) {
      root.dataset.theme = resolved;
      return;
    }
    root.classList.add("switch-transition");
    ++this.switchCounter;
    setTimeout(() => {
      root.dataset.theme = resolved;
    }, 10);
    setTimeout(() => {
      --this.switchCounter;
      if (this.switchCounter < 1) {
        root.classList.remove("switch-transition");
      }
    }, 1500);
  }

  async set(theme: ThemeLabelType) {
    this.apply(theme, true);
    await this.storage.set("theme", theme);
  }

  /** Keeps auto in step with the system switching between light and dark */
  watchSystem(): Disposable {
    const listener = async () => {
      const theme = await this.get();
      if (theme === "auto") this.apply(theme, true);
    };
    systemDark.addEventListener("change", listener);
    return {
      dispose: () => systemDark.removeEventListener("change", listener),
    };
  }
}
