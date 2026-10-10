import { findParent } from "./utils.js";
import { Data as PageData } from "./pageReturnType.js";
import { Storage } from "./storage.js";

const params = new URLSearchParams(window.location.search);
const links: PageData[] = JSON.parse(params.get("links")!);
// Opened from the toolbar button, which shows it in a roomier panel
document.documentElement.dataset.button = params.get("button") ?? "addressbar";

const template = document.getElementById("item");

const types: { [key: string]: string } = {
  "application/rss+xml": "rss",
  "application/atom+xml": "atom",
  "application/json": "json",
  "application/feed+json": "json",
};

let openInNewTab: boolean = false;

Storage.get("openInNewTab").then((v) => {
  openInNewTab = v;
});

Storage.subscribe((changes) => {
  if (changes.hasOwnProperty("openInNewTab")) {
    openInNewTab = changes.openInNewTab!.newValue;
  }
});

document.addEventListener("click", (e) => {
  if (e.which !== 1 && e.which !== 2) return;
  const el = findParent(e.target as HTMLElement, ".items__item-link");
  if (!el) return;
  e.preventDefault();
  browser.runtime.sendMessage({
    action: "open-tab",
    url: browser.runtime.getURL(el.dataset.url!),
    newTab: openInNewTab || e.which === 2 || e.metaKey,
  });
});

document.addEventListener("mousedown", (e) => {
  if (e.which !== 2) return;
  const el = findParent(
    e.target as HTMLElement,
    ".items__item-link"
  ) as HTMLLinkElement;
  if (!el) return;
  el.dataset.originalHref = el.href;
  el.href = el.dataset.url!;
});

const elements = links.map((el) => {
  const content = (template as HTMLTemplateElement).content.cloneNode(
    true
  ) as HTMLElement;
  const link = content.querySelector(".items__item-link") as HTMLLinkElement;
  const extURL = browser.runtime.getURL(`show.html?url=${encodeURI(el.url)}`);
  link.href = el.url;
  link.dataset.url = extURL;
  link.innerHTML =
    (el.title || el.url) +
    (types[el.type]
      ? ` <span class="items__item-type">${types[el.type]}</span>`
      : "");
  return content;
});

const fragment = document.createDocumentFragment();
elements.forEach((el) => {
  fragment.appendChild(el);
});

document.querySelector(".items")!.appendChild(fragment);
