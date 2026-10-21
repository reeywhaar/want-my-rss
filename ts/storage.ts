import { Sorting } from "./sortings.js";
import { FeedReader, FeedReaders } from "./feedReaders.js";
import { ThemeLabelType } from "./themeType.js";
import { invariant } from "./invariant.js";
import { Disposable } from "./disposable.js";

const internalStorage = browser.storage.sync;

/**
 * FeedReader storage outline
 */
export type StorageFeedReader = {
  id: string;
  name: string;
  url: string;
  img: string;
};

type RawStorageProperties = {
  theme: ThemeLabelType;
  sort: Sorting;
  feedReaderID: string;
  useRelativeTime: boolean;
  customFeedReaders: StorageFeedReader[];
  redirectRequests: boolean;
  openInNewTab: boolean;
  showInAddressBar: boolean;
  hideMedia: boolean;
};

type RawStorageChange = {
  [P in keyof RawStorageProperties]?: {
    oldValue: RawStorageProperties[P];
    newValue: RawStorageProperties[P];
  };
};

const storageDefaults: RawStorageProperties = {
  theme: "auto",
  sort: "none",
  feedReaderID: FeedReaders[0].id,
  useRelativeTime: true,
  customFeedReaders: [],
  redirectRequests: true,
  openInNewTab: false,
  showInAddressBar: true,
  hideMedia: false,
};

/**
 * Raw storage wrapper around browser.storage.sync
 */
export class RawStorage {
  static async get<T extends keyof RawStorageProperties>(
    label: T
  ): Promise<RawStorageProperties[T]> {
    const val = (await internalStorage.get(label))[
      label
    ] as StorageProperties[T];
    if (typeof val === "undefined") return storageDefaults[label];
    return val;
  }

  static async getAll(): Promise<RawStorageProperties> {
    const data =
      (await internalStorage.get()) as unknown as RawStorageProperties;
    for (let key of Object.keys(storageDefaults)) {
      if (!data.hasOwnProperty(key))
        (data as any)[key] = (storageDefaults as any)[key];
    }
    return data;
  }

  static async set<T extends keyof RawStorageProperties>(
    label: T,
    value: RawStorageProperties[T]
  ): Promise<void> {
    await internalStorage.set({
      [label]: value,
    });
  }

  static subscribe(handler: (changes: RawStorageChange) => void): Disposable {
    const fn = (changes: RawStorageChange, area: string) => {
      if (area !== "sync") return;
      /** filtered changes */
      let fChanges = {} as RawStorageChange;
      for (let key of Object.keys(changes) as (keyof RawStorageProperties)[]) {
        if (changes[key]!.oldValue !== changes[key]!.newValue) {
          fChanges[key] = (changes as any)[key];
          if (!("newValue" in fChanges[key]!))
            fChanges[key]!.newValue = storageDefaults[key];
        }
      }
      handler(fChanges);
    };
    browser.storage.onChanged.addListener(fn);

    return {
      dispose() {
        browser.storage.onChanged.removeListener(fn);
      },
    };
  }

  static clear(): Promise<void> {
    return internalStorage.clear();
  }
}

function mergeReaders(readers: StorageFeedReader[]): FeedReader[] {
  const custom = readers.map((r) => {
    return {
      id: r.id,
      name: r.name,
      link: (feed: string) => buildReaderLink(r, feed),
      favicon: r.img || "./providers-icons/noname.svg",
    };
  });
  const predefined = FeedReaders.map((r) => {
    const clone = { ...r };
    clone.favicon = `./providers-icons/${r.favicon}`;
    return clone;
  });
  return [...predefined, ...custom];
}

function buildReaderLink(reader: StorageFeedReader, feed: string): string {
  let link = reader.url.replace("%s", encodeURIComponent(feed));
  link = link.replace("%r", feed);
  return link;
}

/**
 * Computed properties of Storage
 */
type StorageProperties = RawStorageProperties & {
  feedReaders: FeedReader[];
  currentFeedReader: FeedReader;
};

/**
 * Contains rawstorage with computed properties
 */
export class Storage extends RawStorage {
  static async get<T extends keyof StorageProperties>(
    label: T
  ): Promise<StorageProperties[T]> {
    if (label === "feedReaders")
      return mergeReaders(
        await super.get("customFeedReaders")
      ) as StorageProperties[T];
    if (label === "currentFeedReader") {
      const readers = await this.get("feedReaders");
      const id = await this.get("feedReaderID");
      return (readers.find((x) => x.id === id) ??
        readers.at(0) ??
        invariant("No feed readers available")) as StorageProperties[T];
    }
    return RawStorage.get(
      label as keyof RawStorageProperties
    ) as unknown as StorageProperties[T];
  }

  static async getAll(): Promise<StorageProperties> {
    const data = (await super.getAll()) as StorageProperties;
    data.feedReaders = mergeReaders(data.customFeedReaders);
    return data;
  }
}
