// Launches headless Firefox with the extension installed and drives it over WebDriver BiDi.
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const EXT_DIR = resolve(import.meta.dirname, "../ext");
const ADDON_ID = "{4d567245-e70d-466a-bb2f-390fc7fb25c2}";
// Pinned so extension pages have a known moz-extension:// origin
const EXT_UUID = "0b5e2a4c-7f3d-4e8a-9c61-3d2f8a1b7e54";

const FIREFOX =
  process.env.FIREFOX_BIN ??
  (process.platform === "darwin"
    ? "/Applications/Firefox.app/Contents/MacOS/firefox"
    : "firefox");

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Polls `fn` until it returns a truthy value or the timeout passes,
 * then returns its last value.
 */
export async function waitFor(fn, { timeout = 20000, interval = 500 } = {}) {
  const end = Date.now() + timeout;
  let value;
  while (Date.now() < end) {
    value = await fn();
    if (value) return value;
    await sleep(interval);
  }
  return value;
}

/** `prefs` are extra Firefox preferences for this run */
export async function launch({ prefs: extraPrefs = {} } = {}) {
  const profile = await mkdtemp(join(tmpdir(), "wmr-firefox-"));
  const prefs = {
    "extensions.webextensions.uuids": JSON.stringify({ [ADDON_ID]: EXT_UUID }),
    "browser.shell.checkDefaultBrowser": false,
    "datareporting.policy.dataSubmissionEnabled": false,
    "toolkit.telemetry.reportingpolicy.firstRun": false,
    "browser.startup.homepage_override.mstone": "ignore",
    ...extraPrefs,
  };
  await writeFile(
    join(profile, "user.js"),
    Object.entries(prefs)
      .map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`)
      .join("\n")
  );

  // On a fresh profile Firefox may relaunch itself: the spawned process exits
  // with 0 and its replacement keeps writing to the same stderr. So the pid is
  // not ours to track; whatever runs on this profile is.
  const proc = spawn(
    FIREFOX,
    [
      "--headless", "--no-remote", "--profile", profile,
      "--remote-debugging-port", "0",
      // Lets BiDi open and script extension pages
      "--remote-allow-system-access",
    ],
    { stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, MOZ_HEADLESS: "1" } }
  );

  let ws;
  let seq = 0;
  const pending = new Map();
  const send = (method, params = {}, timeout = 15000) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method}: no response in ${timeout}ms`));
      }, timeout);
      pending.set(id, {
        resolve: (v) => (clearTimeout(timer), resolve(v)),
        reject: (e) => (clearTimeout(timer), reject(e)),
      });
      ws.send(JSON.stringify({ id, method, params }));
    });

  const close = async () => {
    if (ws?.readyState === WebSocket.OPEN) {
      await send("browser.close", {}, 5000).catch(() => {});
      ws.close();
    }
    for (let i = 0; i < 20 && running(profile); i++) await sleep(250);
    spawnSync("pkill", ["-9", "-f", profile]);
    await rm(profile, { recursive: true, force: true });
  };

  try {
    const wsUrl = await new Promise((res, rej) => {
      let err = "";
      const timer = setTimeout(() => rej(new Error(`Firefox did not start:\n${err}`)), 30000);
      proc.stderr.on("data", (chunk) => {
        err += chunk;
        const m = err.match(/WebDriver BiDi listening on (ws:\/\/\S+)/);
        if (m) {
          clearTimeout(timer);
          res(m[1]);
        }
      });
      proc.on("exit", (code) => {
        if (code === 0) return;
        clearTimeout(timer);
        rej(new Error(`Firefox exited (${code}):\n${err}`));
      });
    });

    ws = new WebSocket(`${wsUrl}/session`);
    await new Promise((res, rej) => {
      ws.addEventListener("open", res, { once: true });
      ws.addEventListener("error", () => rej(new Error(`Cannot connect to ${wsUrl}`)), { once: true });
    });
    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id === undefined || !pending.has(msg.id)) return;
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.type === "error"
        ? reject(new Error(`${msg.error}: ${msg.message}`))
        : resolve(msg.result);
    });

    await send("session.new", { capabilities: {} });
    await send("webExtension.install", {
      extensionData: { type: "path", path: EXT_DIR },
    });
  } catch (e) {
    await close();
    throw e;
  }

  /** Evaluates `expression` in a tab; it must produce a JSON-serializable value */
  const evaluate = async (context, expression) => {
    const { result, exceptionDetails } = await send("script.evaluate", {
      expression: `(async () => JSON.stringify(await (${expression})))()`,
      target: { context },
      awaitPromise: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.text);
    return result.value === undefined ? undefined : JSON.parse(result.value);
  };

  const navigate = (context, url) =>
    send("browsingContext.navigate", { context, url, wait: "complete" }, 30000);

  const newTab = async (url) => {
    const { context } = await send("browsingContext.create", { type: "tab" });
    if (url) await navigate(context, url);
    return context;
  };

  const typeText = (context, text) =>
    send("input.performActions", {
      context,
      actions: [
        {
          type: "key",
          id: "keyboard",
          actions: [...text].flatMap((value) => [
            { type: "keyDown", value },
            { type: "keyUp", value },
          ]),
        },
      ],
    });

  let extTab;
  try {
    // An extension page to call WebExtension APIs from
    extTab = await newTab(`moz-extension://${EXT_UUID}/options.html`);
  } catch (e) {
    await close();
    throw e;
  }

  /**
   * What the url bar icon offers for the tab currently showing `urlPrefix`:
   * null when the icon is hidden, otherwise the feeds from its popup.
   */
  const pageActionFeeds = (urlPrefix) =>
    evaluate(
      extTab,
      `(async () => {
        const tabs = await browser.tabs.query({});
        const tab = tabs.find((t) => t.url?.startsWith(${JSON.stringify(urlPrefix)}));
        if (!tab) throw new Error("No tab for " + ${JSON.stringify(urlPrefix)});
        if (!(await browser.pageAction.isShown({ tabId: tab.id }))) return null;
        const popup = new URL(await browser.pageAction.getPopup({ tabId: tab.id }));
        return JSON.parse(popup.searchParams.get("links"));
      })()`
    );

  /**
   * The toolbar button for the tab currently showing `urlPrefix`:
   * null when disabled, otherwise its badge and the feeds from its popup.
   */
  const toolbarButton = (urlPrefix) =>
    evaluate(
      extTab,
      `(async () => {
        const tabs = await browser.tabs.query({});
        const tab = tabs.find((t) => t.url?.startsWith(${JSON.stringify(urlPrefix)}));
        if (!tab) throw new Error("No tab for " + ${JSON.stringify(urlPrefix)});
        if (!(await browser.browserAction.isEnabled({ tabId: tab.id }))) return null;
        const popup = new URL(await browser.browserAction.getPopup({ tabId: tab.id }));
        return {
          badge: await browser.browserAction.getBadgeText({ tabId: tab.id }),
          feeds: JSON.parse(popup.searchParams.get("links")),
        };
      })()`
    );

  /** Evaluates `expression` in an extension page, with WebExtension APIs */
  const extension = (expression) => evaluate(extTab, expression);

  const extUrl = (path) => `moz-extension://${EXT_UUID}/${path}`;

  return {
    send,
    evaluate,
    newTab,
    navigate,
    typeText,
    pageActionFeeds,
    toolbarButton,
    extension,
    extUrl,
    close,
  };
}

function running(profile) {
  return spawnSync("pgrep", ["-f", profile]).status === 0;
}
