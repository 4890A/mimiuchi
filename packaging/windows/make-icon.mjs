// Renders icon.svg to a multi-size .ico for mimiuchi.exe.
//
//   node make-icon.mjs <icon.svg> <out.ico> <dir with node_modules/sharp>
//
// ICO entries may hold PNG data directly (Vista+), so this is just sharp
// rendering PNGs plus a 6-byte header and a 16-byte directory entry per size.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const [svgPath, outPath, sharpFrom] = process.argv.slice(2);
const require = createRequire(path.join(path.resolve(sharpFrom), "package.json"));
const sharp = require("sharp");

const svg = fs.readFileSync(svgPath);
const sizes = [256, 64, 48, 32, 24, 16];
const pngs = await Promise.all(
  sizes.map((s) => sharp(svg, { density: 384 }).resize(s, s).png().toBuffer()),
);

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(sizes.length, 4);

let offset = 6 + 16 * sizes.length;
const entries = sizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s >= 256 ? 0 : s, 0); // 0 means 256
  e.writeUInt8(s >= 256 ? 0 : s, 1);
  e.writeUInt8(0, 2); // palette
  e.writeUInt8(0, 3); // reserved
  e.writeUInt16LE(1, 4); // planes
  e.writeUInt16LE(32, 6); // bpp
  e.writeUInt32LE(pngs[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  return e;
});

fs.writeFileSync(outPath, Buffer.concat([header, ...entries, ...pngs]));
