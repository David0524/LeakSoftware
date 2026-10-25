// Run by test/link-preview.test.ts as `node --conditions=react-server test/flight-metadata.mjs`,
// with {layout, page} metadata as JSON on stdin (metadataBase as a string).
//
// Resolves the metadata with Next's own code, renders its tags through React Flight the way a
// page's generateMetadata is rendered, and prints which tags Flight left out of the metadata's
// row: {"tags": [...], "deferred": [...]}, each tag named by its property, name or rel. React
// defers the rest of a row past about 3,200 bytes; on a dynamic page those deferred tags can
// arrive after <head> is sent, where Messages, Mail and Slack don't look for them.
import { createRequire } from "node:module";
import { PassThrough } from "node:stream";

const require = createRequire(import.meta.url);
const React = require("react");
const { accumulateMetadata } = require("next/dist/lib/metadata/resolve-metadata");
const { createSelectedMetadata } = require("next/dist/lib/metadata/metadata-resolution-primitives");
const { createMetadataElements } = require("next/dist/lib/metadata/metadata-elements");
const {
  renderToPipeableStream,
} = require("next/dist/compiled/react-server-dom-turbopack/server.node");

let input = "";
for await (const chunk of process.stdin) input += chunk;
const { layout, page } = JSON.parse(input);
layout.metadataBase = new URL(layout.metadataBase);

const resolved = await accumulateMetadata(
  "/r/[token]",
  [
    [layout, null],
    [page, null],
  ],
  "/r/x",
  {
    trailingSlash: false,
    isStaticMetadataRouteFile: false,
  },
);
const elements = createMetadataElements(createSelectedMetadata(resolved));
// As Next's Metadata component: async, so its tags are a row of their own.
async function Metadata() {
  return React.createElement(React.Fragment, null, elements);
}

const out = new PassThrough();
let text = "";
out.on("data", (c) => (text += c));
out.on("end", () => {
  const tagName = (props) => props.property ?? props.name ?? props.rel ?? "title";
  // Model rows only ("id:[…]"); typed rows (timing, text, imports) start with a letter.
  const rows = text
    .trim()
    .split("\n")
    .map((line) => line.slice(line.indexOf(":") + 1))
    .filter((json) => json.startsWith("[") || json.startsWith("{"))
    .map((json) => JSON.parse(json));
  const isTag = (v) => Array.isArray(v) && v[0] === "$" && ["meta", "link", "title"].includes(v[1]);
  // The metadata's row is the fragment's list of tags; every tag that's a row of its own was
  // deferred.
  const main = rows.find((r) => Array.isArray(r) && r.some(isTag)) ?? [];
  const deferred = rows.filter(isTag).map((t) => tagName(t[3]));
  const tags = elements.map((e) => tagName(e.props));
  process.stdout.write(JSON.stringify({ tags, inRow: main.filter(isTag).length, deferred }));
});
renderToPipeableStream(React.createElement(Metadata), null).pipe(out);
