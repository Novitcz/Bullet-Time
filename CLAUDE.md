# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An Obsidian community plugin ("Bullet-time", id `bullet-time`) that renders Gantt-style timelines from indented bullet lists. TypeScript, bundled with esbuild, no runtime dependencies beyond the Obsidian API.

## Commands

```bash
npm run dev      # esbuild watch mode → rebuilds main.js on save
npm run build    # tsc -noEmit typecheck, then minified production build
npm test         # bundles test/harness.ts → test/harness.cjs, then runs it under node
npm run deploy   # build + copy main.js/manifest.json/styles.css into $BULLETTIME_VAULT/.obsidian/plugins/bullet-time/
```

There is no test framework: `test/harness.ts` is a single file of assertion blocks using a local `check()` helper, exiting non-zero on any failure. There is no way to run one test in isolation — the whole harness runs in well under a second. Add new cases as another block in that file.

`main.js` (bundle) and `test/harness.cjs` (bundled tests) are **committed build artifacts** — they will show up as diffs after building. That's expected; keep them in sync with `src/` when committing.

## Architecture

The core is a strict pipeline with **no Obsidian dependency** until the final render step — this is what makes headless testing possible. Keep it that way: never import `obsidian` in `types.ts`, `parser.ts`, `schedule.ts`, or `layout.ts`.

```
source text ──parser.ts──▶ ParseResult ──schedule.ts──▶ Schedule ──layout.ts──▶ Layout
 (RawTask tree, config,      (ScheduledTask tree,        (flat display rows,
  errors)                     concrete dates)             axis ticks)
                                                              │
                              render.ts ─────────────────────▶│
                              render_tui.ts (monospace <pre> character grid)
```

- **`types.ts`** — all shared interfaces plus `DEFAULT_SETTINGS`/`DEFAULT_PALETTE`. Obsidian-free.
- **`parser.ts`** — text → `RawTask` tree. Indentation drives nesting (tabs = 4 cols); header lines (`key: value`) only before the first bullet; each bullet may carry `{start, duration}` and a trailing `| color`.
- **`schedule.ts`** — resolves dates. Also home of all date helpers (`today`, `addDays`, `computeEnd`, …).
- **`layout.ts`** — pure geometry: flattens the tree into rows and computes week/month ticks.
- **`render.ts`** — entry point per block: parse + schedule once, render via `render_tui.ts`, append the inline error box. Errors accumulate in `errors[]` arrays through the whole pipeline and render as a box under the timeline — parse/schedule failures must never throw.
- **`main.ts`** — plugin shell. Registers the two entry points and a stale-render workaround (Obsidian caches Reading-view sections; a `layout-change` listener re-renders when note text changed).

### Two entry points, one pipeline

1. **Fenced code block** (` ```bullet-time `) via `registerMarkdownCodeBlockProcessor` — works in Reading view and Live Preview.
2. **Plain bullet list** tagged with a `%% bullet-time %%` comment (Reading view only) via `registerMarkdownPostProcessor` — handled in `listtimeline.ts`, which extracts the list text from section info, converts the marker's `key:value` tokens into header lines, and feeds the result to the same `renderBulletTime()`. It also accepts the legacy keyword `timeblock`.

### Scheduling semantics (the domain logic)

- All dates are **UTC-midnight `Date` objects**; `end` is **exclusive**. Durations are fractional day counts (`2w` = 5 workdays or 7 calendar days depending on mode, `4h` divides by `hoursPerDay`).
- Siblings **auto-chain**: each starts at the previous sibling's end. An explicit `{start}` pins the task, which then runs in parallel from that date instead of chaining.
- Depth 0 bullets are **lanes** (group headers, colored from the palette in order); parents derive their span from their children; a parent with an explicit duration whose children run longer gets `overtimeStart` set at the planned end.
- The display window (`min`/`max`) is padded outward to week-start boundaries.
- Token parsers return a three-state result: value if valid, `null` if present-but-invalid (report an error), `undefined` if absent (apply default).

### Rendering / styling

- The renderer consumes `buildLayout(schedule)`; per-task colors go through `safeColor()` in the parser (rejects CSS-breaking characters) and are applied as inline styles; everything else lives in `styles.css` under `bt-` prefixed classes using CSS variables, so themes/dark mode work automatically.
- Settings (`settings.ts`) are global defaults; block header lines override the schedule-related ones per block. Settings changes call `saveAndRefresh()` to re-render open notes.

## Releasing

Pushing a git tag triggers `.github/workflows/release.yml`: test + build, then a **draft** GitHub release with `main.js`, `manifest.json`, `styles.css`. Version lives in three places that must agree: `package.json`, `manifest.json`, and `versions.json` (maps plugin version → `minAppVersion`).
