// TUI (text-art) renderer: builds a monospace character grid and drops it into a
// <pre>, coloring runs with <span>. Consumes an already-scheduled block.

import { buildLayout } from "./layout";
import { addDays, daysBetween, isWeekend, today } from "./schedule";
import { Schedule, BulletTimeSettings } from "./types";

const CH = {
	bar: "█",
	over: "▓",
	sep: "│",
	today: "┊",
	laneDot: "●",
	weekend: "·",
};
const TODAY_COLOR = "#e5c07b";

interface Cell {
	ch: string;
	color?: string;
	faint?: boolean;
	bold?: boolean;
}

function sameStyle(a: Cell, b: Cell): boolean {
	return a.color === b.color && !!a.faint === !!b.faint && !!a.bold === !!b.bold;
}

/** Append rows of cells to `pre` as text/`<span>` nodes, merging adjacent cells
 * that share a style. Rows are separated by newline text nodes. */
function appendRows(pre: HTMLElement, rows: Cell[][]): void {
	rows.forEach((cells, rowIdx) => {
		if (rowIdx > 0) pre.appendChild(document.createTextNode("\n"));
		let i = 0;
		while (i < cells.length) {
			const c = cells[i];
			let j = i + 1;
			while (j < cells.length && sameStyle(cells[j], c)) j++;
			const text = cells.slice(i, j).map((x) => x.ch).join("");
			if (!c.color && !c.faint && !c.bold) {
				pre.appendChild(document.createTextNode(text));
			} else {
				// Colored faint cells are dimmed bars (weekend gaps); the color style would
				// otherwise override bt-faint's dim color, so give them a stronger opacity class.
				const faintCls = c.faint ? (c.color ? "bt-faint-bar" : "bt-faint") : "";
				const cls = [faintCls, c.bold ? "bt-b" : ""].filter(Boolean).join(" ");
				const span = document.createElement("span");
				if (cls) span.className = cls;
				if (c.color) span.style.color = c.color;
				span.textContent = text;
				pre.appendChild(span);
			}
			i = j;
		}
	});
}

function blank(w: number): Cell[] {
	return Array.from({ length: w }, () => ({ ch: " " }));
}

/** Write `text` into a row starting at `col`, overwriting cells. */
function put(cells: Cell[], col: number, text: string, style: Partial<Cell> = {}): void {
	for (let i = 0; i < text.length; i++) {
		const c = col + i;
		if (c >= 0 && c < cells.length) cells[c] = { ch: text[i], ...style };
	}
}

function truncate(label: string, max: number): string {
	if (max <= 0) return "";
	if (label.length <= max) return label;
	if (max === 1) return "…";
	return label.slice(0, max - 1) + "…";
}

