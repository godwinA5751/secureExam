// Copies the PDF reader's worker file into /public so the browser can load it.
// Runs automatically after `npm install`, so it always matches the installed version.
const fs = require("fs");
const path = require("path");

const from = path.join(__dirname, "..", "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const to = path.join(__dirname, "..", "public", "pdf.worker.min.mjs");

if (fs.existsSync(from)) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  console.log("Copied pdf.worker.min.mjs to public/");
}