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

// Strip a UTF-8 BOM if one is present. Windows PowerShell's `Set-Content
// -Encoding utf8` writes one, and JSON.parse then rejects the file with an
// error pointing at an invisible character.
const rawConfig = readFileSync('build.config.json', 'utf8').replace(/^\uFEFF/, '');
const config = JSON.parse(rawConfig);
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

/**
 * The Android download button.
 *
 * Two different elements, because a link and a disabled control are not
 * interchangeable. A link with an empty href navigates to the current page; a
 * button that pretends to be a link is not keyboard reachable in the same way.
 * So the URL lives in build.config.json and decides which element is emitted,
 * and flipping the button live is a config change plus a rebuild rather than
 * an edit inside markup.
 *
 * `latest` is the recommended tag so the URL never has to change again:
 *   https://github.com/<owner>/<repo>/releases/download/latest/apk/alex-store.apk
 */
function buildApkButton(config) {
  const icon = readFileSync(join(SRC, '_android-icon.svg'), 'utf8')
    .trim()
    .replace(/\r*\n\s*/g, ' ')
    .replace(/> <svg/g, '><svg');

  if (config.apkUrl) {
    return (
      `<a class="btn btn-download" href="${config.apkUrl}">\n` +
      `          <span class="btn__label">Download APK</span>\n` +
      `          ${icon}\n` +
      `        </a>`
    );
  }

  return (
    `<button class="btn btn-download" type="button" aria-disabled="true"\n` +
    `                title="The Android app is not available yet">\n` +
    `          <span class="btn__label">Download APK</span>\n` +
    `          ${icon}\n` +
    `        </button>`
  );
}

/** Replaces the @apk-button marker. Errors if it is missing, so a hand-edit
 *  to a source page cannot silently drop the button. */
function resolveApkButton(html, config) {
  if (!html.includes('@apk-button')) return html;
  return html.replace('<!-- @apk-button -->', buildApkButton(config));
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

  const resolved = resolveApkButton(html, config);

  if (body.includes('@apk-button') && resolved === html) {
    throw new Error(`${file}: found @apk-button but resolveApkButton did nothing`);
  }

  if (resolved.includes('{{') || resolved.includes('@apk-button')) {
    const left = resolved.match(/\{\{\w+\}\}|@apk-button/g);
    throw new Error(`${file}: placeholder never replaced: ${[...new Set(left)].join(', ')}`);
  }

  const target = join(OUT, file);
  let current = '';
  try {
    current = readFileSync(target, 'utf8').replace(/\r*\n/g, '\n');
  } catch {
    /* new file */
  }

  if (current === resolved) {
    console.log(`${file}: up to date`);
    continue;
  }
  if (check) {
    console.error(`${file}: OUT OF DATE - run: node build.mjs`);
    stale += 1;
    continue;
  }
  writeFileSync(target, resolved, 'utf8');
  console.log(`${file}: written${config.apkUrl ? ' (apk link enabled)' : ''}`);
}

if (check && stale) process.exit(1);
console.log(`\n${sources.length} pages, version ${config.version}`);