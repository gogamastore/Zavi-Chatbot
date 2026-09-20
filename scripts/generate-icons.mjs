// ---------------------------------------------------------------------------
// Generate all app icons from public/logo.svg.
// Run: node scripts/generate-icons.mjs
// Deps: @resvg/resvg-js, png-to-ico (devDependencies)
// ---------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import pngToIco from "png-to-ico";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const svg = fs.readFileSync(path.join(root, "public", "logo.svg"));

function renderPng(size) {
  const r = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
    background: "rgba(0,0,0,0)",
  });
  return r.render().asPng();
}

function write(rel, buf) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, buf);
  console.log("  ✓", rel, `(${buf.length} B)`);
}

console.log("Generating icons from public/logo.svg …");

// PNG sizes used by the web app + manifest
const png512 = renderPng(512);
const png192 = renderPng(192);
const png180 = renderPng(180);
const png48 = renderPng(48);
const png32 = renderPng(32);
const png16 = renderPng(16);

// Next.js App Router conventions (files under app/)
write("app/apple-icon.png", png180);
write("public/icon-512.png", png512);
write("public/icon-192.png", png192);
write("public/favicon-32.png", png32);

// SVG favicon (served by Next from app/icon.svg)
fs.copyFileSync(path.join(root, "public", "logo.svg"), path.join(root, "app", "icon.svg"));
console.log("  ✓ app/icon.svg");

// Multi-resolution favicon.ico
const ico = await pngToIco([png16, png32, png48]);
write("app/favicon.ico", ico);

// Brand kit copy at the project root (for the user's records / external HDD)
const brand = path.resolve(root, "..", "brand");
fs.mkdirSync(brand, { recursive: true });
fs.copyFileSync(path.join(root, "public", "logo.svg"), path.join(brand, "logo.svg"));
fs.copyFileSync(path.join(root, "public", "logo-wordmark.svg"), path.join(brand, "logo-wordmark.svg"));
fs.writeFileSync(path.join(brand, "icon-512.png"), png512);
fs.writeFileSync(path.join(brand, "icon-192.png"), png192);
fs.writeFileSync(path.join(brand, "apple-icon-180.png"), png180);
fs.writeFileSync(path.join(brand, "favicon.ico"), ico);
console.log("  ✓ brand/ (logo.svg, logo-wordmark.svg, icon-512.png, icon-192.png, apple-icon-180.png, favicon.ico)");

console.log("Done.");
