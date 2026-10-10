import { Return as PageReturn, Data as PageData } from "./pageReturnType.js";
import { Storage } from "./storage.js";

/**
 * Shows the page's feeds on the toolbar button and, unless the user
 * turned it off, on the icon in url bar
 */
async function setAction(tabId: number, data: PageData[]) {
  const inAddressBar = await Storage.get("showInAddressBar");
  const popup = `./popup.html?links=${encodeURIComponent(JSON.stringify(data))}`;
  const found = data.length > 0;

  if (inAddressBar && found) {
    browser.pageAction.setPopup({ tabId, popup });
    browser.pageAction.show(tabId);
  } else {
    browser.pageAction.hide(tabId);
  }

  if (found) {
    browser.browserAction.setPopup({ tabId, popup });
    browser.browserAction.setBadgeText({ tabId, text: `${data.length}` });
    browser.browserAction.enable(tabId);
  } else {
    browser.browserAction.setBadgeText({ tabId, text: "" });
    browser.browserAction.disable(tabId);
  }
}

/**
 *
 * @param id tab id
 */
const handler = async (id: number) => {
  browser.pageAction.hide(id);
  browser.tabs
    .executeScript(id, {
      file: "./js/page.js",
      runAt: "document_end",
    })
    .then((x: object[]) => {
      setAction(id, (x[0] as PageReturn).data);
    })
    .catch(() => {
      setAction(id, []);
    });
};

const handleActiveTabs = () =>
  browser.tabs
    .query({
      active: true,
    })
    .then((tabs) => {
      for (const tab of tabs) {
        tab.id && handler(tab.id);
      }
    });

/**
 * Sets page's action so if page contains feed links
 * the rss icon will appear in url bar, or on the toolbar button
 */
export function attach(): void {
  // Enabled per tab, only where feeds are found
  browser.browserAction.disable();
  browser.browserAction.setBadgeBackgroundColor({ color: "#5b5b66" });
  browser.browserAction.setBadgeTextColor({ color: "#fff" });

  handleActiveTabs();

  browser.tabs.onActivated.addListener((info) => handler(info.tabId));
  browser.tabs.onUpdated.addListener((id) => handler(id));
  // Sent by page script on sites that navigate without reloading
  browser.runtime.onMessage.addListener(
    (message: { action?: string }, sender: browser.runtime.MessageSender) => {
      if (message.action === "detect-feeds" && sender.tab?.id !== undefined) {
        handler(sender.tab.id);
      }
    }
  );
  // Other tabs catch up when activated
  Storage.subscribe((changes) => {
    if ("showInAddressBar" in changes) handleActiveTabs();
  });
}
