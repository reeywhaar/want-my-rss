import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { launch, waitFor } from "./firefox.mjs";
import { serve } from "./server.mjs";

let firefox;
let server;

before(async () => {
  server = await serve();
  firefox = await launch();
}, { timeout: 60000 });

after(async () => {
  await firefox?.close();
  await server?.close();
});

/** Opens the feed preview for a file in testdata/ and returns what it rendered */
async function preview(file) {
  const url = `${server.url}/testdata/${file}`;
  const tab = await firefox.newTab(firefox.extUrl(`show.html?url=${encodeURI(url)}`));
  const read = () =>
    firefox.evaluate(
      tab,
      `(() => {
        const items = [...document.querySelectorAll("#items > .item")]
          .sort((a, b) => a.dataset.index - b.dataset.index)
          .map((el) => el.querySelector(".item__title").textContent.trim());
        const error = document.querySelector("body > div > div > h1")?.textContent ?? null;
        if (!items.length && !error) return null;
        return {
          title: document.querySelector(".header__title")?.textContent.trim() ?? null,
          items,
          error,
        };
      })()`
    );
  return (await waitFor(read)) ?? { title: null, items: [], error: "nothing rendered" };
}

test("renders RSS with junk before the XML declaration (#7)", async () => {
  assert.deepEqual(await preview("broken.rss"), {
    title: "Title with html</div>",
    items: ["Title with html</b>", 'Title with quote in " it'],
    error: null,
  });
});

test("renders Atom without an XML declaration (#9)", async () => {
  const { title, items, error } = await preview("loose-atom.xml");
  assert.equal(error, null);
  assert.equal(title, "Siemens ProductCERT Security Advisories");
  assert.equal(items.length, 125);
  assert.equal(
    items[0],
    "SSA-982399 (Last Update: 2018-12-17): Missing Authentication in TIM 1531 IRC Modules"
  );
});

test("shows not found for a missing feed", async () => {
  const { items, error } = await preview("missing.xml");
  assert.deepEqual(items, []);
  assert.equal(error, "404");
});
