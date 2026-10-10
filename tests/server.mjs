// Serves inline pages and the files in testdata/ (under /testdata/) on a random local port.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const TESTDATA = resolve(import.meta.dirname, "../testdata");
const TYPES = {
  ".html": "text/html",
  ".rss": "application/rss+xml",
  ".xml": "application/xml",
  ".json": "application/json",
};

export async function serve(pages = {}) {
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, "http://localhost").pathname;
    let body = pages[path];
    if (body === undefined && path.startsWith("/testdata/")) {
      const file = resolve(TESTDATA, "." + path.slice("/testdata".length));
      if (file.startsWith(TESTDATA + sep)) {
        body = await readFile(file).catch(() => undefined);
      }
    }
    if (body === undefined) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": TYPES[extname(path)] ?? "text/html" });
    res.end(body);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () =>
      new Promise((r) => {
        server.close(r);
        server.closeAllConnections();
      }),
  };
}
