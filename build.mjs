/* ==========================================================================
   Static build

   Regenerates the storefront HTML in the repo root from src/ + src/_layout.html.

   Why this exists: the header, nav, search dialog, footer and script tags were
   hand-copied into six pages. Measured, that was ~414 lines maintained in six
   places, so adding a nav item meant six edits and the cache buster had to be
   bumped seven times by hand. This removes all of it.

   Deliberately zero dependencies. Node's standard library only - no package
   manager, no lockfile, no node_modules. The generated files are plain HTML
   and are committed, so GitHub Pages keeps serving them from a branch with no
   build step at all. Next.js was considered and rejected: Pages can only host
   a static export, which forfeits the server features that justify it.

   Usage:  node build.mjs           regenerate the root HTML
           node build.mjs --check   fail if the root is out of date (for CI)

   Bump `version` in build.config.json whenever you change any .js or .css, or
   returning visitors keep the old file.
   ========================================================================== */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const config = JSON.parse(readFileSync('build.config.json', 'utf8'));
const SRC = 'src';
const OUT = '.';

const NAV_LINKS = [
  { href: './shop.html', label: 'Products', key: 'shop' },
  { href: './collections.html', label: 'Collections', key: 'collections' },
  { href: './journal.html', label: 'Journal', key: 'journal' },
  { href: './about.html', label: 'About', key: 'about' },
];

/** Reads the `key: value` block from an HTML comment at the top of a source file. */
function frontMatter(source) {
  const block = source.match(/^<!--([\s\S]*?)-->/);
  if (!block) throw new Error('missing front matter');
  const meta = {};
  for (const line of block[1].split('\n')) {
    const m = line.match(/^\s{2}(\w+):\s*(.+?)\s*$/);
    if (m) meta[m[1]] = m[2];
  }
  return { meta, body: source.slice(block[0].length).replace(/^\n+/, '') };
}

/** Builds the nav, marking the item that corresponds to this page. */
function buildNav(currentKey) {
  return NAV_LINKS.map((link) => {
    const current = link.key === currentKey ? ' aria-current="page"' : '';
    return `      <a href="${link.href}"${current}>${link.label}</a>`;
  }).join('\n');
}

const layout = readFileSync(join(SRC, '_layout.html'), 'utf8').replace(/\r*\n/g, '\n');

const sources = readdirSync(SRC)
  .filter((f) => f.endsWith('.html') && !f.startsWith('_'))
  .sort();

const check = process.argv.includes('--check');
let stale = 0;

for (const file of sources) {
  const name = file.replace(/\.html$/, '');
  const { meta, body } = frontMatter(readFileSync(join(SRC, file), 'utf8').replace(/\r*\n/g, '\n'));

  if (!meta.page || !meta.title || !meta.description) {
    throw new Error(`${file}: front matter needs page, title and description`);
  }

  // The page module follows the page name, except the home page.
  const pageScript = meta.page === 'index' ? 'app.js' : `${meta.page}.js`;

  const html = layout
    .replace(/\{\{title\}\}/g, meta.title)
    .replace(/\{\{description\}\}/g, meta.description)
    .replace(/\{\{nav\}\}/g, buildNav(meta.page))
    .replace(/\{\{content\}\}/g, body.trimEnd())
    .replace(/\{\{page_script\}\}/g, pageScript)
    .replace(/\{\{version\}\}/g, config.version);

  if (html.includes('{{')) {
    const left = html.match(/\{\{\w+\}\}/g);
    throw new Error(`${file}: layout placeholder never replaced: ${[...new Set(left)].join(', ')}`);
  }

  const target = join(OUT, file);
  let current = '';
  try {
    current = readFileSync(target, 'utf8').replace(/\r*\n/g, '\n');
  } catch {
    /* new file */
  }

  if (current === html) {
    console.log(`${file}: up to date`);
    continue;
  }
  if (check) {
    console.error(`${file}: OUT OF DATE - run: node build.mjs`);
    stale += 1;
    continue;
  }
  writeFileSync(target, html, 'utf8');
  console.log(`${file}: written`);
}

if (check && stale) process.exit(1);
console.log(`\n${sources.length} pages, version ${config.version}`);