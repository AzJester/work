// Builds the standalone index.html (for GitHub Pages or any static host) from phx-twin.html.
// phx-twin.html is the page body as published to claude.ai artifacts, which wrap it in their own document skeleton.
// Run: node phx-digital-twin/tools/build_index.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (name) => fileURLToPath(new URL(`../${name}`, import.meta.url));
const MARK = '\n<div id="app">';

export function buildIndex(fragment) {
  const cut = fragment.indexOf(MARK);
  if (cut < 0) throw new Error('phx-twin.html must contain <div id="app">');
  const head = fragment.slice(0, cut).trim(), body = fragment.slice(cut + 1).trim();
  return `<!doctype html>
<!-- Generated from phx-twin.html by tools/build_index.mjs. Edit that file, then rebuild. -->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="3D digital twin of Phoenix Sky Harbor International Airport (KPHX) with live ADS-B traffic. Unofficial visualization, not for navigation or operational use.">
<meta name="theme-color" content="#081014">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font-size:14px}img{max-width:100%}[hidden]{display:none!important}</style>
${head}
</head>
<body>
${body}
</body>
</html>
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(here("index.html"), buildIndex(readFileSync(here("phx-twin.html"), "utf8")));
  console.log("wrote phx-digital-twin/index.html");
}
