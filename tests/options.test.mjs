import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { launch, waitFor } from "./firefox.mjs";

let firefox;
let tab;

before(async () => {
  firefox = await launch();
  tab = await firefox.newTab();
}, { timeout: 60000 });

after(async () => {
  await firefox?.close();
});

const MINIFLUX = {
  id: "miniflux",
  name: "Miniflux",
  url: "https://miniflux.example.com/bookmarklet?uri=%s",
  img: "",
};

/** Opens the options page with `readers` saved as custom feed readers */
async function openOptions(readers = []) {
  await firefox.navigate(tab, firefox.extUrl("options.html"));
  await firefox.evaluate(tab, `browser.storage.sync.set({ customFeedReaders: ${JSON.stringify(readers)} })`);
  await firefox.navigate(tab, firefox.extUrl("options.html"));
  await waitFor(() => firefox.evaluate(tab, `!!document.querySelector(".feed-readers__add")`));
}

const run = (expression) => firefox.evaluate(tab, expression);
const rows = () =>
  run(`[...document.querySelectorAll(".feed-reader")].map((el) => ({
    name: el.querySelector(".feed-reader__name").textContent,
    url: el.querySelector(".feed-reader__url").textContent,
  }))`);
const saved = async () => (await run(`browser.storage.sync.get("customFeedReaders")`)).customFeedReaders;
const dialogOpen = () => run(`document.querySelector(".feed-dialog").open`);
const fill = (values) =>
  run(`(() => {
    const [name, url, img] = document.querySelectorAll(".feed-dialog .text-input");
    const set = (input, value) => {
      input.value = value;
      input.dispatchEvent(new Event("input"));
    };
    ${JSON.stringify(values)}.forEach((value, i) => value !== null && set([name, url, img][i], value));
  })()`);
const submit = () => run(`document.querySelector(".feed-dialog form").requestSubmit()`);

test("adds a feed reader through the dialog", async () => {
  await openOptions();
  assert.deepEqual(await rows(), []);

  await run(`document.querySelector(".feed-readers__add").click()`);
  assert.equal(await dialogOpen(), true);
  assert.equal(await run(`document.querySelector(".feed-dialog__title").textContent`), "Add feed reader");

  await fill(["Miniflux", "https://miniflux.example.com/bookmarklet?uri=%s", ""]);
  await submit();
  assert.equal(await dialogOpen(), false);
  await waitFor(async () => (await rows()).length === 1);
  assert.deepEqual(await rows(), [{ name: "Miniflux", url: MINIFLUX.url }]);

  const [reader] = await saved();
  assert.equal(reader.name, "Miniflux");
  assert.equal(reader.url, MINIFLUX.url);
  assert.ok(reader.id, "gets an id");

  await openOptions(await saved());
  assert.deepEqual(await rows(), [{ name: "Miniflux", url: MINIFLUX.url }], "kept after reload");
});

test("doesn't save without a name, or a url without %s or %r", async () => {
  await openOptions();
  await run(`document.querySelector(".feed-readers__add").click()`);

  await submit();
  assert.equal(await dialogOpen(), true, "empty form");

  await fill(["Miniflux", "https://miniflux.example.com/bookmarklet", ""]);
  await submit();
  assert.equal(await dialogOpen(), true, "url without a placeholder");
  assert.equal(
    await run(`document.querySelectorAll(".feed-dialog .text-input")[1].validationMessage`),
    "URL must contain %s or %r"
  );

  await fill([null, "feed:%r", null]);
  await submit();
  assert.equal(await dialogOpen(), false);
  await waitFor(async () => (await rows()).length === 1);
  assert.deepEqual(await rows(), [{ name: "Miniflux", url: "feed:%r" }]);
});

test("edits a feed reader in place", async () => {
  await openOptions([MINIFLUX, { ...MINIFLUX, id: "other", name: "Other" }]);
  await run(`document.querySelector(".feed-reader .button").click()`);
  assert.equal(await run(`document.querySelector(".feed-dialog__title").textContent`), "Edit feed reader");
  assert.equal(await run(`document.querySelector(".feed-dialog .text-input").value`), "Miniflux");

  await fill(["Miniflux (home)", null, null]);
  await submit();
  await waitFor(async () => (await saved())[0].name === "Miniflux (home)");
  assert.deepEqual(
    (await saved()).map((x) => [x.id, x.name]),
    [["miniflux", "Miniflux (home)"], ["other", "Other"]]
  );
});

test("removes a feed reader after confirming", async () => {
  await openOptions([MINIFLUX]);
  await run(`(window.confirm = () => false, document.querySelector(".feed-reader .button--danger").click())`);
  assert.equal((await saved()).length, 1, "kept when not confirmed");

  await run(`(window.confirm = () => true, document.querySelector(".feed-reader .button--danger").click())`);
  await waitFor(async () => (await rows()).length === 0);
  assert.deepEqual(await saved(), []);
});

test("closes on a backdrop click, without saving", async () => {
  await openOptions([MINIFLUX]);
  const mouse = (type, target, x, y) =>
    run(`document.querySelector(${JSON.stringify(target)}).dispatchEvent(
      new MouseEvent(${JSON.stringify(type)}, { bubbles: true, clientX: ${x}, clientY: ${y} }))`);

  await run(`document.querySelector(".feed-reader .button").click()`);
  await fill(["Changed", null, null]);

  await mouse("mousedown", ".feed-dialog .text-input", 1, 1);
  await mouse("click", ".feed-dialog", 1, 1);
  assert.equal(await dialogOpen(), true, "selection dragged out of an input");

  await mouse("mousedown", ".feed-dialog", 1, 1);
  await mouse("click", ".feed-dialog", 1, 1);
  assert.equal(await dialogOpen(), false, "click on the backdrop");
  assert.deepEqual((await saved()).map((x) => x.name), ["Miniflux"]);
});

test("turns the address bar icon off and on", async () => {
  await openOptions();
  const setting = async () => (await run(`browser.storage.sync.get("showInAddressBar")`)).showInAddressBar;
  const checkbox = `[...document.querySelectorAll(".options label")].find((x) => x.textContent === "Show feed button in address bar").querySelector("input")`;
  await waitFor(() => run(`${checkbox}.checked`));

  await run(`${checkbox}.click()`);
  await waitFor(async () => (await setting()) === false);

  await run(`${checkbox}.click()`);
  await waitFor(async () => (await setting()) === true);
});
