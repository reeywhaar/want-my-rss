import { randomInt } from "./utils.js";
import { Storage, StorageFeedReader } from "./storage.js";

/**
 * generates id for new feed
 */
function randomID(): string {
  return btoa(randomInt(100000000000, 999999999999).toString());
}

function TextInput({
  value = "",
  className = "",
}: { value?: string; className?: string } = {}): HTMLInputElement {
  const el = document.createElement("input");
  el.className = "text-input " + className;
  el.type = "text";
  el.value = value;
  return el;
}

type ImagePlaceholderElement = HTMLElement & {
  setURL: (url: string) => void;
};

function ImagePlaceholder({
  url = "",
  className = "",
}: { url?: string; className?: string } = {}): ImagePlaceholderElement {
  const el = document.createElement(
    "div"
  ) as unknown as ImagePlaceholderElement;
  el.className = "image-placeholder " + className;
  const img = document.createElement("img");
  img.className = "image-placeholder__img";
  img.src = url;
  el.appendChild(img);
  el.setURL = (url) => {
    img.src = url || "./providers-icons/noname.svg";
  };
  return el;
}

type FeedReaderDialogElement = HTMLDialogElement & {
  /** Opens the dialog, empty for a new reader or filled with one to edit */
  edit: (reader?: StorageFeedReader) => void;
};

function FeedReaderDialog({
  onSave,
}: {
  onSave: (reader: StorageFeedReader) => void;
}): FeedReaderDialogElement {
  const dialog = document.createElement(
    "dialog"
  ) as FeedReaderDialogElement;
  dialog.className = "feed-dialog";

  const form = document.createElement("form");
  form.method = "dialog";
  dialog.appendChild(form);

  const title = document.createElement("h2");
  title.className = "feed-dialog__title";
  form.appendChild(title);

  const Field = (label: string, input: HTMLElement, ...rest: HTMLElement[]) => {
    const el = document.createElement("label");
    el.className = "feed-dialog__field";
    const span = document.createElement("span");
    span.className = "feed-dialog__label";
    span.textContent = label;
    el.append(span, input, ...rest);
    form.appendChild(el);
  };

  const e_name = TextInput({ className: "feed-dialog__input" });
  e_name.placeholder = "My reader";
  e_name.required = true;
  Field("Name", e_name);

  const e_url = TextInput({ className: "feed-dialog__input" });
  e_url.placeholder = "https://examplereader.com/?sub=%s";
  e_url.required = true;
  const help = document.createElement("span");
  help.className = "feed-dialog__help";
  help.innerHTML =
    "<code>%s</code> is replaced with the escaped feed url, <code>%r</code> with the raw one";
  Field("Subscribe URL", e_url, help);

  const favicon = document.createElement("div");
  favicon.className = "feed-dialog__favicon";
  const e_img = ImagePlaceholder({ className: "feed-dialog__img" });
  const e_imgurl = TextInput({ className: "feed-dialog__input" });
  e_imgurl.placeholder = "https://examplereader.com/favicon.ico";
  favicon.append(e_img, e_imgurl);
  Field("Favicon URL", favicon);

  const buttons = document.createElement("div");
  buttons.className = "feed-dialog__buttons";
  form.appendChild(buttons);

  const e_cancel = document.createElement("button");
  e_cancel.type = "button";
  e_cancel.className = "button";
  e_cancel.textContent = "Cancel";
  e_cancel.addEventListener("click", () => dialog.close());
  buttons.appendChild(e_cancel);

  const e_save = document.createElement("button");
  e_save.type = "submit";
  e_save.className = "button button--primary";
  e_save.textContent = "Save";
  buttons.appendChild(e_save);

  const validateURL = () => {
    const url = e_url.value.trim();
    e_url.setCustomValidity(
      url && !/%[sr]/.test(url) ? "URL must contain %s or %r" : ""
    );
  };
  e_url.addEventListener("input", validateURL);
  e_imgurl.addEventListener("input", () => e_img.setURL(e_imgurl.value));

  // Close on a click on the backdrop. Both ends of the click have to be there,
  // so a text selection dragged out of an input doesn't close it.
  const onBackdrop = (e: MouseEvent) => {
    if (e.target !== dialog) return false;
    const rect = dialog.getBoundingClientRect();
    return (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    );
  };
  let pressedOnBackdrop = false;
  dialog.addEventListener("mousedown", (e) => {
    pressedOnBackdrop = onBackdrop(e);
  });
  dialog.addEventListener("click", (e) => {
    if (pressedOnBackdrop && onBackdrop(e)) dialog.close();
    pressedOnBackdrop = false;
  });

  let id = "";

  form.addEventListener("submit", () => {
    onSave({
      id,
      name: e_name.value.trim(),
      url: e_url.value.trim(),
      img: e_imgurl.value.trim(),
    });
  });

  dialog.edit = (reader) => {
    id = reader?.id ?? "";
    title.textContent = reader ? "Edit feed reader" : "Add feed reader";
    e_name.value = reader?.name ?? "";
    e_url.value = reader?.url ?? "";
    e_imgurl.value = reader?.img ?? "";
    e_img.setURL(e_imgurl.value);
    validateURL();
    dialog.showModal();
  };

  return dialog;
}

