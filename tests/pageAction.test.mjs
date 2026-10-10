import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { launch, sleep, waitFor } from "./firefox.mjs";
import { serve } from "./server.mjs";

const pages = {
  "/feeds.html": `<!doctype html><html><head><title>Feeds</title>
    <link rel="alternate" type="application/rss+xml" title="Posts" href="/rss.xml">
    <link rel="alternate" type="application/atom+xml" href="/atom.xml">
    <link rel="alternate" type="text/html" href="/other.html">
    </head><body>Feeds</body></html>`,
  "/no-feeds.html": `<!doctype html><html><head><title>No feeds</title></head><body>No feeds</body></html>`,
};

let firefox;
let server;
let base;

before(async () => {
  server = await serve(pages);
  base = server.url;
  firefox = await launch();
}, { timeout: 60000 });

after(async () => {
  await firefox?.close();
  await server?.close();
});

test("shows feeds the page advertises", async () => {
  await firefox.newTab(`${base}/feeds.html`);
  const feeds = await waitFor(() => firefox.pageActionFeeds(`${base}/feeds.html`));
  assert.deepEqual(feeds, [
    { type: "application/rss+xml", url: `${base}/rss.xml`, title: "Posts" },
    { type: "application/atom+xml", url: `${base}/atom.xml`, title: null },
  ]);
});

test("shows every feed testdata/index.html links, even broken ones", async () => {
  await firefox.newTab(`${base}/testdata/index.html`);
  const feeds = await waitFor(() => firefox.pageActionFeeds(`${base}/testdata/index.html`));
  assert.deepEqual(feeds, [
    { type: "application/rss+xml", url: `${base}/testdata/broken.rss`, title: null },
    { type: "application/atom+xml", url: `${base}/testdata/loose-atom.xml`, title: null },
    { type: "application/rss+xml", url: `${base}/testdata/missing.xml`, title: null },
    { type: "application/json", url: `${base}/testdata/broken.json`, title: null },
  ]);
});

test("hides the icon when the page has no feeds", async () => {
  await firefox.newTab(`${base}/no-feeds.html`);
  await sleep(2000);
  assert.equal(await firefox.pageActionFeeds(`${base}/no-feeds.html`), null);
});

test("youtube: feed follows in-app navigation", { timeout: 90000 }, async () => {
  const MKBHD = "https://www.youtube.com/feeds/videos.xml?channel_id=UCBJycsmduvYEL83R_U4JriQ";
  const VERITASIUM = "https://www.youtube.com/feeds/videos.xml?channel_id=UCHnyfMqiRRG1u-2MsSQLbXA";
  const youtubeFeedUrls = async () =>
    (await firefox.pageActionFeeds("https://www.youtube.com/"))?.map((f) => f.url) ?? [];
  // Detection hides the icon before each run, so require the result to hold for a second.
  // Resolves to the expected urls, or to what was there last when they never showed up.
  const waitForFeeds = async (expected) => {
    let last;
    const matches = async () => {
      last = await youtubeFeedUrls();
      return JSON.stringify(last) === JSON.stringify(expected);
    };
    const ok = await waitFor(async () => {
      if (!(await matches())) return false;
      await sleep(1000);
      return matches();
    });
    return ok ? expected : { url: await firefox.evaluate(tab, "location.href"), feeds: last };
  };

  let tab;
  tab = await firefox.newTab("https://www.youtube.com/@mkbhd");
  assert.deepEqual(await waitForFeeds([MKBHD]), [MKBHD], "fresh load of a channel");

  // Search, then open another channel, all without reloading the page
  await firefox.evaluate(tab, `(window.__wmrNoReload = true, document.querySelector("input[name=search_query]").focus())`);
  await firefox.typeText(tab, "veritasium");
  await waitFor(() => firefox.evaluate(tab, `location.pathname === "/results"`));
  assert.deepEqual(await waitForFeeds([]), [], "search results have no feed");

  await waitFor(() => firefox.evaluate(tab, `!!document.querySelector("ytd-channel-renderer a[href^='/@']")`));
  await firefox.evaluate(tab, `document.querySelector("ytd-channel-renderer a[href^='/@']").click()`);
  assert.deepEqual(await waitForFeeds([VERITASIUM]), [VERITASIUM], "other channel opened in-app");

  await waitFor(() => firefox.evaluate(tab, `!!document.querySelector("ytd-browse:not([hidden]) a[href^='/watch']")`));
  await firefox.evaluate(tab, `document.querySelector("ytd-browse:not([hidden]) a[href^='/watch']").click()`);
  assert.deepEqual(await waitForFeeds([VERITASIUM]), [VERITASIUM], "video of that channel opened in-app");
  assert.match(await firefox.evaluate(tab, "location.pathname"), /^\/watch/);

  assert.equal(await firefox.evaluate(tab, "window.__wmrNoReload === true"), true, "page never reloaded");
});