function buildGrid(
	schedule: Schedule,
	settings: BulletTimeSettings
): { left: Cell[][]; right: Cell[][] } {
	const layout = buildLayout(schedule);
	const cpd = Math.max(1, Math.min(4, Math.round(settings.cellsPerDay)));
	const cols = layout.totalDays * cpd;
	const dayCol = (d: number) => Math.round(d * cpd);

	// Gutter width from the longest indented label (capped).
	let g = 6;
	for (const r of layout.rows) {
		const w = r.depth + 2 + r.label.length;
		if (w > g) g = w;
	}
	const gutterW = Math.min(g, 24);
	const base = gutterW + 1; // first track column
	const W = base + cols;

	const t0 = today();
	const tOff = daysBetween(schedule.min, t0);
	const todayCol = tOff >= 0 && tOff <= layout.totalDays ? base + dayCol(tOff) : -1;

	// Track columns that fall on a weekend day (same for every row).
	const weekendCols = new Set<number>();
	for (let d = 0; d < layout.totalDays; d++) {
		if (!isWeekend(addDays(schedule.min, d))) continue;
		const s = base + dayCol(d);
		const e = base + dayCol(d + 1);
		for (let c = s; c < e && c < W; c++) if (c >= base) weekendCols.add(c);
	}
	// In workdays mode a bar's calendar span crosses weekends it doesn't consume;
	// draw those columns faint so the non-working days read as a gap in the bar.
	const faintBarWeekends = schedule.config.mode === "workdays";

	const lines: Cell[][] = [];

	// Date ruler: month names, then week-start day numbers.
	if (settings.showRuler) {
		const months = blank(W);
		let lastEnd = -999; // skip labels that would collide when zoomed out
		for (const m of layout.monthTicks) {
			const col = base + dayCol(m.index);
			if (col <= lastEnd) continue;
			put(months, col, m.label, { faint: true, bold: true });
			lastEnd = col + m.label.length;
		}
		lines.push(months);
		const weeks = blank(W);
		for (const t of layout.weekTicks) {
			if (t.index >= layout.totalDays) continue;
			put(weeks, base + dayCol(t.index), String(t.date.getUTCDate()).padStart(2, "0"), { faint: true });
		}
		// Day-of-month number in bold, sitting on top of the today column.
		if (todayCol >= base && todayCol < W) {
			const num = String(t0.getUTCDate());
			put(weeks, todayCol - Math.floor((num.length - 1) / 2), num, { color: TODAY_COLOR, bold: true });
		}
		lines.push(weeks);
	}

	for (const row of layout.rows) {
		const cells = blank(W);

		// Gutter label.
		if (row.isLane) {
			put(cells, 0, truncate(row.label, gutterW), { bold: true });
		} else {
			put(cells, row.depth, truncate(row.label, gutterW - row.depth), {});
		}

		// Week separators (faint) across the track.
		for (const t of layout.weekTicks) {
			const c = base + dayCol(t.index);
			if (c >= base && c < W) cells[c] = { ch: CH.sep, faint: true };
		}
		// Lane marker sits at the start of the track.
		if (row.isLane) cells[base] = { ch: CH.laneDot, color: row.color };
		// Today marker where nothing else is drawn.
		if (todayCol >= base && todayCol < W && cells[todayCol].ch === " ")
			cells[todayCol] = { ch: CH.today, color: TODAY_COLOR };

		// Bar (+ overtime tail).
		if (row.bar) {
			const s = base + dayCol(row.bar.offsetDays);
			let e = base + dayCol(row.bar.offsetDays + row.bar.spanDays);
			if (e <= s) e = s + 1;
			const ot = row.bar.overtimeOffsetDays != null ? base + dayCol(row.bar.overtimeOffsetDays) : -1;
			for (let c = s; c < e && c < W; c++) {
				if (c < base) continue;
				const faint = faintBarWeekends && weekendCols.has(c);
				if (ot >= 0 && c >= ot) cells[c] = { ch: CH.over, color: settings.overtimeColor, faint };
				else cells[c] = { ch: CH.bar, color: row.color, faint };
			}
		}

		// Weekend fill: faint glyph in cells nothing else claimed.
		for (const c of weekendCols) {
			if (cells[c].ch === " ") cells[c] = { ch: CH.weekend, faint: true };
		}

		lines.push(cells);
	}

	// Frame every content line (and the top/bottom border) into a full-width row
	// of cells, then split each row at the gutter boundary. The left slice (box
	// edge + label gutter) renders in a pinned <pre>; the right slice (the track)
	// scrolls, so labels stay visible on wide/overflowing timelines.
	const title = schedule.config.title;
	const width = W + 4; // │ + space + W content + space + │

	const border = (topRow: boolean): Cell[] => {
		const cells: Cell[] = Array.from({ length: width }, () => ({ ch: "─", faint: true }));
		cells[0] = { ch: topRow ? "╭" : "╰", faint: true };
		cells[width - 1] = { ch: topRow ? "╮" : "╯", faint: true };
		if (topRow && title) {
			cells[2] = { ch: " ", faint: true };
			put(cells, 3, title, { bold: true });
			if (3 + title.length < width - 1) cells[3 + title.length] = { ch: " ", faint: true };
		}
		return cells;
	};

	const frame = (content: Cell[]): Cell[] => [
		{ ch: CH.sep, faint: true },
		{ ch: " " },
		...content,
		{ ch: " " },
		{ ch: CH.sep, faint: true },
	];

	const full: Cell[][] = [border(true), ...lines.map(frame), border(false)];

	// Split index lands just before the first track column (content index `base`,
	// which is frame index `base + 2`).
	const split = base + 2;
	return {
		left: full.map((row) => row.slice(0, split)),
		right: full.map((row) => row.slice(split)),
	};
}

export function renderTui(
	schedule: Schedule,
	container: HTMLElement,
	settings: BulletTimeSettings
): void {
	const { left, right } = buildGrid(schedule, settings);

	// The label gutter lives outside the scroll box so it can't scroll away; only
	// the track gets its own horizontal scroller. Same font/line-height keeps the
	// two panes row-aligned.
	const scroll = document.createElement("div");
	scroll.className = "bt-tui-scroll";

	const gutter = document.createElement("pre");
	gutter.className = "bt-tui bt-tui-gutter";
	appendRows(gutter, left);

	const trackScroll = document.createElement("div");
	trackScroll.className = "bt-tui-track-scroll";
	const track = document.createElement("pre");
	track.className = "bt-tui bt-tui-track";
	appendRows(track, right);
	trackScroll.appendChild(track);

	// Font size is the only dynamic style; feed it through a CSS variable.
	scroll.style.setProperty("--bt-tui-font-size", `${settings.fontSize}px`);

	scroll.appendChild(gutter);
	scroll.appendChild(trackScroll);
	container.appendChild(scroll);
}
