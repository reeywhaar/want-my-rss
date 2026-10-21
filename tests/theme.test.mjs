import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { launch, waitFor } from "./firefox.mjs";
import { serve } from "./server.mjs";

const pages = {
  "/feed.rss": `<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title>
    <item><title>Item</title></item></channel></rss>`,
};

let server;

before(async () => {
  server = await serve(pages);
});

after(async () => {
  await server?.close();
});

/** Firefox whose system theme is light or dark */
function withSystem(scheme, fn) {
  describe(`${scheme} system`, () => {
    let firefox;

    before(async () => {
      firefox = await launch({
        prefs: { "layout.css.prefers-color-scheme.content-override": scheme === "dark" ? 0 : 1 },
      });
    }, { timeout: 60000 });

    after(async () => {
      await firefox?.close();
    });

    fn(() => firefox);
  });
}

/** Opens the feed preview with `theme` saved, or none */
async function preview(firefox, theme) {
  await firefox.extension(
    theme ? `browser.storage.sync.set({ theme: "${theme}" })` : `browser.storage.sync.remove("theme")`
  );
  const tab = await firefox.newTab(firefox.extUrl(`show.html?url=${encodeURI(`${server.url}/feed.rss`)}`));
  await waitFor(() =>
    firefox.evaluate(tab, `!!document.querySelector("theme-switch")?.shadowRoot?.querySelector("[aria-checked=true]")`)
  );
  const state = () =>
    firefox.evaluate(tab, `({
      page: document.documentElement.dataset.theme,
      checked: document.querySelector("theme-switch").shadowRoot.querySelector("[aria-checked=true]").title,
      thumb: document.querySelector("theme-switch").shadowRoot.querySelector(".theme-switch").style.getPropertyValue("--index"),
    })`);
  const click = (label) =>
    firefox.evaluate(tab, `document.querySelector("theme-switch").shadowRoot.querySelector("[title=${label}]").click()`);
  const saved = async () => (await firefox.extension(`browser.storage.sync.get("theme")`)).theme;
  return { state, click, saved };
}

withSystem("light", (firefox) => {
  test("auto by default, following the system", async () => {
    const { state } = await preview(firefox());
    assert.deepEqual(await state(), { page: "day", checked: "Auto", thumb: "0" });
  });

  test("light and dark are picked and saved", async () => {
    const { state, click, saved } = await preview(firefox());

    await click("Dark");
    await waitFor(async () => (await state()).page === "night");
    assert.deepEqual(await state(), { page: "night", checked: "Dark", thumb: "2" });
    assert.equal(await saved(), "night");

    await click("Light");
    await waitFor(async () => (await state()).page === "day");
    assert.deepEqual(await state(), { page: "day", checked: "Light", thumb: "1" });
    assert.equal(await saved(), "day");

    await click("Auto");
    await waitFor(async () => (await saved()) === "auto");
    assert.deepEqual(await state(), { page: "day", checked: "Auto", thumb: "0" });
  });

  test("keeps themes saved before auto existed", async () => {
    assert.deepEqual(await (await preview(firefox(), "night")).state(), { page: "night", checked: "Dark", thumb: "2" });
    assert.deepEqual(await (await preview(firefox(), "day")).state(), { page: "day", checked: "Light", thumb: "1" });
  });
});

withSystem("dark", (firefox) => {
  test("auto follows a dark system", async () => {
    const { state } = await preview(firefox());
    assert.deepEqual(await state(), { page: "night", checked: "Auto", thumb: "0" });
  });

  test("light still wins over a dark system", async () => {
    const { state } = await preview(firefox(), "day");
    assert.deepEqual(await state(), { page: "day", checked: "Light", thumb: "1" });
  });
});
