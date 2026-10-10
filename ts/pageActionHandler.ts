import { Return as PageReturn, Data as PageData } from "./pageReturnType.js";

/**
 * Sets page action (icon in url bar)
 */
function setAction(tabId: number, data: PageData[]) {
  if (data.length > 0) {
    browser.pageAction.setPopup({
      tabId,
      popup: `./popup.html?links=${encodeURIComponent(JSON.stringify(data))}`,
    });
    browser.pageAction.show(tabId);
  } else {
    browser.pageAction.hide(tabId);
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

/**
 * Sets page's action so if page contains feed links
 * the rss icon will appear in url bar
 */
export function attach(): void {
  browser.tabs
    .query({
      active: true,
    })
    .then((tabs) => {
      for (const tab of tabs) {
        tab.id && handler(tab.id);
      }
    });

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
}
