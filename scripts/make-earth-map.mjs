// Builds src/data/earth.json, the land and sea map for the globe at the end of the galaxy journey,
// from Natural Earth's 1:50m land (public domain) as packaged by world-atlas (ISC, © Mike Bostock).
// Run once, commit the output:
//
//   curl -LO https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-50m.json
//   node scripts/make-earth-map.mjs <dir with that file> [preview.png]
//
// Output: an equirectangular map, WIDTH × HEIGHT cells (half a degree each), row by row from the
// north, each row as run lengths alternating sea and land, starting with sea, in base 36 joined by
// dots. A cell is land when its center is inside a land polygon (even-odd, so lakes stay water).
// The optional PNG is a preview for checking the coastlines by eye.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

const WIDTH = 720;
const HEIGHT = 360;

const dir = process.argv[2];
if (!dir) throw new Error('usage: node scripts/make-earth-map.mjs <data dir> [preview.png]');
const topology = JSON.parse(readFileSync(join(dir, 'land-50m.json'), 'utf8'));

// TopoJSON arcs are quantized and delta-encoded; decode them to [lon, lat]
const { scale, translate } = topology.transform;
const arcs = topology.arcs.map((arc) => {
  let x = 0;
  let y = 0;
  return arc.map(([dx, dy]) => {
    x += dx;
    y += dy;
    return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
  });
});
const ring = (ids) =>
  ids.flatMap((id, i) => {
    const arc = id < 0 ? [...arcs[~id]].reverse() : arcs[id];
    return i ? arc.slice(1) : arc;
  });
const rings = topology.objects.land.geometries.flatMap((g) =>
  (g.type === 'Polygon' ? [g.arcs] : g.arcs).flatMap((polygon) => polygon.map(ring)),
);

// Some rings wrap across the antimeridian, and Antarctica's wraps around the pole. Unwrap each
// ring so no edge jumps more than 180°, and close a ring that goes around a pole along that pole.
const planar = rings.map((r) => {
  const out = [r[0]];
  for (let i = 1; i < r.length; i++) {
    let [x, y] = r[i];
    const px = out[i - 1][0];
    while (x - px > 180) x -= 360;
    while (px - x > 180) x += 360;
    out.push([x, y]);
  }
  const turn = out[out.length - 1][0] - out[0][0];
  if (Math.abs(turn) > 180) {
    const pole = out.reduce((s, p) => s + p[1], 0) < 0 ? -90 : 90;
    out.push([out[out.length - 1][0], pole], [out[0][0], pole]);
  }
  return out;
});

// Scanline fill per ring, XORed together (even-odd, so lakes stay water). Spans are filled in the
// unwrapped longitudes and folded back onto the map.
const land = new Uint8Array(WIDTH * HEIGHT);
const cell = 360 / WIDTH;
for (let row = 0; row < HEIGHT; row++) {
  const lat = 90 - (row + 0.5) * (180 / HEIGHT);
  for (const r of planar) {
    const xs = [];
    for (let i = 0; i < r.length; i++) {
      const [x0, y0] = r[i];
      const [x1, y1] = r[(i + 1) % r.length];
      if (y0 <= lat !== y1 <= lat) xs.push(x0 + ((lat - y0) / (y1 - y0)) * (x1 - x0));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.ceil((xs[k] + 180) / cell - 0.5);
      const to = Math.floor((xs[k + 1] + 180) / cell - 0.5);
      for (let col = from; col <= to; col++) land[row * WIDTH + (((col % WIDTH) + WIDTH) % WIDTH)] ^= 1;
    }
  }
}

const rows = [];
for (let row = 0; row < HEIGHT; row++) {
  const runs = [];
  let value = 0;
  let count = 0;
  for (let col = 0; col < WIDTH; col++) {
    if (land[row * WIDTH + col] === value) count++;
    else {
      runs.push(count);
      value = 1 - value;
      count = 1;
    }
  }
  runs.push(count);
  rows.push(runs.map((n) => n.toString(36)).join('.'));
}
writeFileSync(new URL('../src/data/earth.json', import.meta.url), JSON.stringify({ width: WIDTH, height: HEIGHT, rows }));
const share = land.reduce((s, v) => s + v, 0) / land.length;
console.log(`earth.json: ${WIDTH}×${HEIGHT}, ${(share * 100).toFixed(1)}% of cells are land`);

// Optional preview: a grayscale PNG, land light and sea dark
const preview = process.argv[3];
if (preview) {
  const raw = Buffer.alloc((WIDTH + 1) * HEIGHT);
  for (let row = 0; row < HEIGHT; row++) {
    for (let col = 0; col < WIDTH; col++) raw[row * (WIDTH + 1) + 1 + col] = land[row * WIDTH + col] ? 220 : 30;
  }
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  header[8] = 8; // bit depth
  header[9] = 0; // grayscale
  writeFileSync(
    preview,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
