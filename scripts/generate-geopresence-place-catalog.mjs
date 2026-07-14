import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const SOURCE_URL = "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_place_national.zip";
const SOURCE_PAGE = "https://www.census.gov/geographies/reference-files/2025/geo/gazetter-file.html";
const RECORD_LAYOUT = "https://www.census.gov/programs-surveys/geography/technical-documentation/records-layout/gaz-record-layouts/gaz25-record-layouts.html";
const SOURCE_LAST_MODIFIED = "2025-09-10T17:30:11.000Z";
const SOURCE_ZIP_SHA256 = "49644173a453469d9bd77fb7a493b027f87567e209edaf2078aac7543ac2ee29";
const SOURCE_TEXT_SHA256 = "15f4977a010cc42308f4d5ddc5e19f26ef63fc035f20745333a14b78aa08d3fa";
const EXPECTED_HEADER = ["USPS", "GEOID", "GEOIDFQ", "ANSICODE", "NAME", "LSAD", "FUNCSTAT", "ALAND", "AWATER", "ALAND_SQMI", "AWATER_SQMI", "INTPTLAT", "INTPTLONG"];
const EXPECTED_SOURCE_RECORD_COUNT = 32350;
const EXPECTED_PR_RECORD_COUNT = 292;
const EXPECTED_RECORD_COUNT = 32058;

const LSAD_TYPES = Object.freeze({
  "00": "balance or place without an LSAD suffix",
  "21": "borough",
  "25": "city",
  "37": "municipality",
  "43": "town",
  "47": "village",
  "53": "city and borough",
  "57": "census-designated place (CDP)",
  CG: "consolidated government",
  CN: "corporation",
  MG: "metropolitan government",
  UC: "urban county",
  UG: "unified government"
});

const LSAD_SUFFIXES = Object.freeze({
  "21": " borough",
  "25": " city",
  "37": " municipality",
  "43": " town",
  "47": " village",
  "53": " city and borough",
  "57": " CDP",
  CG: " consolidated government",
  CN: " corporation",
  MG: " metropolitan government",
  UC: " urban county",
  UG: " unified government"
});

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const options = parseArgs(process.argv.slice(2));
const outputDirectory = resolve(options.output || resolve(root, "geopresence/data"));

const source = await loadSource(options.input);
const sourceTextSha256 = sha256(source.text);
assert(sourceTextSha256 === SOURCE_TEXT_SHA256, `Official text checksum changed: expected ${SOURCE_TEXT_SHA256}, received ${sourceTextSha256}. Review the Census source before updating the pinned checksum.`);

const { places: parsed, sourceRecordCount, excludedPuertoRicoRecords } = parsePlaces(source.text);
assert(sourceRecordCount === EXPECTED_SOURCE_RECORD_COUNT, `Expected ${EXPECTED_SOURCE_RECORD_COUNT} source records, received ${sourceRecordCount}.`);
assert(excludedPuertoRicoRecords === EXPECTED_PR_RECORD_COUNT, `Expected ${EXPECTED_PR_RECORD_COUNT} Puerto Rico records, received ${excludedPuertoRicoRecords}.`);
assert(parsed.length === EXPECTED_RECORD_COUNT, `Expected ${EXPECTED_RECORD_COUNT} non-Puerto-Rico places, received ${parsed.length}.`);

const duplicateGroups = buildDuplicateGroups(parsed);
const rows = parsed.map(place => {
  const key = duplicateKey(place.usps, place.baseName);
  const duplicateLabel = duplicateGroups.has(key)
    ? `${place.baseName} — ${LSAD_TYPES[place.lsad]} · GEOID ${place.geoid}`
    : "";
  return [place.usps, place.geoid, place.name, place.lsad, place.x, place.y, duplicateLabel];
});

validateCatalog(parsed, rows, duplicateGroups);

const data = `${JSON.stringify(rows)}\n`;
const dataSha256 = sha256(Buffer.from(data));
const floridaMidway = rows
  .filter(row => row[0] === "FL" && basePlaceName(row[2], row[3]).toLocaleLowerCase("en-US") === "midway")
  .map(row => ({ geoid: row[1], name: row[2], lsad: row[3], x: row[4], y: row[5], duplicateLabel: row[6] }));

