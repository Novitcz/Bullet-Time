// Runs from `npm version <patch|minor|major>` (see the "version" script in
// package.json): npm has already bumped package.json and put the new version
// in npm_package_version; this syncs manifest.json and versions.json so the
// three files can never disagree.

import { readFileSync, writeFileSync } from "fs";

const targetVersion = process.env.npm_package_version;
if (!targetVersion) {
	console.error("Run via `npm version patch|minor|major`, not directly.");
	process.exit(1);
}

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t") + "\n");

const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = manifest.minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "\t") + "\n");

console.log(`manifest.json + versions.json → ${targetVersion} (minAppVersion ${manifest.minAppVersion})`);
