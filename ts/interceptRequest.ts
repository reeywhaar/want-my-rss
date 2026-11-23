import { Disposable } from "./disposable.js";
import { Storage } from "./storage.js";
import { feedSchemeTarget } from "./utils.js";

/**
 * feed: links the extension opens itself, for the system's app (#85),
 * which must not be taken back to the preview
 */
const ownFeedLinks = new Set<string>();

type Handler = (message: {
  action: "open-tab";
  newTab: boolean;
  url: string;
}) => void;

(browser.runtime.onMessage.addListener as (handler: Handler) => void)(
  (message) => {
    switch (message.action) {
      case "open-tab":
        if (/^feed:/i.test(message.url)) {
          const url = message.url;
          ownFeedLinks.add(url);
          setTimeout(() => ownFeedLinks.delete(url), 10000);
        }
        if (message.newTab && message.newTab === true) {
          browser.tabs.create({ url: message.url });
        } else {
          (browser.tabs as any).update({ url: message.url });
        }
        break;
    }
  }
);

const obviousRssTypes = ["application/rss+xml", "application/atom+xml"];

const xmlTypes = [...obviousRssTypes, "application/xml", "text/xml"];

function getRedirectURL(url: string): string {
  return browser.runtime.getURL("./show.html?url=" + encodeURI(url));
}

function getRedirectObject(url: string): browser.webRequest.BlockingResponse {
  return { redirectUrl: getRedirectURL(url) };
}

/**
 * Finds if request body matches atom os rss spec
 *
 * @param body partial request body content
 */
function isFeed(body: string): boolean {
  if (body.indexOf("<feed") !== -1) return true;
  if (body.indexOf("<rss") !== -1) return true;
  if (
    body.indexOf("<rdf:RDF") !== -1 &&
    body.indexOf('xmlns="http://purl.org/rss/1.0/"') !== -1
  )
    return true;
  return false;
}

/**
 * Firefox hands feed: links to an outside app without making a request,
 * and extensions can't register for feed: (bug 1571396), but navigation to
 * them still starts, so the tab can be taken to the preview instead
 */
function feedLinkHandler(
  details: browser.webNavigation._OnBeforeNavigateDetails
) {
  // Frames load feed: links to launch apps, the page itself is left alone
  if (details.frameId !== 0) return;
  if (ownFeedLinks.delete(details.url)) return;
  const url = feedSchemeTarget(details.url);
  if (!url) return;
  browser.tabs.update(details.tabId, { url: getRedirectURL(url) });
}

class RequestInterceptor {
  intercept() {
    browser.webRequest.onHeadersReceived.addListener(
      this.handler,
      {
        types: ["main_frame"],
        urls: ["<all_urls>"],
      },
      ["blocking", "responseHeaders"]
    );
    browser.webNavigation.onBeforeNavigate.addListener(feedLinkHandler, {
      url: [{ schemes: ["feed"] }],
    });
    return {
      dispose: () => {
        browser.webRequest.onHeadersReceived.removeListener(this.handler);
        browser.webNavigation.onBeforeNavigate.removeListener(feedLinkHandler);
      },
    };
  }

  private handler(
    data: browser.webRequest._OnHeadersReceivedDetails
  ):
    | browser.webRequest.BlockingResponse
    | Promise<browser.webRequest.BlockingResponse>
    | void {
    if (
      data.originUrl &&
      data.originUrl.indexOf(browser.runtime.getURL("")) !== -1
    )
      return;
    const contentTypeHeader = data.responseHeaders!.find(
      (x) => x.name.toLocaleLowerCase() === "content-type"
    );
    if (!contentTypeHeader) return;
    const type = contentTypeHeader.value;
    if (!type) return;
    const lctype = type.toLocaleLowerCase();
    let xmlType = null;
    for (let type of xmlTypes) {
      if (lctype.includes(type)) {
        xmlType = type;
        break;
      }
    }
    if (!xmlType) return;
    if (obviousRssTypes.includes(xmlType)) return getRedirectObject(data.url);

    return new Promise((resolve) => {
      const filter = browser.webRequest.filterResponseData(data.requestId);
      const decoder = new TextDecoder();
      let reqbody = "";
      const process = (body: string) => {
        if (isFeed(body)) {
          browser.tabs.update(data.tabId, { url: getRedirectURL(data.url) });
          resolve({});
          filter.close();
        } else {
          resolve({});
          filter.disconnect();
        }
      };
      filter.ondata = (event) => {
        reqbody += decoder.decode(event.data);
        filter.write(event.data);
        if (reqbody.length > 150) process(reqbody);
      };
      filter.onstop = () => {
        process(reqbody);
      };
      filter.onerror = () => {
        process("");
      };
      filter.resume();
    });
  }
}

/**
 * Sets request interception so click on feed link
 * redirects to extension's show page
 */
export async function attach() {
  const redirectRequests = await Storage.get("redirectRequests");
  let disposable: Disposable | null = null;
  if (redirectRequests) disposable = new RequestInterceptor().intercept();

  Storage.subscribe((changes) => {
    if ("redirectRequests" in changes) {
      changes.redirectRequests!.newValue
        ? (disposable = new RequestInterceptor().intercept())
        : disposable?.dispose();
    }
  });
}
