import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const prod = process.argv.includes("production");
const test = process.argv.includes("test");

if (test) {
  // Bundle the headless test harness (no Obsidian dependency) to a runnable CJS file.
  await esbuild.build({
    entryPoints: ["test/harness.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "es2018",
    outfile: "test/harness.cjs",
    logLevel: "info",
  });
  process.exit(0);
}

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", ...builtins],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  minify: prod,
  outfile: "main.js",
});

if (prod) {
  await ctx.rebuild();
  await ctx.dispose();
} else {
  await ctx.watch();
}
