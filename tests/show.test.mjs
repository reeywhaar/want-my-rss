import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { launch, sleep, waitFor } from "./firefox.mjs";
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
  // A 1x1 png, and a feed whose items show it in all the ways a feed can
  pages["/pixel.png"] = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64"
  );
  pages["/media.rss"] = `<?xml version="1.0"?><rss version="2.0"><channel><title>Media</title>
    <item><title>With media</title>
      <description><![CDATA[<p>Text <img src="${server.url}/pixel.png?inline"></p>
        <a href="${server.url}/elsewhere"><img src="${server.url}/pixel.png?linked"></a>
        <figure><img src="${server.url}/pixel.png?figure"><figcaption>Caption</figcaption></figure>]]></description>
    </item></channel></rss>`;
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
  return { tab, ...((await waitFor(read)) ?? { title: null, items: [], error: "nothing rendered" }) };
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

test("hides media behind placeholders, loading it only when asked", async () => {
  await firefox.extension(`browser.storage.sync.set({ hideMedia: true })`);
  try {
    const { tab } = await preview("/media.rss");
    const media = () =>
      firefox.evaluate(tab, `({
        images: document.querySelectorAll("#items img").length,
        placeholders: document.querySelectorAll("#items .media-placeholder").length,
      })`);
    const loaded = () => server.requests.filter((x) => x.startsWith("/pixel.png")).sort();

    await waitFor(async () => (await media()).placeholders === 3);
    assert.deepEqual(await media(), { images: 0, placeholders: 3 });
    await sleep(500);
    assert.deepEqual(loaded(), [], "nothing hidden was downloaded");
    assert.equal(
      await firefox.evaluate(tab, `document.querySelector("figcaption")?.textContent`),
      "Caption",
      "text around media stays"
    );

    // The one in a link shows up instead of following the link
    await firefox.evaluate(tab, `document.querySelector("#items a .media-placeholder").click()`);
    assert.deepEqual(await media(), { images: 1, placeholders: 2 });
    assert.match(await firefox.evaluate(tab, "location.href"), /show\.html/);
    await waitFor(() => loaded().length === 1);
    assert.deepEqual(loaded(), ["/pixel.png?linked"]);

    // Turning it off in preferences brings back the rest
    await firefox.extension(`browser.storage.sync.set({ hideMedia: false })`);
    await waitFor(async () => (await media()).placeholders === 0);
    assert.deepEqual(await media(), { images: 3, placeholders: 0 });
  } finally {
    await firefox.extension(`browser.storage.sync.remove("hideMedia")`);
  }
});

test("markup in the feed url stays text", async () => {
  // Any site can send a user here: clicking a feed link redirects to the preview
  const payload = (name) => `?x="><b id="pwned">BOLD</b><img src="${server.url}/pwned-${name}.png">`;
  const injected = (tab) => firefox.evaluate(tab, `!!document.querySelector("#pwned, img[src*=pwned]")`);
  const loaded = () => server.requests.filter((x) => x.startsWith("/pwned"));

  const missing = `${server.url}/missing${payload("404")}`;
  const notFound = await preview(`/missing${payload("404")}`);
  assert.equal(notFound.error, "404");
  assert.equal(await injected(notFound.tab), false, "404 page");
  assert.equal(
    await firefox.evaluate(notFound.tab, `document.querySelector("body > div a").textContent`),
    missing
  );

  const feed = `${server.url}/activity.rss${payload("render")}`;
  const rendered = await preview(`/activity.rss${payload("render")}`);
  assert.equal(rendered.error, null);
  assert.equal(await injected(rendered.tab), false, "feed preview");
  assert.equal(
    await firefox.evaluate(rendered.tab, `document.querySelector("subscribe-button").getAttribute("link")`),
    feed,
    "subscribe still gets the real url"
  );

  await sleep(500);
  assert.deepEqual(loaded(), []);
});
