// Copies the built plugin into the Obsidian vault so it can be enabled/tested.
// Override the destination vault with the BULLETTIME_VAULT env var if needed.
import { mkdirSync, copyFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const vault = process.env.BULLETTIME_VAULT || "/home/rv/Documents/RVault";
const dest = join(vault, ".obsidian", "plugins", "bullet-time");

mkdirSync(dest, { recursive: true });

for (const file of ["main.js", "manifest.json", "styles.css"]) {
  const src = join(root, file);
  if (!existsSync(src)) {
    console.error(`! missing ${file} — run "npm run build" first`);
    process.exit(1);
  }
  copyFileSync(src, join(dest, file));
  console.log(`✓ ${file} → ${dest}`);
}
console.log("Deployed. Enable/reload Bullet-time in Obsidian (Settings → Community plugins).");
