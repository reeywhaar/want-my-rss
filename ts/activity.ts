const day = 24 * 60 * 60 * 1000;

const units = [
  { name: "day", length: day },
  { name: "week", length: 7 * day },
  { name: "month", length: 30 * day },
  { name: "year", length: 365 * day },
];

export type FeedActivity = {
  /** Average posting rate, i.e "~3 posts a week" */
  frequency: string | null;
  latest: Date | null;
};

/**
 * Feeds hold only their latest items, so a count over a fixed period
 * (posts this week) says little; the average gap between items doesn't
 * depend on how many of them the feed keeps.
 */
export function feedActivity(dates: (Date | undefined)[]): FeedActivity {
  const times = dates
    .map((date) => date?.getTime())
    .filter((time): time is number => time !== undefined && !isNaN(time))
    .sort((a, b) => a - b);
  if (times.length === 0) return { frequency: null, latest: null };

  const latest = new Date(times[times.length - 1]);
  const span = times[times.length - 1] - times[0];
  if (times.length < 2 || span <= 0) return { frequency: null, latest };

  const perMs = (times.length - 1) / span;
  const unit =
    units.find((u) => perMs * u.length >= 1) ?? units[units.length - 1];
  const count = perMs * unit.length;

  // Rarer than once a year
  const every = Math.round(1 / count);
  if (every > 1) {
    return { frequency: `~1 post every ${every} ${unit.name}s`, latest };
  }
  const rounded = Math.max(1, Math.round(count));
  return {
    frequency: `~${rounded} post${rounded === 1 ? "" : "s"} a ${unit.name}`,
    latest,
  };
}
