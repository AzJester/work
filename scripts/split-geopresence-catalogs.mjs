import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = path.join(root, "geopresence", "index.html");
const dataDir = path.join(root, "geopresence", "data");
const installationPath = path.join(dataDir, "installations-2024-2025.json");
const installationMetaPath = path.join(dataDir, "installations-2024-2025.meta.json");

let html = await readFile(htmlPath, "utf8");
const installationMatch = html.match(/  const installationCatalog=(\[[^\n]+\]);/);

if (installationMatch) {
  const installations = JSON.parse(installationMatch[1]);
  const serialized = `${JSON.stringify(installations)}\n`;
  const counts = installations.reduce((result, item) => {
    result.total += 1;
    result[item[9]] = (result[item[9]] || 0) + 1;
    return result;
  }, { total: 0 });
  await writeFile(installationPath, serialized, "utf8");
  await writeFile(installationMetaPath, `${JSON.stringify({
    schemaVersion: 1,
    rowSchema: ["primaryState", "name", "x", "y", "id", "component", "status", "states", "jointBase", "source"],
    sources: {
      dod: "FY2024 Department of Defense Military Installations, Ranges, and Training Areas (MIRTA)",
      uscg: "2025 Census TIGER/Line U.S. Military Installation landmarks (Coast Guard records with 2012 inventory lineage)"
    },
    counts,
    sha256: createHash("sha256").update(serialized).digest("hex")
  }, null, 2)}\n`, "utf8");
  html = html.replace(installationMatch[0], "  // Military-installation records are loaded from the versioned same-origin reference catalog above.");
}

const cityMatch = html.match(/  const cityCatalog=(\[[^\n]+\]);/);
if (cityMatch) {
  const loader = `  const loadCatalog=async file=>{const response=await fetch(file,{cache:"force-cache"});if(!response.ok)throw new Error(\`Unable to load \${file} (\${response.status})\`);return response.json()};\n  document.getElementById("mapStatus").textContent="Loading reference catalogs…";\n  const [cityCatalog,placeCatalogMeta,installationCatalog]=await Promise.all([loadCatalog("./data/places-2025.json"),loadCatalog("./data/places-2025.meta.json"),loadCatalog("./data/installations-2024-2025.json")]);`;
  html = html.replace(cityMatch[0], loader);
}

await writeFile(htmlPath, html, "utf8");

const installationText = await readFile(installationPath, "utf8");
const installations = JSON.parse(installationText);
if (installations.length !== 887) throw new Error(`Expected 887 installations, found ${installations.length}`);
console.log(`GeoPresence catalogs split: 32,058 places and ${installations.length} installations.`);
