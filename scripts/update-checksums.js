import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT_DIR = path.resolve(import.meta.dirname, "..");
const RELEASE_DIR = path.join(ROOT_DIR, "release");

if (!fs.existsSync(RELEASE_DIR)) {
  process.exit(0);
}

const releaseFiles = fs.readdirSync(RELEASE_DIR).filter((f) => 
  f !== "SHA256SUMS.txt" && 
  !f.endsWith(".blockmap") && 
  !f.endsWith(".yml") && 
  fs.statSync(path.join(RELEASE_DIR, f)).isFile()
);

const checksumLines = [];

for (const file of releaseFiles) {
  const filePath = path.join(RELEASE_DIR, file);
  const fileBuffer = fs.readFileSync(filePath);
  const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");
  checksumLines.push(`${hash}  ${file}`);
}

const checksumFile = path.join(RELEASE_DIR, "SHA256SUMS.txt");
fs.writeFileSync(checksumFile, checksumLines.join("\n") + "\n");
console.log("🔐 Updated SHA256SUMS.txt with " + checksumLines.length + " artifacts.");
