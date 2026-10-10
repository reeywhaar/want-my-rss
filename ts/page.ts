(function () {
  type Data = import("./pageReturnType.js").Data;

  /**
   * YouTube navigates without reloading and never updates feed links in <head>,
   * so they keep pointing to the first page loaded in the tab. Its page data
   * is kept current, so read feeds from there instead.
   *
   * Tab updates can come before YouTube swaps the page, so detection is asked
   * to run again once it says navigation has finished.
   */
  function getYouTubeFeeds(): Data[] {
    const scope = window as any;
    if (!scope.wantMyRssNavigationListener) {
      scope.wantMyRssNavigationListener = true;
      document.addEventListener("yt-navigate-finish", () => {
        browser.runtime.sendMessage({ action: "detect-feeds" });
      });
    }

    const unwrap = (el: Element | null): any =>
      (el as any)?.wrappedJSObject ?? el;
    const feeds: Data[] = [];
    const feedsUrl = "https://www.youtube.com/feeds/videos.xml";

    const browse = unwrap(
      document.querySelector("ytd-browse:not([hidden])")
    )?.data?.metadata;
    const channel = browse?.channelMetadataRenderer;
    if (channel?.rssUrl) {
      feeds.push({
        type: "application/rss+xml",
        url: channel.rssUrl,
        title: channel.title ?? null,
      });
    }

    const video = unwrap(
      document.querySelector("ytd-watch-flexy:not([hidden])")
    )?.playerData?.videoDetails;
    if (video?.channelId) {
      feeds.push({
        type: "application/rss+xml",
        url: `${feedsUrl}?channel_id=${encodeURIComponent(video.channelId)}`,
        title: video.author ?? null,
      });
    }

    // Only user playlists: mixes, liked and watch later have no feed
    const playlist = new URL(window.location.href).searchParams.get("list");
    if (playlist?.startsWith("PL")) {
      feeds.push({
        type: "application/rss+xml",
        url: `${feedsUrl}?playlist_id=${encodeURIComponent(playlist)}`,
        title: browse?.playlistMetadataRenderer?.title ?? null,
      });
    }

    return feeds;
  }

  function getAdvertisedFeeds(): Data[] {
    return Array.from(
      document.querySelectorAll(
        "link[rel*=alternate][href]:is([type*=atom],[type*=rss],[type='application/json'],[type='application/feed+json'])"
      ) as NodeListOf<HTMLLinkElement>
    ).map((el) => ({
      type: el.getAttribute("type")!,
      url: el.href,
      title: el.title || null,
    }));
  }

  const data =
    window.location.hostname === "www.youtube.com"
      ? getYouTubeFeeds()
      : getAdvertisedFeeds();

  return {
    url: window.location.href,
    data,
  } as import("./pageReturnType.js").Return;
})();
