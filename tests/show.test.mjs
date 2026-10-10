import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { launch, waitFor } from "./firefox.mjs";
import { serve } from "./server.mjs";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

const pages = {
  // A post every 2 days, the latest a day ago
  "/activity.rss": `<?xml version="1.0"?><rss version="2.0"><channel><title>Activity</title>
    ${[1, 3, 5, 7, 9]
      .map((days) => `<item><title>${days} days ago</title><pubDate>${new Date(now - days * DAY).toUTCString()}</pubDate></item>`)
      .join("")}
    </channel></rss>`,
};

let firefox;
let server;

before(async () => {
  server = await serve(pages);
  firefox = await launch();
}, { timeout: 60000 });

after(async () => {
  await firefox?.close();
  await server?.close();
});

/** Opens the feed preview for a path on the test server and returns what it rendered */
async function preview(path) {
  const url = `${server.url}${path}`;
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
          activity: document.querySelector(".header__activity")?.textContent.replace(/\\s+/g, " ").trim() ?? null,
          items,
          error,
        };
      })()`
    );
  return (await waitFor(read)) ?? { title: null, items: [], error: "nothing rendered" };
}

test("renders RSS with junk before the XML declaration (#7)", async () => {
  const { title, items, error } = await preview("/testdata/broken.rss");
  assert.deepEqual(
    { title, items, error },
    {
      title: "Title with html</div>",
      items: ["Title with html</b>", 'Title with quote in " it'],
      error: null,
    }
  );
});

test("renders Atom without an XML declaration (#9)", async () => {
  const { title, items, error } = await preview("/testdata/loose-atom.xml");
  assert.equal(error, null);
  assert.equal(title, "Siemens ProductCERT Security Advisories");
  assert.equal(items.length, 125);
  assert.equal(
    items[0],
    "SSA-982399 (Last Update: 2018-12-17): Missing Authentication in TIM 1531 IRC Modules"
  );
});

test("shows not found for a missing feed", async () => {
  const { items, error } = await preview("/testdata/missing.xml");
  assert.deepEqual(items, []);
  assert.equal(error, "404");
});

test("shows how often the feed posts", async () => {
  const { activity } = await preview("/activity.rss");
  assert.equal(activity, "~4 posts a week · Latest: A day ago");
});

test("no activity line without item dates", async () => {
  const { activity, items } = await preview("/testdata/loose-atom.xml");
  assert.equal(items.length, 125);
  assert.equal(activity, null);
});
