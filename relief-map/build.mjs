// Assembles relief-map.html at the repository root: one self-contained file with the renderer, three.js and all map data inlined.
// The root is where the Pages workflow already publishes loose HTML files, so shipping this needs no workflow change.
// Usage: node relief-map/build.mjs [--check]
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');
const DATA = { 'd-meta': 'meta.json', 'd-height': 'height.bin', 'd-masks': 'masks.bin', 'd-slab': 'slab.bin', 'd-states': 'states.bin', 'd-lc0': 'lc0.webp', 'd-lc1': 'lc1.webp', 'd-lc2': 'lc2.webp', 'd-lc3': 'lc3.webp' };

export async function buildPage() {
  const bundle = await build({
    entryPoints: [join(root, 'src/main.js')], bundle: true, format: 'iife', minify: true, write: false, target: 'es2022', legalComments: 'none', logLevel: 'silent',
  });
  const js = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const data = Object.entries(DATA)
    .map(([id, file]) => `<script type="application/octet-stream" id="${id}">${readFileSync(join(root, 'data', file)).toString('base64')}</script>`)
    .join('\n');
  // A short fingerprint of everything that ships, so a deployment can be told apart from a cached copy of the last one.
  const stamp = createHash('sha256').update(js).update(data).update(read('src/style.css')).digest('hex').slice(0, 12);
  const html = read('src/index.template.html').replace('__BUILD__', stamp).replace('__CSS__', () => read('src/style.css')).replace('__DATA__', () => data).replace('__JS__', () => js);
  for (const token of ['__BUILD__', '__CSS__', '__DATA__', '__JS__']) if (html.includes(token)) throw new Error(`Unfilled placeholder ${token}`);
  const external = html.match(/(?:src|href)\s*=\s*["']https?:[^"']+/g);
  if (external) throw new Error(`External reference found: ${external.join(', ')}`);
  return html;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const html = await buildPage(), out = join(root, '..', 'relief-map.html');
  if (process.argv.includes('--check')) {
    if (readFileSync(out, 'utf8') !== html) { console.error('relief-map.html is out of date: run node relief-map/build.mjs'); process.exit(1); }
    console.log('relief-map.html is up to date');
  } else {
    writeFileSync(out, html);
    console.log(out, `${(html.length / 1048576).toFixed(2)} MB`);
  }
}