const metadata = {
  schemaVersion: 1,
  catalog: "2025 U.S. Census National Places Gazetteer (50 states and District of Columbia)",
  source: {
    publisher: "U.S. Census Bureau",
    url: SOURCE_URL,
    landingPage: SOURCE_PAGE,
    recordLayout: RECORD_LAYOUT,
    lastModified: SOURCE_LAST_MODIFIED,
    archiveSha256: SOURCE_ZIP_SHA256,
    textSha256: SOURCE_TEXT_SHA256
  },
  filtering: {
    excludedUSPS: ["PR"],
    rationale: "GeoPresence v3 covers the 50 states and District of Columbia; Puerto Rico is outside the embedded Albers USA state geometry.",
    sourceRecordCount,
    excludedPuertoRicoRecords,
    retainedRecordCount: rows.length
  },
  projection: {
    name: "d3.geoAlbersUsa-compatible Albers USA",
    scale: 1300,
    translate: [487.5, 305],
    coordinatePrecisionDecimals: 1,
    canvas: [975, 610],
    note: "Coordinates use the same projection parameters as us-atlas states-albers-10m geometry used by GeoPresence."
  },
  rowSchema: ["USPS", "GEOID", "NAME", "LSAD", "x", "y", "duplicateLabel"],
  fieldNotes: {
    USPS: "Official two-letter state abbreviation.",
    GEOID: "Official seven-character state FIPS + place FIPS identifier; retained as a string so leading zeroes are preserved.",
    NAME: "Official Census place name, including its legal/statistical descriptor.",
    LSAD: "Official Census Legal/Statistical Area Description code; resolve through lsadTypes.",
    x: "Projected GeoPresence map x-coordinate.",
    y: "Projected GeoPresence map y-coordinate.",
    duplicateLabel: "Editor-facing disambiguation label for same-base-name records within one state; empty when the base name is unique in that state."
  },
  lsadTypes: LSAD_TYPES,
  records: {
    count: rows.length,
    jurisdictions: new Set(rows.map(row => row[0])).size,
    uniqueGeoids: new Set(rows.map(row => row[1])).size,
    duplicateBaseNameGroupsWithinState: duplicateGroups.size,
    recordsInDuplicateBaseNameGroups: [...duplicateGroups.values()].reduce((total, group) => total + group.length, 0)
  },
  duplicateHandling: {
    definition: "Two or more records in one USPS jurisdiction after removing the LSAD suffix from the official NAME and comparing the result case-insensitively.",
    labelFormat: "{base name} — {entity type} · GEOID {GEOID}",
    note: "GEOID keeps labels unique even when two places share both a base name and entity type, as the two Florida Midway CDPs do."
  },
  validation: {
    dataSha256,
    expectedRecordCount: EXPECTED_RECORD_COUNT,
    floridaMidway
  }
};

const metadataText = `${JSON.stringify(metadata, null, 2)}\n`;
const dataPath = resolve(outputDirectory, "places-2025.json");
const metadataPath = resolve(outputDirectory, "places-2025.meta.json");

if (options.check) {
  await assertFileMatches(dataPath, data);
  await assertFileMatches(metadataPath, metadataText);
  console.log(`Verified ${rows.length} places; generated data SHA-256 ${dataSha256}.`);
} else {
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(dataPath, data, "utf8");
  await writeFile(metadataPath, metadataText, "utf8");
  console.log(`Wrote ${rows.length} places to ${dataPath}`);
  console.log(`Wrote metadata to ${metadataPath}`);
  console.log(`Generated data SHA-256 ${dataSha256}`);
}

