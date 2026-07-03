# Bullet-time

Minimal timelines from a simple bullet list in [Obsidian](https://obsidian.md).
<img width="1027" height="361" alt="image" src="https://github.com/user-attachments/assets/98bc581d-0937-4ae6-a282-fd074c5fe062" />

You write an ordinary indented list; Bullet-time reads it top-to-bottom, chains each task after the one before it, and draws a timeline as clean monospace text art.

## Features

- **Auto-scheduling** — siblings chain automatically: each task starts where the previous one ended. Only pin the dates that actually matter.
- **Work-day math** — schedule in `calendar` days or `workdays` mode, which skips weekends.
- **Duration shorthands** — days, weeks, or hours (`3d`, `2w`, `4h`).
- **Overtime highlighting** — when a project's children run past its planned total, the overflow is flagged in a warning color.
- **Nesting** — lanes → projects → subtasks, driven purely by list indentation.
- **Per-task colors** and a calm, `btop` / one-dark inspired default palette.
- **Two entry points** — a fenced ` ```bullet-time ` code block, or a plain bullet list tagged with a hidden `%% bullet-time %%` comment.
- **Errors render inline** — bad input never breaks your note; problems show up in a small box under the timeline.

## Screenshots

<!--
  TODO before submitting to the community plugin directory:
  drop a screenshot into docs/ and uncomment the line below.
  Suggested capture (from a real vault, default theme):
    docs/screenshot-tui.png — a rendered timeline

![Bullet-time timeline](docs/screenshot-tui.png)
-->

## Installation

### Community plugin store

*Pending review — once accepted, install it from* Settings → Community plugins → Browse *by searching for "Bullet-time".*

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](../../releases).
2. Copy them into your vault at `<vault>/.obsidian/plugins/bullet-time/`.
3. Reload Obsidian, then enable **Bullet-time** under *Settings → Community plugins*.

## Usage

Add a fenced code block with the `bullet-time` language:

````markdown
```bullet-time
title: Q3 Launch
mode: workdays

- Design {2w}
  - Wireframes {4d}
  - Visual design {6d}
- Build {3w} | #98c379
- QA {1w}
- Launch {2026-09-01, 2d}
```
````

The first bullet starts today (unless pinned). Each following sibling starts when the previous one ends. Indented bullets become children of the bullet above them.

### From a plain bullet list

Prefer a normal Markdown list? Tag it with a hidden comment as the first item (Reading view only):

```markdown
- %% bullet-time %% mode:workdays title:Roadmap
- Research {1w}
- Prototype {2w}
- Ship {3d}
```

## Syntax reference

### Header lines

Placed **before the first bullet**, one per line, as `key: value`:

| Key | Values | Description |
| --- | --- | --- |
| `title` | text | Heading shown above the timeline. |
| `mode` / `days` | `calendar`, `workdays` | Count every day, or skip weekends. |
| `weekstart` | `mon`, `sun` | First day of the week for axis ticks. |
| `hoursperday` | positive number | Hours in a work day (used to convert `Nh` durations). |
| `wide` | — | Break out to full pane width (also usable as a bare flag). |
| `center` | — | Center the timeline in its block (also usable as a bare flag). |

Lines starting with `#` are comments.

### Task syntax

Each bullet is a task. Its content can carry an optional `{...}` scheduling group and a trailing `| color`:

```
- Label {start, duration} | color
```

- `{start, duration}` — either part is optional: `{2w}` is duration-only, `{2026-07-01}` pins a start, `{2026-07-01, 3d}` sets both.
- **Start** accepts `today`, an ISO date `YYYY-MM-DD`, or a relative offset like `+5` / `-2` (days from today).
- **Duration** accepts a bare number or `Nd` (days), `Nw` (weeks — 5 work days or 7 calendar days), or `Nh` (hours, converted via `hoursperday`). Fractions allowed (e.g. `1.5d`).
- **Color** — any CSS color after a trailing `|` (e.g. `| #e06c75`, `| tomato`). Unsafe values are ignored.

Tasks with no explicit start chain after their previous sibling. A pinned start runs in parallel from that date.

## Settings

Configure global defaults under *Settings → Bullet-time* (any block can override the schedule-related ones via header lines):

- **Day model** — `calendar` or `workdays`
- **Week start**, **hours per day**
- **Appearance** — cells per day (zoom), font size, month/week ruler toggle
- **Palette** — lane colors assigned in order when none is specified, plus the overtime color

## Development

```bash
npm install
npm run dev     # esbuild watch mode → rebuilds main.js on save
npm run build   # typecheck + minified production build
npm test        # headless parser + scheduler checks
npm run deploy  # build, then copy into a vault (set BULLETTIME_VAULT)
```

The core is a strict, Obsidian-free pipeline — **parse → schedule → layout** — so it can be unit-tested headlessly; only the render stage touches the DOM. See [`CLAUDE.md`](CLAUDE.md) for a fuller architecture tour.

## License

[MIT](LICENSE)
