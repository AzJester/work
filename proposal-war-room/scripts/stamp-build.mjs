// Records which sources the committed build in dist/ was made from. The repository's deploy copies dist/ as it is
// and runs no build, so tests/proposal-war-room-build.test.mjs compares this stamp with the sources and fails when
// the two have drifted apart.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** Everything that decides what the build contains. */
export const SOURCE_ROOTS = ["src", "public", "index.html", "package.json", "package-lock.json", "vite.config.ts", "tsconfig.json"];

function walk(path) {
  const stat = statSync(path);
  if (stat.isFile()) return [path];
  return readdirSync(path).sort().flatMap(name => walk(join(path, name)));
}

/** One hash over the path and bytes of every source file. Line endings are normalized so a checkout on Windows agrees. */
export function sourceHash(base = root) {
  const hash = createHash("sha256");
  const files = SOURCE_ROOTS.flatMap(entry => walk(resolve(base, entry))).sort();
  for (const file of files) {
    const name = relative(base, file).split("\\").join("/");
    const binary = /\.(woff2|png|jpg)$/.test(name);
    const bytes = readFileSync(file);
    hash.update(name).update("\0").update(binary ? bytes : bytes.toString("utf8").replace(/\r\n/g, "\n")).update("\0");
  }
  return { hash: hash.digest("hex"), files: files.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { hash, files } = sourceHash();
  writeFileSync(resolve(root, "dist/build-manifest.json"), `${JSON.stringify({ source_sha256: hash, source_files: files }, null, 2)}\n`);
  console.log(`dist/build-manifest.json: ${files} source files, ${hash.slice(0, 12)}`);
}
