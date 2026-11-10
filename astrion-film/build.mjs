// Assembles the single self-contained film file: fonts, logo, styles and script inlined, no runtime requests.
// Usage: node build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const read = p => readFileSync(join(root, p), 'utf8');
const b64 = p => readFileSync(join(root, p)).toString('base64');

const css = read('src/film.css')
  .replace('__FONT_DISPLAY__', b64('assets/archivo-display-800-78.woff2'))
  .replace('__FONT_TEXT__', b64('assets/archivo-text-400-600.woff2'))
  .replace('__FONT_MONO__', b64('assets/jetbrains-mono-500.woff2'));
const js = ['src/shader.js', 'src/film.js', 'src/score.js', 'src/player.js'].map(read).join('\n');

const html = read('src/index.template.html')
  .replace('__CSS__', () => css)
  .replace('__JS__', () => js)
  .replace('__ICON__', () => b64('assets/astrion-icon-180.png'))
  .replace('__LOGO__', () => b64('assets/astrion-logo-white.png'));

for (const token of ['__CSS__', '__JS__', '__ICON__', '__LOGO__', '__FONT_']) if (html.includes(token)) throw new Error('Unfilled placeholder ' + token);
if (/—/.test(html)) throw new Error('Em dash found in output');
const external = html.match(/(?:src|href)\s*=\s*["']https?:[^"']+|url\(\s*["']?https?:[^)]+/g);
if (external) throw new Error('External reference found: ' + external.join(', '));

const out = join(root, 'astrion-capabilities-film.html');
writeFileSync(out, html);
console.log(out, (html.length / 1024).toFixed(1) + ' KB');
