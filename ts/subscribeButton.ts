import { DisposableStack } from "./disposable.js";
import { spawn } from "./spawn.js";
import { type Storage } from "./storage.js";

export class SubscribeButtonFactory {
  storage: typeof Storage;

  constructor(storage: typeof Storage) {
    this.storage = storage;
  }

  create() {
    const st = this.storage;
    return class SubscribeButton extends HTMLElement {
      storage = st;
      private stack = new DisposableStack();

      constructor() {
        super();
      }

      connectedCallback() {
        this.stack.use(
          spawn(async (stack) => {
            const root = this.attachShadow({ mode: "open" });
            const style = document.createElement("link");
            style.rel = "stylesheet";
            style.href = "/subscribeButton.css";
            root.appendChild(style);

            const subscribeDiv = document.createElement("div");
            subscribeDiv.className = "subscribe";
            root.appendChild(subscribeDiv);

            const titleSpan = document.createElement("span");
            titleSpan.tabIndex = 0;
            titleSpan.textContent = "Subscribe";
            titleSpan.className = "link";
            const handler = async (newTab: boolean) => {
              const currentFeedReader =
                await this.storage.get("currentFeedReader");
              const url = currentFeedReader.link(this.getAttribute("link")!);
              browser.runtime.sendMessage({
                action: "open-tab",
                url,
                // Links to apps (feed: and such) show an error page when no
                // app takes them, which must not replace the feed preview
                newTab: newTab || !/^https?:/.test(url),
              });
            };
            titleSpan.addEventListener(
              "click",
              stack.adopt(
                (e) => {
                  if (e.which !== 1 && e.which !== 2) return;
                  e.preventDefault();
                  const newTab = e.metaKey || e.which === 2;
                  handler(newTab);
                },
                (h) => {
                  titleSpan.removeEventListener("click", h);
                }
              )
            );
            titleSpan.addEventListener(
              "keydown",
              stack.adopt(
                (e) => {
                  if ("keyCode" in e && e.keyCode !== 13) return;
                  e.preventDefault();
                  const newTab = e.metaKey;
                  handler(newTab);
                },
                (h) => {
                  titleSpan.removeEventListener("keydown", h);
                }
              )
            );
            subscribeDiv.appendChild(titleSpan);

            const provDiv = document.createElement("div");
            provDiv.className = "current-provider";
            provDiv.tabIndex = 0;
            provDiv.addEventListener("focus", () => {
              providersDiv.classList.remove("hidden");
            });
            provDiv.addEventListener("blur", () => {
              providersDiv.classList.add("hidden");
            });
            subscribeDiv.appendChild(provDiv);

            const [readers, currentReader] = await Promise.all([
              this.storage.get("feedReaders"),
              this.storage.get("currentFeedReader"),
            ]);

            const providerIcon = document.createElement("img");
            providerIcon.className = "provider-icon";
            providerIcon.title = currentReader.name;
            providerIcon.src = currentReader.favicon;
            provDiv.appendChild(providerIcon);

            const providersDiv = document.createElement("div");
            providersDiv.className = "providers hidden";
            provDiv.appendChild(providersDiv);

            const providers = readers.map((reader) => {
              const el = document.createElement("span");
              const isCurrent = reader.id === currentReader.id;
              el.className = `providers__item ${
                isCurrent ? "providers__item--current" : ""
              }`;
              el.dataset.id = reader.id;

              const text = document.createElement("span");
              text.className = "providers__text";
              el.appendChild(text);

              const name = document.createElement("span");
              name.textContent = reader.name;
              text.appendChild(name);

              if (reader.description) {
                const caption = document.createElement("span");
                caption.className = "providers__caption";
                caption.textContent = reader.description;
                text.appendChild(caption);
              }

              const img = document.createElement("img");
              img.className = "provider-icon";
              img.src = reader.favicon;
              el.appendChild(img);

              el.addEventListener(
                "click",
                stack.adopt(
                  (e) => {
                    let id = (e.currentTarget as HTMLElement).dataset.id!;
                    (async () => {
                      let currentProviderID =
                        await this.storage.get("feedReaderID");
                      if (id === currentProviderID) return;
                      await this.storage.set("feedReaderID", id);
                      const currentProvider =
                        await this.storage.get("currentFeedReader");
                      provDiv.blur();
                      providers.forEach((i) => {
                        const action =
                          i.dataset.id === currentProvider.id
                            ? "add"
                            : "remove";
                        i.classList[action]("providers__item--current");
                      });
                    })();
                  },
                  (h) => {
                    el.removeEventListener("click", h);
                  }
                )
              );

              providersDiv.appendChild(el);
              return el;
            });

            stack.use(
              this.storage.subscribe(async (changes) => {
                if ("feedReaderID" in changes) {
                  const current = await this.storage.get("currentFeedReader");
                  providerIcon.src = current.favicon;
                  providerIcon.title = current.name;
                }
              })
            );
          })
        );
      }

      disconnectedCallback() {
        this.stack.dispose();
      }
    };
  }
}
