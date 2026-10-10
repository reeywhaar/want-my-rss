export type FeedReader = {
  id: string;
  name: string;
  /** Shown under the name in the reader list */
  description?: string;
  link: (feed: string) => string;
  favicon: string;
};

export const FeedReaders: FeedReader[] = [
  {
    id: "feedly",
    name: "Feedly",
    link: (feed) =>
      `https://feedly.com/i/subscription/feed${encodeURIComponent(`/${feed}`)}`,
    favicon: "feedly.svg",
  },
  {
    id: "theoldreader",
    name: "The Old Reader",
    link: (feed) =>
      `https://theoldreader.com/feeds/subscribe?url=${encodeURIComponent(
        feed
      )}`,
    favicon: "theoldreader.png",
  },
  {
    id: "inoreader",
    name: "Inoreader",
    link: (feed) =>
      `https://www.inoreader.com/search/feeds/${encodeURIComponent(feed)}`,
    favicon: "inoreader.ico",
  },
  {
    id: "newsblur",
    name: "News Blur",
    link: (feed) => `https://www.newsblur.com/?url=${encodeURIComponent(feed)}`,
    favicon: "newsblur.png",
  },
  {
    id: "bazqux",
    name: "BazQux",
    link: (feed) => `https://bazqux.com/add?url=${encodeURIComponent(feed)}`,
    favicon: "bazqux.ico",
  },
  {
    id: "feedbin",
    name: "Feedbin",
    link: (feed) => `https://feedbin.me/?subscribe=${encodeURIComponent(feed)}`,
    favicon: "feedbin.ico",
  },
  {
    id: "commafeed",
    name: "CommaFeed",
    link: (feed) =>
      `https://www.commafeed.com/rest/feed/subscribe?url=${encodeURIComponent(
        feed
      )}`,
    favicon: "commafeed.ico",
  },
  {
    id: "nooshub",
    name: "Nooshub",
    link: (feed) =>
      `https://www.nooshub.com/me/feeds/new?url=${encodeURIComponent(feed)}`,
    favicon: "nooshub.ico",
  },
  {
    // Opens whichever app the system has for feed: links
    id: "system",
    name: "System",
    description: "System's default app",
    link: (feed) => `feed:${feed}`,
    favicon: "system.svg",
  },
];
