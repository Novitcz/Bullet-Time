# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Bullet-time is an Obsidian community plugin (TypeScript, bundled to `main.js` with esbuild) that turns a simple bullet list into a Gantt-style timeline with auto-scheduling, work-day math, and overtime highlighting.

## Commands

- `npm run dev` — esbuild in watch mode, rebuilds `main.js` on save (inline sourcemaps).
- `npm run build` — typecheck (`tsc -noEmit`) then a minified production `main.js`.
- `npm test` — bundles `test/harness.ts` to `test/harness.cjs` and runs the headless parser+scheduler checks. There is no test runner/framework; `test/harness.ts` is a single script of hand-rolled `check(name, cond)` assertions that exits non-zero on failure. Add a new numbered block to that file to add a test — there is no single-test filter.
- `npm run deploy` — build, then copy `main.js`, `manifest.json`, `styles.css` into an Obsidian vault's plugin folder via `scripts/deploy.mjs`. Destination defaults to `/home/rv/Documents/RVault`; override with the `BULLETTIME_VAULT` env var. After deploy you must reload/re-enable the plugin in Obsidian.

## Architecture

Data flows through a strict pipeline, one stage per module: **parse → schedule → layout → render**. The first three stages have **no Obsidian or DOM dependency** (that's what makes them unit-testable via the headless harness); only the render stage and entry points touch Obsidian/DOM.

- `src/types.ts` — shared data models (`RawTask`, `ScheduledTask`, `Schedule`, `BlockConfig`, `BulletTimeSettings`) and defaults/palette. Keep this Obsidian-free; the harness imports it.
- `src/parser.ts` — `parseBulletTime(source, defaults)`: text → `ParseResult` (config + tree of `RawTask`, dates/durations still raw strings). Handles indentation-based nesting, `key: value` header lines (only valid before the first bullet), bare `wide`/`center` flags, and per-bullet `{start, duration}` / trailing `| color` syntax.
- `src/schedule.ts` — `scheduleBlock(parsed, palette, overtimeColor)`: resolves raw tasks into concrete UTC start/end `Date`s. Owns auto-chaining (each sibling starts where the previous ended), pinning (explicit start date runs in parallel), work-day math (skip weekends), duration shorthands (`Nd`/`Nw`/`Nh`), and overtime detection (children exceeding a parent's planned total). Also exports the date utilities (`utcDate`, `today`, `addDays`, `computeEnd`, etc.) used everywhere.
- `src/layout.ts` — `buildLayout(schedule)`: pure geometry. Flattens the scheduled tree into display `Row`s with `BarGeom` (offset/span in days) and computes week/month axis ticks. No colors-to-pixels here — just day units.
- `src/render_tui.ts` and `src/render_bars.ts` — the two renderers. TUI builds a monospace character grid in a `<pre>` with colored `<span>` runs; bars builds absolutely-positioned CSS bars on a day grid with a sticky label gutter. Both consume a `Schedule` + `BulletTimeSettings`. `settings.renderMode` (`"tui"` | `"bars"`) selects one.
- `src/render.ts` — `renderBulletTime(source, container, settings)`: the single entry that runs the whole pipeline for one block, applies `wide`/`center` classes, dispatches to the chosen renderer, and renders any accumulated errors. Errors are collected (never thrown) through parse/schedule and shown in a `.bt-errors` box.

### Two ways a timeline enters the DOM (both routed through `render.ts`)

`src/main.ts` registers both:
1. **Fenced code block** ` ```bullet-time ` — `registerMarkdownCodeBlockProcessor`, works in Reading view *and* Live Preview.
2. **Plain bullet list** marked with a hidden `%% bullet-time %%` comment — `registerMarkdownPostProcessor` → `src/listtimeline.ts`, Reading view only. The marker can be the first list item (preferred; edits re-render immediately) or on the line above the list. `listtimeline.ts` extracts the marker, converts `mode:workdays title:...` shorthand into parser header lines, and replaces the `<ul>`.

### Render-cache staleness

Obsidian caches rendered sections, so toggling into Reading view after an edit can show a stale timeline. `main.ts` works around this with a debounced `layout-change` handler that force-rerenders only when the active note's text actually changed (tracked in a `WeakMap<MarkdownView, string>`), plus a "Refresh timelines in current note" command as a manual escape hatch.

## Conventions that matter

- **Keep parse/schedule/layout/types free of Obsidian and DOM imports** — the headless harness depends on it, and it keeps the core logic testable.
- **All dates are UTC midnight.** `end` is *exclusive*. Use the helpers in `schedule.ts` rather than raw `Date` math to stay consistent.
- **Never throw for user-input problems** — push a message onto the `errors` array so it renders in the note instead of breaking the block.
- **`safeColor` in `parser.ts`** rejects characters that could break out of a CSS declaration; keep color input flowing through it since colors are injected into inline styles.
- `manifest.json` and `package.json` versions are kept in lockstep with `versions.json` (min app version map).