function parseArgs(args) {
  const parsed = { check: false, input: "", output: "" };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--check") parsed.check = true;
    else if (argument === "--input") parsed.input = requiredValue(args, ++index, argument);
    else if (argument === "--output") parsed.output = requiredValue(args, ++index, argument);
    else if (argument === "--help" || argument === "-h") {
      console.log("Usage: node scripts/generate-geopresence-place-catalog.mjs [--input source.zip|source.txt] [--output directory] [--check]");
      process.exit(0);
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  return parsed;
}

function requiredValue(args, index, argument) {
  const value = args[index];
  if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
  return value;
}

async function loadSource(inputPath) {
  if (inputPath) {
    const absolutePath = resolve(inputPath);
    const bytes = await readFile(absolutePath);
    if (extname(absolutePath).toLocaleLowerCase("en-US") === ".zip") {
      verifyArchiveChecksum(bytes);
      return { text: extractGazetteerText(bytes) };
    }
    return { text: bytes };
  }

  const response = await fetch(SOURCE_URL, { headers: { "user-agent": "GeoPresence-catalog-generator/1.0" } });
  assert(response.ok, `Census download failed with HTTP ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  verifyArchiveChecksum(bytes);
  return { text: extractGazetteerText(bytes) };
}

function verifyArchiveChecksum(bytes) {
  const actual = sha256(bytes);
  assert(actual === SOURCE_ZIP_SHA256, `Official ZIP checksum changed: expected ${SOURCE_ZIP_SHA256}, received ${actual}. Review the Census source before updating the pinned checksum.`);
}

function extractGazetteerText(archive) {
  const end = findEndOfCentralDirectory(archive);
  const entries = archive.readUInt16LE(end + 10);
  let cursor = archive.readUInt32LE(end + 16);

  for (let index = 0; index < entries; index += 1) {
    assert(archive.readUInt32LE(cursor) === 0x02014b50, "Invalid ZIP central-directory entry.");
    const method = archive.readUInt16LE(cursor + 10);
    const expectedCrc = archive.readUInt32LE(cursor + 16);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const uncompressedSize = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const localOffset = archive.readUInt32LE(cursor + 42);
    const name = archive.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");

    if (name.endsWith(".txt")) {
      assert(archive.readUInt32LE(localOffset) === 0x04034b50, "Invalid ZIP local-file entry.");
      const localNameLength = archive.readUInt16LE(localOffset + 26);
      const localExtraLength = archive.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = archive.subarray(start, start + compressedSize);
      const text = method === 0 ? Buffer.from(compressed) : method === 8 ? inflateRawSync(compressed) : null;
      assert(text, `Unsupported ZIP compression method ${method}.`);
      assert(text.length === uncompressedSize, `ZIP size mismatch for ${name}.`);
      assert(crc32(text) === expectedCrc, `ZIP CRC mismatch for ${name}.`);
      return text;
    }

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  throw new Error("No Gazetteer text file was found in the ZIP archive.");
}

function findEndOfCentralDirectory(archive) {
  const minimum = Math.max(0, archive.length - 65_557);
  for (let offset = archive.length - 22; offset >= minimum; offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("Invalid ZIP archive: end-of-central-directory record not found.");
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function parsePlaces(bytes) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\ufeff/, "");
  const lines = text.split(/\r?\n/);
  const header = lines.shift()?.split("|") || [];
  assert(JSON.stringify(header) === JSON.stringify(EXPECTED_HEADER), `Unexpected Gazetteer header: ${header.join("|")}`);

  const places = [];
  const geoids = new Set();
  let sourceRecordCount = 0;
  let excludedPuertoRicoRecords = 0;
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index]) continue;
    sourceRecordCount += 1;
    const fields = lines[index].split("|");
    assert(fields.length === EXPECTED_HEADER.length, `Line ${index + 2} has ${fields.length} columns; expected ${EXPECTED_HEADER.length}.`);
    const [usps, geoid, , , name, lsad, , , , , , latitudeText, longitudeText] = fields;
    if (usps === "PR") {
      excludedPuertoRicoRecords += 1;
      continue;
    }
    assert(/^[A-Z]{2}$/.test(usps), `Invalid USPS code on line ${index + 2}: ${usps}`);
    assert(/^\d{7}$/.test(geoid), `Invalid GEOID on line ${index + 2}: ${geoid}`);
    assert(!geoids.has(geoid), `Duplicate GEOID ${geoid}.`);
    assert(Object.hasOwn(LSAD_TYPES, lsad), `Unknown LSAD ${lsad} for GEOID ${geoid}.`);
    const latitude = Number(latitudeText);
    const longitude = Number(longitudeText);
    assert(Number.isFinite(latitude) && Number.isFinite(longitude), `Invalid coordinates for GEOID ${geoid}.`);
    const [rawX, rawY] = albersUsa(longitude, latitude);
    const x = Number(rawX.toFixed(1));
    const y = Number(rawY.toFixed(1));
    const baseName = basePlaceName(name, lsad);
    assert(baseName, `Empty base name for GEOID ${geoid}.`);
    geoids.add(geoid);
    places.push({ usps, geoid, name, lsad, baseName, x, y });
  }
  return { places, sourceRecordCount, excludedPuertoRicoRecords };
}

function basePlaceName(name, lsad) {
  let base = name;
  const suffix = LSAD_SUFFIXES[lsad];
  if (suffix && base.endsWith(suffix)) base = base.slice(0, -suffix.length);
  if (lsad === "00" && base.endsWith(" (balance)")) base = base.slice(0, -10);
  return base.trim();
}

function duplicateKey(usps, baseName) {
  return `${usps}|${baseName.normalize("NFKC").toLocaleLowerCase("en-US")}`;
}

function buildDuplicateGroups(places) {
  const groups = new Map();
  for (const place of places) {
    const key = duplicateKey(place.usps, place.baseName);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(place);
  }
  for (const [key, group] of groups) if (group.length < 2) groups.delete(key);
  return groups;
}

function validateCatalog(places, rows, duplicateGroups) {
  assert(new Set(rows.map(row => row[1])).size === rows.length, "Every generated record must have a unique GEOID.");
  assert(new Set(rows.map(row => row[0])).size === 51, "Expected 50 states plus District of Columbia.");
  assert(rows.every(row => row[0] !== "PR"), "Puerto Rico must not be included.");
  assert(rows.every(row => Number.isFinite(row[4]) && Number.isFinite(row[5])), "Every place must have finite projected coordinates.");
  assert(rows.every(row => row[6] === "" || duplicateGroups.has(duplicateKey(row[0], basePlaceName(row[2], row[3])))), "Disambiguation labels may only appear on duplicate base names.");
  assert([...duplicateGroups.values()].every(group => group.every(place => rows.find(row => row[1] === place.geoid)?.[6])), "Every record in a duplicate group needs a disambiguation label.");

  const floridaMidway = places.filter(place => place.usps === "FL" && place.baseName.toLocaleLowerCase("en-US") === "midway");
  assert(floridaMidway.length === 3, `Expected three Florida Midway records, received ${floridaMidway.length}.`);
  assert(new Set(floridaMidway.map(place => place.geoid)).size === 3, "Florida Midway records must retain distinct GEOIDs.");

  const huntsville = places.find(place => place.usps === "AL" && place.baseName === "Huntsville");
  assert(huntsville?.x === 670.2 && huntsville?.y === 388.2, `Projection compatibility check failed for Huntsville: ${huntsville?.x}, ${huntsville?.y}.`);
}

function albersUsa(longitude, latitude) {
  const scale = 1300;
  const translate = [487.5, 305];
  const lower48 = conicProjector({ parallels: [29.5, 45.5], rotate: 96, center: [-0.6, 38.7], scale, translate });
  const alaska = conicProjector({ parallels: [55, 65], rotate: 154, center: [-2, 58.5], scale: scale * 0.35, translate: [translate[0] - 0.307 * scale, translate[1] + 0.201 * scale] });
  const hawaii = conicProjector({ parallels: [8, 18], rotate: 157, center: [-3, 19.9], scale, translate: [translate[0] - 0.205 * scale, translate[1] + 0.212 * scale] });
  const candidates = [
    [lower48(longitude, latitude), [translate[0] - 0.455 * scale, translate[1] - 0.238 * scale, translate[0] + 0.455 * scale, translate[1] + 0.238 * scale]],
    [alaska(longitude, latitude), [translate[0] - 0.425 * scale, translate[1] + 0.120 * scale, translate[0] - 0.214 * scale, translate[1] + 0.234 * scale]],
    [hawaii(longitude, latitude), [translate[0] - 0.214 * scale, translate[1] + 0.166 * scale, translate[0] - 0.115 * scale, translate[1] + 0.234 * scale]]
  ];
  for (const [point, extent] of candidates) if (within(point, extent)) return point;
  throw new Error(`Coordinate ${longitude}, ${latitude} falls outside the Albers USA clip extents.`);
}

function conicProjector({ parallels, rotate, center, scale, translate }) {
  const radians = Math.PI / 180;
  const phi0 = parallels[0] * radians;
  const phi1 = parallels[1] * radians;
  const sy0 = Math.sin(phi0);
  const n = (sy0 + Math.sin(phi1)) / 2;
  const c = 1 + sy0 * (2 * n - sy0);
  const r0 = Math.sqrt(c) / n;

  const raw = (lambda, phi) => {
    const r = Math.sqrt(c - 2 * n * Math.sin(phi)) / n;
    return [r * Math.sin(lambda * n), r0 - r * Math.cos(lambda * n)];
  };

  const centerRaw = raw(center[0] * radians, center[1] * radians);
  return (longitude, latitude) => {
    let lambda = longitude * radians + rotate * radians;
    if (Math.abs(lambda) > Math.PI) lambda -= Math.round(lambda / (2 * Math.PI)) * 2 * Math.PI;
    const point = raw(lambda, latitude * radians);
    return [
      translate[0] + scale * (point[0] - centerRaw[0]),
      translate[1] - scale * (point[1] - centerRaw[1])
    ];
  };
}

function within([x, y], [x0, y0, x1, y1]) {
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function assertFileMatches(path, expected) {
  const actual = await readFile(path, "utf8");
  assert(actual === expected, `${path} is stale. Run the generator without --check.`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
