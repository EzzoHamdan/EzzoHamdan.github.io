// Builds src/data/sky.json from the d3-celestial catalog (BSD-3-Clause, © 2015 Olaf Frohn;
// star data from Hipparcos and the Yale Bright Star Catalog). Run once, commit the output:
//
//   curl -LO https://cdn.jsdelivr.net/gh/ofrohn/d3-celestial@master/data/stars.6.json
//   curl -LO https://cdn.jsdelivr.net/gh/ofrohn/d3-celestial@master/data/constellations.lines.json
//   curl -LO https://cdn.jsdelivr.net/gh/ofrohn/d3-celestial@master/data/starnames.json
//   node scripts/make-sky-catalog.mjs <dir with those three files>
//
// Output: stars to magnitude 5 as [ra°, dec°, mag, colorIndex]; constellations as
// { id, rank, lines: flat [ra, dec, ra, dec, …] polylines, center: [ra, dec] } where center is
// the label anchor (mean direction of the vertices); and the Arabic-named stars from
// src/data/sky-names.ts with their positions. Fails if a named star is missing from the catalog.
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

const RAD = Math.PI / 180;
// Mean of unit vectors, so constellations that straddle RA 0h get a sensible center
function center(points) {
  let x = 0, y = 0, z = 0;
  for (const [lon, lat] of points) {
    x += Math.cos(lat * RAD) * Math.cos(lon * RAD);
    y += Math.cos(lat * RAD) * Math.sin(lon * RAD);
    z += Math.sin(lat * RAD);
  }
  return [ra(Math.atan2(y, x) / RAD), r2(Math.atan2(z, Math.hypot(x, y)) / RAD)];
}
const constellations = read('constellations.lines.json').features.map((f) => ({
  id: f.id,
  rank: Number(f.properties.rank),
  lines: f.geometry.coordinates.map((line) => line.flatMap(([lon, lat]) => [ra(lon), r2(lat)])),
  center: center(f.geometry.coordinates.flat()),
}));

// Names live in TypeScript; read the `en` values with a regex instead of importing TS here
const namesSource = readFileSync(new URL('../src/data/sky-names.ts', import.meta.url), 'utf8');
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

const out = { stars, constellations, named };
writeFileSync(new URL('../src/data/sky.json', import.meta.url), JSON.stringify(out));
console.log(`${stars.length} stars (mag ≤ ${MAX_MAG}), ${constellations.length} constellations, ${named.length} named stars`);
