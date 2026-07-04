---
name: obsidian-compliance
description: Check the pending changes (uncommitted diff) against Obsidian's community plugin guidelines and developer policies before committing. Use before any commit that touches src/, styles.css, or manifest.json, or when the user asks whether a change is "compliant", "guideline-safe", or ready for the plugin directory.
---

# Obsidian community plugin compliance check

Bullet-time is officially listed in the Obsidian community plugin directory, so every
change must keep complying with the [plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines),
[submission requirements](https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins),
and [developer policies](https://docs.obsidian.md/Developer+policies).

## Workflow

1. **Collect the pending change.** Review what is about to be committed:
   ```bash
   git diff HEAD -- ':!main.js' ':!test/harness.cjs'
   git ls-files --others --exclude-standard
   ```
   `main.js` and `test/harness.cjs` are committed build artifacts — skip them; review
   only the sources they were built from. Include any untracked source files.

2. **Run the checklist below against the changed lines** (read surrounding context in
   the touched files as needed — a violation introduced by the diff may only be visible
   with context). Only flag issues the diff introduces or touches; this is a pre-commit
   gate, not a whole-repo audit.

3. **If a rule seems outdated or a case is ambiguous**, verify against the live docs
   with WebFetch (URLs above) rather than guessing.

4. **Report findings** as `file:line — rule — why it violates it`, ordered by severity:
   *blocker* (would be rejected in plugin review / violates developer policies),
   *warning* (reviewer would ask for a change), *note* (style/consistency).
   If everything passes, say so explicitly. Do not auto-fix unless asked.

## Checklist

### Security & policies (blockers)

- No `innerHTML`, `outerHTML`, or `insertAdjacentHTML` with dynamic content — use
  `createEl`/`createDiv`/`createSpan` or the DOM API. (This repo builds DOM in
  `render_tui.ts`; any user-derived string must go through text nodes or `setText`.)
- Per-task colors must keep flowing through `safeColor()` in `parser.ts` before landing
  in an inline style. Never interpolate raw user input into style/attribute strings.
- No telemetry, tracking, or network calls without explicit user consent and disclosure.
- No remote code execution or dynamically fetched/eval'd code.
- No obfuscated code.

### Mobile compatibility (blockers — manifest declares `isDesktopOnly: false`)

- No Node.js APIs (`fs`, `path`, `child_process`, …) or Electron APIs.
- No lookbehind regex if `minAppVersion` implies old iOS support (current
  `minAppVersion` 1.5.0 is fine, but keep it in mind if lowering it).
- Use `requestUrl` instead of `fetch`/`XMLHttpRequest` if network access is ever added.

### API usage (warnings)

- Use `this.app`, never the global `app`.
- Register everything that needs cleanup via `this.registerEvent`,
  `this.registerDomEvent`, `this.registerInterval`, `this.addCommand` — no manual
  listener bookkeeping, and no detaching leaves in `onunload`.
- Prefer the `Vault` API over `vault.adapter`; use `normalizePath()` on any
  user-supplied path; use `instanceof TFile`/`TFolder` instead of casting.
- Defer expensive startup work with `this.app.workspace.onLayoutReady()` instead of
  running it directly in `onload`.
- Prefer `async/await` over promise chains; no leftover `console.log` debugging output
  (error reporting through the pipeline's `errors[]` arrays is the project convention).
- Keep the Obsidian-free core intact: `types.ts`, `parser.ts`, `schedule.ts`,
  `layout.ts` must not import `obsidian` (project rule that also keeps the plugin
  reviewable and testable).

### Styling (warnings)

- No hardcoded styles assigned from JS except the sanctioned per-task color inline
  styles. Everything else belongs in `styles.css` under `bt-` prefixed classes using
  CSS variables so themes and dark mode keep working.

### UI text & settings (notes)

- Sentence case in all UI text ("Show week numbers", not "Show Week Numbers").
- In settings: use `setHeading()` rather than `<h1>`/`<h2>`; no top-level heading
  repeating the plugin name; avoid the word "settings" in headings.
- Command names must not include the plugin name (Obsidian prefixes it automatically).

### Manifest & release hygiene (blockers when touched)

- If the version changes, `package.json`, `manifest.json`, and `versions.json` must
  all agree, and the version must be plain semver (no leading `v`).
- `id`, `name`, `description` in `manifest.json` must not change without good reason —
  the `id` is immutable once listed.
- Description: follows directory rules (short, sentence case, ends with a period, no
  "This plugin…" prefix, no "Obsidian" in the name/description).
