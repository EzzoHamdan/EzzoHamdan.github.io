// Builds src/data/sky.json from the d3-celestial catalog (BSD-3-Clause, © 2015 Olaf Frohn;
// star data from Hipparcos and the Yale Bright Star Catalog). Run once, commit the output:
//
//   curl -LO https://cdn.jsdelivr.net/gh/ofrohn/d3-celestial@master/data/stars.6.json
//   curl -LO https://cdn.jsdelivr.net/gh/ofrohn/d3-celestial@master/data/constellations.lines.json
//   curl -LO https://cdn.jsdelivr.net/gh/ofrohn/d3-celestial@master/data/starnames.json
//   node scripts/make-sky-catalog.mjs <dir with those three files>
//
// Output: stars to magnitude 5 as [ra°, dec°, mag, colorIndex], constellation polylines as flat
// [ra, dec, ra, dec, …] arrays, and the Arabic-named stars from src/data/star-names.ts with
// their positions. Fails if a named star is missing from the catalog.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) throw new Error('usage: node scripts/make-sky-catalog.mjs <data dir>');
const read = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));

const MAX_MAG = 5;
const ra = (lon) => +((lon + 360) % 360).toFixed(2);
const r2 = (n) => +n.toFixed(2);
// B−V color index → 0 blue-white, 1 white, 2 yellow-white, 3 orange
const colorIndex = (bv) => (bv < 0 ? 0 : bv < 0.4 ? 1 : bv < 1 ? 2 : 3);

const catalog = read('stars.6.json').features;
const stars = catalog
  .filter((f) => f.properties.mag <= MAX_MAG)
  .sort((a, b) => a.properties.mag - b.properties.mag)
  .map((f) => {
    const [lon, lat] = f.geometry.coordinates;
    return [ra(lon), r2(lat), +f.properties.mag.toFixed(1), colorIndex(parseFloat(f.properties.bv) || 0.6)];
  });

const lines = read('constellations.lines.json').features.flatMap((f) =>
  f.geometry.coordinates.map((line) => line.flatMap(([lon, lat]) => [ra(lon), r2(lat)])),
);

// Names live in TypeScript; read the `en` values with a regex instead of importing TS here
const namesSource = readFileSync(new URL('../src/data/star-names.ts', import.meta.url), 'utf8');
const wanted = [...namesSource.matchAll(/\{ en: '([^']+)', origin:/g)].map((m) => m[1]);
const names = read('starnames.json');
const byId = new Map(catalog.map((f) => [String(f.id), f]));
const named = wanted.map((en) => {
  const id = Object.keys(names).find((k) => names[k].name === en);
  const star = id && byId.get(id);
  if (!star) throw new Error(`named star not found in catalog: ${en}`);
  const [lon, lat] = star.geometry.coordinates;
  return { en, ra: ra(lon), dec: r2(lat) };
});

const out = { stars, lines, named };
writeFileSync(new URL('../src/data/sky.json', import.meta.url), JSON.stringify(out));
console.log(`${stars.length} stars (mag ≤ ${MAX_MAG}), ${lines.length} constellation lines, ${named.length} named stars`);
