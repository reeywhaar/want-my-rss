import { test } from "node:test";
import assert from "node:assert/strict";
import { feedActivity } from "../ext/js/activity.js";

const DAY = 24 * 60 * 60 * 1000;
const start = Date.UTC(2026, 0, 1);

/** `count` dates, `gap` ms apart, newest first like most feeds */
const every = (gap, count) =>
  Array.from({ length: count }, (_, i) => new Date(start + (count - 1 - i) * gap));

const frequency = (dates) => feedActivity(dates).frequency;

test("no dated items: nothing to show", () => {
  assert.deepEqual(feedActivity([]), { frequency: null, latest: null });
  assert.deepEqual(feedActivity([undefined, new Date("garbage")]), {
    frequency: null,
    latest: null,
  });
});

test("one dated item, or all at once: only the latest", () => {
  const date = new Date(start);
  assert.deepEqual(feedActivity([date, undefined]), { frequency: null, latest: date });
  assert.deepEqual(feedActivity([date, new Date(start)]), { frequency: null, latest: date });
});

test("latest is the newest date, whatever the order", () => {
  const dates = [new Date(start + DAY), new Date(start + 5 * DAY), new Date(start)];
  assert.equal(feedActivity(dates).latest.getTime(), start + 5 * DAY);
});

test("picks the unit that gives at least one post", () => {
  assert.equal(frequency(every(DAY / 3, 10)), "~3 posts a day");
  assert.equal(frequency(every(DAY, 10)), "~1 post a day");
  assert.equal(frequency(every(2 * DAY, 10)), "~4 posts a week");
  assert.equal(frequency(every(7 * DAY, 10)), "~1 post a week");
  assert.equal(frequency(every(10 * DAY, 10)), "~3 posts a month");
  assert.equal(frequency(every(60 * DAY, 10)), "~6 posts a year");
  assert.equal(frequency(every(365 * DAY, 4)), "~1 post a year");
  assert.equal(frequency(every(3 * 365 * DAY, 4)), "~1 post every 3 years");
});

test("ignores undated and invalid dates", () => {
  const dates = [...every(DAY, 5), undefined, new Date("garbage")];
  assert.equal(frequency(dates), "~1 post a day");
});
