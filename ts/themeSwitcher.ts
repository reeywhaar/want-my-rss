import { DisposableStack } from "./disposable.js";
import { spawn } from "./spawn.js";
import { type Storage } from "./storage.js";
import { ThemeService } from "./theme.js";
import { ThemeLabelType } from "./themeType.js";

const Choices: [ThemeLabelType, string][] = [
  ["auto", "Auto"],
  ["day", "Light"],
  ["night", "Dark"],
];

export class ThemeSwitcherFactory {
  storage: typeof Storage;

  constructor(storage: typeof Storage) {
    this.storage = storage;
  }

  create() {
    const st = this.storage;
    return class ThemeSwitcher extends HTMLElement {
      storage = st;
      private stack = new DisposableStack();

      themeService = new ThemeService(this.storage);

      connectedCallback() {
        const root = this.attachShadow({ mode: "open" });
        const style = document.createElement("link");
        style.rel = "stylesheet";
        style.href = "/themeSwitcher.css";
        root.appendChild(style);

        const switcher = document.createElement("div");
        switcher.className = "theme-switch";
        switcher.setAttribute("role", "radiogroup");
        switcher.setAttribute("aria-label", "Theme");
        root.appendChild(switcher);

        // Slides under the checked choice
        const thumb = document.createElement("div");
        thumb.className = "theme-switch__thumb";
        switcher.appendChild(thumb);

        const buttons = Choices.map(([theme, label]) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = `theme-switch__item theme-switch__item--${theme}`;
          button.setAttribute("role", "radio");
          button.setAttribute("aria-label", label);
          button.title = label;
          button.dataset.theme = theme;

          const icon = document.createElement("span");
          icon.className = "theme-switch__icon";
          button.appendChild(icon);

          button.addEventListener("click", () => {
            check(theme);
            this.themeService.set(theme);
          });
          switcher.appendChild(button);
          return button;
        });

        const check = (theme: ThemeLabelType) => {
          for (const button of buttons) {
            button.setAttribute(
              "aria-checked",
              `${button.dataset.theme === theme}`
            );
          }
          const index = Choices.findIndex(([id]) => id === theme);
          switcher.style.setProperty("--index", `${index}`);
        };

        this.stack.use(
          spawn(async () => {
            const theme = await this.themeService.get();
            this.themeService.apply(theme);
            check(theme);
            // Only slide on changes, not into the first position
            requestAnimationFrame(() => (switcher.dataset.ready = ""));
          })
        );

        this.stack.use(
          this.storage.subscribe(async (changes) => {
            if (changes.theme) {
              const theme = await this.themeService.get();
              this.themeService.apply(theme, true);
              check(theme);
            }
          })
        );

        this.stack.use(this.themeService.watchSystem());
      }

      disconnectedCallback() {
        this.stack.dispose();
      }
    };
  }
}
