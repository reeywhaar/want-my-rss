import { test } from "node:test";
import assert from "node:assert/strict";
import { FeedReaders } from "../ext/js/feedReaders.js";

const FEED = "https://example.com/feed?format=rss&lang=en";
const link = (id) => FeedReaders.find((x) => x.id === id).link(FEED);

test("system gets a feed: link with the raw feed url", () => {
  assert.equal(link("system"), `feed:${FEED}`);
});

test("inoreader goes through feed search, which finds feeds nobody follows yet", () => {
  assert.equal(link("inoreader"), `https://www.inoreader.com/search/feeds/${encodeURIComponent(FEED)}`);
});
