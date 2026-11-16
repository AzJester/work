import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = resolve(root, "assets/vendor/supabase-js-2.110.2.umd.js");
await mkdir(dirname(destination), { recursive:true });
await copyFile(resolve(root, "node_modules/@supabase/supabase-js/dist/umd/supabase.js"), destination);
await copyFile(resolve(root, "node_modules/@supabase/supabase-js/LICENSE"), resolve(root, "assets/vendor/SUPABASE-LICENSE.txt"));

const pdfDestination = resolve(root, "solutions-architect/vendor");
await mkdir(pdfDestination, { recursive: true });
await copyFile(resolve(root, "node_modules/pdfjs-dist/build/pdf.min.mjs"), resolve(pdfDestination, "pdf-6.3.289.min.mjs"));
await copyFile(resolve(root, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs"), resolve(pdfDestination, "pdf.worker-6.3.289.min.mjs"));
await copyFile(resolve(root, "node_modules/pdfjs-dist/LICENSE"), resolve(pdfDestination, "PDFJS-LICENSE.txt"));

// Topo Map Builder: MapLibre GL JS, its contour plugin, jsPDF and sql.js, each pinned in package.json.
// Every library goes in a folder named for its version, so an upgrade changes each file's address
// and a cached copy of the old one can never be paired with the new one.
// Source-map comments are dropped because the maps are not shipped.
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const pinned = name => packageJson.devDependencies[name];
const topoLibraries = [
  {
    folder: `maplibre-gl-${pinned("maplibre-gl")}`,
    files: [
      ["node_modules/maplibre-gl/dist/maplibre-gl.mjs", "maplibre-gl.mjs", true],
      ["node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "maplibre-gl-worker.mjs", true],
      ["node_modules/maplibre-gl/dist/maplibre-gl.css", "maplibre-gl.css", false],
      ["node_modules/maplibre-gl/LICENSE.txt", "LICENSE.txt", false],
    ],
  },
  {
    folder: `maplibre-contour-${pinned("maplibre-contour")}`,
    files: [
      ["node_modules/maplibre-contour/dist/index.min.js", "maplibre-contour.min.js", true],
      ["node_modules/maplibre-contour/LICENSE", "LICENSE.txt", false],
    ],
  },
  {
    folder: `jspdf-${pinned("jspdf")}`,
    files: [
      ["node_modules/jspdf/dist/jspdf.umd.min.js", "jspdf.umd.min.js", true],
      ["node_modules/jspdf/LICENSE", "LICENSE.txt", false],
    ],
  },
  {
    folder: `sql.js-${pinned("sql.js")}`,
    files: [
      ["node_modules/sql.js/dist/sql-wasm-browser.js", "sql-wasm-browser.js", true],
      ["node_modules/sql.js/dist/sql-wasm-browser.wasm", "sql-wasm-browser.wasm", false],
      ["node_modules/sql.js/LICENSE", "LICENSE.txt", false],
    ],
  },
];
for (const library of topoLibraries) {
  const destinationFolder = resolve(root, "topo/vendor", library.folder);
  await mkdir(destinationFolder, { recursive: true });
  for (const [source, name, stripSourceMap] of library.files) {
    if (stripSourceMap) {
      const text = await readFile(resolve(root, source), "utf8");
      await writeFile(resolve(destinationFolder, name), text.replace(/\n?\/\/# sourceMappingURL=\S+\s*$/, "\n"));
    } else {
      await copyFile(resolve(root, source), resolve(destinationFolder, name));
    }
  }
}
