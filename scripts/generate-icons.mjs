import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve("next/package.json"))("sharp");
const root = new URL("../", import.meta.url);
const logo = await readFile(new URL("public/toylogix-logo.svg", root), "utf8");
const defs = logo.match(/<defs>[\s\S]*?<\/defs>/)?.[0];
const mark = logo.match(/<g transform="translate\(650 18\)">([\s\S]*?)<\/g>/)?.[1];
if (!defs || !mark) throw new Error("ToyLogix logo symbol was not found");

// Reuse the header's exact shapes and gradients in a square canvas.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144"><title>ToyLogix</title>${defs}<g transform="translate(15 14)">${mark}</g></svg>\n`;
await writeFile(new URL("app/icon.svg", root), svg);
await mkdir(new URL("public/icons/", root), { recursive: true });
for (const [size, path] of [
  [180, "public/apple-touch-icon.png"],
  [192, "public/icons/toylogix-192.png"],
  [512, "public/icons/toylogix-512.png"],
]) {
  await sharp(Buffer.from(svg)).resize(size, size).flatten({ background: "#ffffff" }).png().toFile(fileURLToPath(new URL(path, root)));
}

// ICO supports embedded PNG frames; include common tab and desktop sizes.
const sizes = [16, 32, 48];
const frames = await Promise.all(sizes.map((size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer()));
const header = Buffer.alloc(6 + 16 * frames.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(frames.length, 4);
let offset = header.length;
frames.forEach((frame, i) => {
  const entry = 6 + i * 16;
  header[entry] = sizes[i];
  header[entry + 1] = sizes[i];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(frame.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
});
await writeFile(new URL("app/favicon.ico", root), Buffer.concat([header, ...frames]));
