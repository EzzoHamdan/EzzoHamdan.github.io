// Post-build checks for dist/. No dependencies; run with `npm run check` after `npm run build`.
// Fails the CI build (and therefore the deploy) if any rule below is broken.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = 'dist';
const SITE = 'https://ezzohamdan.github.io';
const errors = [];
const fail = (file, msg) => errors.push(`${relative(DIST, file)}: ${msg}`);

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const files = walk(DIST);
const pages = files.filter((f) => f.endsWith('.html') && !f.startsWith(join(DIST, 'portfolio')));

/** Resolve a site path to a file in dist, the way GitHub Pages does. */
function resolves(path) {
  const clean = decodeURI(path.split(/[?#]/)[0]);
  if (clean === '' || clean === '/') return existsSync(join(DIST, 'index.html'));
  const p = join(DIST, clean);
  return existsSync(p) && statSync(p).isFile()
    ? true
    : existsSync(join(p, 'index.html')) || existsSync(`${p}.html`);
}

const attr = (html, re) => [...html.matchAll(re)].map((m) => m[1]);
const visibleText = (html) =>
  html
    .replace(/<head>[\s\S]*?<\/head>/, '')
    .replace(/<(script|style|svg)[\s\S]*?<\/\1>/g, ' ')
    .replace(/<[^>]+>/g, ' ');
// Text a person can see or hear: content plus alt/title/aria-label attributes
const humanText = (html) =>
  visibleText(html) + ' ' + attr(html, /\s(?:alt|title|aria-label)="([^"]*)"/g).join(' ');

const alternatesOf = new Map();

for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  const lang = html.match(/<html[^>]*\slang="([^"]+)"/)?.[1];
  const isRedirect = /http-equiv="refresh"/.test(html);
  if (isRedirect) continue;

  if (!lang) fail(file, 'missing <html lang>');
  if (!/<title>[^<]+<\/title>/.test(html)) fail(file, 'missing <title>');
  if (!/<meta name="description" content="[^"]+"/.test(html)) fail(file, 'missing meta description');
  if (!/<link rel="canonical" href="https:\/\/[^"]+"/.test(html)) fail(file, 'missing absolute canonical');
  const h1s = html.match(/<h1[\s>]/g)?.length ?? 0;
  if (h1s !== 1) fail(file, `expected exactly one <h1>, found ${h1s}`);

  for (const json of attr(html, /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      JSON.parse(json);
    } catch (e) {
      fail(file, `invalid JSON-LD: ${e.message}`);
    }
  }

  // Internal links and assets must exist
  for (const url of attr(html, /\s(?:href|src)="([^"]+)"/g)) {
    if (/^(https?:|mailto:|tel:|#|data:|\/\/)/.test(url)) {
      if (url.startsWith(SITE) && !resolves(url.slice(SITE.length) || '/')) fail(file, `broken link ${url}`);
      continue;
    }
    const path = url.startsWith('/') ? url : '/' + relative(DIST, join(file, '..', url));
    if (!resolves(path)) fail(file, `broken link ${url}`);
  }

  // Each language stands alone (the owner's rule): no Arabic on English pages,
  // and no English name on Arabic pages.
  const text = humanText(html);
  if (lang === 'en' && /[؀-ۿ]/.test(text)) {
    fail(file, `Arabic text on an English page: "${text.match(/\S*[؀-ۿ]+\S*/)[0]}"`);
  }
  if (lang === 'ar' && /Ezzaldeen|Hamdan/.test(text)) fail(file, 'English name on an Arabic page');

  const alternates = Object.fromEntries(
    [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]]),
  );
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  if (canonical && Object.keys(alternates).length) alternatesOf.set(canonical, alternates);
}

// hreflang must be reciprocal: if A lists B, B must list A
for (const [page, alternates] of alternatesOf) {
  for (const [lang, target] of Object.entries(alternates)) {
    if (lang === 'x-default' || target === page) continue;
    const back = alternatesOf.get(target);
    if (!back || !Object.values(back).includes(page)) errors.push(`hreflang: ${target} does not link back to ${page}`);
  }
}

// Drafts must never ship
const blogDir = 'src/content/blog';
if (existsSync(blogDir)) {
  for (const name of readdirSync(blogDir).filter((n) => n.endsWith('.md'))) {
    const isDraft = /^draft:\s*true\s*$/m.test(readFileSync(join(blogDir, name), 'utf8'));
    if (isDraft && existsSync(join(DIST, 'blog', name.replace(/\.md$/, '')))) {
      errors.push(`draft "${name}" was built into dist/blog`);
    }
  }
}

for (const required of ['robots.txt', 'sitemap.xml', 'llms.txt', 'llms-full.txt', 'og/en.png', 'og/ar.png']) {
  if (!existsSync(join(DIST, required))) errors.push(`missing ${required}`);
}

if (errors.length) {
  console.error(`✗ ${errors.length} problem(s) in dist/:\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log(`✓ dist/ passed: ${pages.length} pages checked (links, JSON-LD, hreflang, language rule, drafts)`);