function FeedReaderRow({
  reader,
  onEdit,
  onRemove,
}: {
  reader: StorageFeedReader;
  onEdit: () => void;
  onRemove: () => void;
}): HTMLElement {
  const el = document.createElement("div");
  el.className = "feed-reader";

  el.appendChild(
    ImagePlaceholder({
      url: reader.img || "./providers-icons/noname.svg",
      className: "feed-reader__img",
    })
  );

  const info = document.createElement("div");
  info.className = "feed-reader__info";
  el.appendChild(info);

  const name = document.createElement("div");
  name.className = "feed-reader__name";
  name.textContent = reader.name;
  info.appendChild(name);

  const url = document.createElement("div");
  url.className = "feed-reader__url";
  url.textContent = reader.url;
  url.title = reader.url;
  info.appendChild(url);

  const edit = document.createElement("button");
  edit.className = "button";
  edit.textContent = "Edit";
  edit.addEventListener("click", onEdit);
  el.appendChild(edit);

  const remove = document.createElement("button");
  remove.className = "button button--danger";
  remove.textContent = "Remove";
  remove.addEventListener("click", onRemove);
  el.appendChild(remove);

  return el;
}

function CustomFeedReaders({
  readers,
}: {
  readers: StorageFeedReader[];
}): HTMLElement {
  const root = document.createElement("div");
  root.className = "feed-readers";

  const header = document.createElement("h1");
  header.textContent = "Custom Feeds";
  root.appendChild(header);

  const list = document.createElement("div");
  list.className = "feed-readers__list";
  root.appendChild(list);

  const save = async (items: StorageFeedReader[]) => {
    readers = items;
    await Storage.set("customFeedReaders", readers);
    render();
  };

  const dialog = FeedReaderDialog({
    onSave: (reader) => {
      if (reader.id) {
        save(readers.map((x) => (x.id === reader.id ? reader : x)));
        return;
      }
      const ids = readers.map((x) => x.id);
      let id = randomID();
      while (ids.includes(id)) id = randomID();
      save([...readers, { ...reader, id }]);
    },
  });
  root.appendChild(dialog);

  const render = () => {
    list.replaceChildren(
      ...readers.map((reader) =>
        FeedReaderRow({
          reader,
          onEdit: () => dialog.edit(reader),
          onRemove: () => {
            if (!confirm(`Remove ${reader.name}?`)) return;
            save(readers.filter((x) => x.id !== reader.id));
          },
        })
      )
    );
  };
  render();

  const add = document.createElement("button");
  add.className = "button button--primary feed-readers__add";
  add.textContent = "Add feed reader";
  add.addEventListener("click", () => dialog.edit());
  root.appendChild(add);

  return root;
}

function AdditionalControls({ className = "" }: { className?: string } = {}) {
  const root = document.createElement("div");
  root.className = "options " + className;

  const header = document.createElement("h1");
  header.textContent = "Additional Options";
  root.appendChild(header);

  const interceptLabel = (() => {
    const div = document.createElement("div");
    const label = document.createElement("label");
    label.title = "Redirect url which look like feeds to show page";
    div.appendChild(label);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    Storage.get("redirectRequests").then((val) => (checkbox.checked = val));
    label.appendChild(checkbox);
    checkbox.addEventListener("change", () => {
      Storage.set("redirectRequests", checkbox.checked);
    });

    const span = document.createElement("span");
    span.textContent = "Intercept requests";
    label.appendChild(span);

    return div;
  })();
  root.appendChild(interceptLabel);

  const newTabLabel = (() => {
    const div = document.createElement("div");
    const label = document.createElement("label");
    label.title = "Open links to feeds in popup in new tab";
    div.appendChild(label);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    Storage.get("openInNewTab").then((val) => (checkbox.checked = val));
    label.appendChild(checkbox);
    checkbox.addEventListener("change", () => {
      Storage.set("openInNewTab", checkbox.checked);
    });

    const span = document.createElement("span");
    span.textContent = "Open popup feeds in new tab";
    label.appendChild(span);

    return div;
  })();
  root.appendChild(newTabLabel);

  const resetButton = document.createElement("button");
  resetButton.className = "button button--danger options__reset-button";
  resetButton.textContent = "Reset";
  resetButton.title = "Reset all options, and remove all custom feed readers";
  resetButton.addEventListener("click", () => {
    if (!confirm("Are you sure you want to reset all settings?")) return;
    Storage.clear();
    location.reload();
  });
  root.appendChild(resetButton);

  return root;
}

async function main() {
  const readers = await Storage.get("customFeedReaders");
  document.body.appendChild(CustomFeedReaders({ readers }));
  document.body.appendChild(AdditionalControls());
}

main().catch((e) => {
  console.error(e);
});
