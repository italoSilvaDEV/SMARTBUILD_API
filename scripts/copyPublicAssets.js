const fs = require("fs");
const path = require("path");

const source = path.resolve(__dirname, "../public/fonts/signatures");
const target = path.resolve(__dirname, "../dist/public/fonts/signatures");

if (!fs.existsSync(source)) {
  console.warn(`[build] Signature fonts source not found: ${source}`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.cpSync(source, target, { recursive: true });
console.log(`[build] Copied contract signature fonts to ${target}`);
