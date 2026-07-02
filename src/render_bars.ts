// Graphical renderer: absolutely-positioned CSS bars on a day grid. Consumes an
// already-scheduled block. Sticky label gutter + horizontally scrolling canvas.

import { buildLayout, Row } from "./layout";
import { addDays, daysBetween, today } from "./schedule";
import { Schedule, BulletTimeSettings, WeekStart } from "./types";

const HEADER_H = 42;

function fmtDate(d: Date): string {
	return d.toISOString().slice(0, 10);
}

function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	cls?: string,
	parent?: HTMLElement
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	if (cls) node.className = cls;
	if (parent) parent.appendChild(node);
	return node;
}

/** Faint day gridlines + stronger week separators + subtle weekend shading. */
function weekendBackground(dw: number, weekStart: WeekStart): string {
	const period = 7 * dw;
	const weekLines = `repeating-linear-gradient(90deg, var(--bt-grid-week) 0, var(--bt-grid-week) 1px, transparent 1px, transparent ${period}px)`;
	const dayLines = `repeating-linear-gradient(90deg, var(--bt-grid) 0, var(--bt-grid) 1px, transparent 1px, transparent ${dw}px)`;
	const weekend =
		weekStart === "mon"
			? `repeating-linear-gradient(90deg, transparent 0, transparent ${5 * dw}px, var(--bt-weekend) ${5 * dw}px, var(--bt-weekend) ${period}px)`
			: `repeating-linear-gradient(90deg, var(--bt-weekend) 0, var(--bt-weekend) ${dw}px, transparent ${dw}px, transparent ${6 * dw}px, var(--bt-weekend) ${6 * dw}px, var(--bt-weekend) ${period}px)`;
	return `${weekLines}, ${dayLines}, ${weekend}`;
}

function renderBar(track: HTMLElement, row: Row, dw: number, rh: number, overtime: string): void {
	const bar = row.bar;
	if (!bar) return;
	const x = bar.offsetDays * dw;
	const total = bar.spanDays * dw;

	const makeSeg = (left: number, width: number, color: string, round: string, ot: boolean) => {
		const seg = el("div", ot ? "bt-bar bt-bar-overtime" : "bt-bar", track);
		seg.style.left = `${left}px`;
		seg.style.width = `${Math.max(2, width)}px`;
		seg.style.setProperty("--bt-bar-color", color);
		seg.style.borderRadius = round;
		return seg;
	};

	const r = `${Math.min(6, rh / 3)}px`;
	if (bar.overtimeOffsetDays != null) {
		const otX = bar.overtimeOffsetDays * dw;
		const normalW = Math.max(0, otX - x);
		const otW = Math.max(0, x + total - otX);
		const base = makeSeg(x, normalW, row.color, `${r} 0 0 ${r}`, false);
		const label = el("span", "bt-bar-label", base);
		label.textContent = row.label;
		makeSeg(otX, otW, overtime, `0 ${r} ${r} 0`, true);
	} else {
		const seg = makeSeg(x, total, row.color, r, false);
		const label = el("span", "bt-bar-label", seg);
		label.textContent = row.label;
	}
}

export function renderBars(
	schedule: Schedule,
	container: HTMLElement,
	settings: BulletTimeSettings
): void {
	const { dayWidth: dw, rowHeight: rh, gutterWidth: gw, overtimeColor } = settings;
	const layout = buildLayout(schedule);
	const canvasW = layout.totalDays * dw;

	const root = el("div", "bt-bullet-time", container);

	if (schedule.config.title) {
		const title = el("div", "bt-title", root);
		title.textContent = schedule.config.title;
	}

	const scroll = el("div", "bt-scroll", root);

	// --- Left gutter (sticky): head spacer + one label row per display row. ---
	const gutter = el("div", "bt-gutter", scroll);
	gutter.style.flexBasis = `${gw}px`;
	const gHead = el("div", "bt-gutter-head", gutter);
	gHead.style.height = `${HEADER_H}px`;
	const modeTag = el("span", "bt-mode-tag", gHead);
	modeTag.textContent = schedule.config.mode === "workdays" ? "work days" : "calendar";

	for (const row of layout.rows) {
		const g = el("div", row.isLane ? "bt-gutter-row bt-lane-row" : "bt-gutter-row", gutter);
		g.style.height = `${rh}px`;
		g.style.paddingLeft = `${8 + row.depth * 14}px`;
		const dot = el("span", "bt-dot", g);
		dot.style.setProperty("--bt-dot-color", row.color);
		const name = el("span", "bt-label", g);
		name.textContent = row.label;
	}

	// --- Scrolling canvas: gridlines, axis, task rows. ---
	const canvas = el("div", "bt-canvas", scroll);
	canvas.style.width = `${canvasW}px`;

	const grid = el("div", "bt-gridlines", canvas);
	grid.style.top = `${HEADER_H}px`;
	grid.style.background = weekendBackground(dw, schedule.config.weekStart);

	const axis = el("div", "bt-axis", canvas);
	axis.style.height = `${HEADER_H}px`;
	for (const m of layout.monthTicks) {
		const t = el("div", "bt-month", axis);
		t.style.left = `${m.index * dw}px`;
		t.textContent = m.label;
	}
	for (const w of layout.weekTicks) {
		if (w.index >= layout.totalDays) continue;
		const t = el("div", "bt-week", axis);
		t.style.left = `${w.index * dw}px`;
		t.textContent = String(w.date.getUTCDate());
	}

	const t0 = today();
	const todayOffset = daysBetween(schedule.min, t0);
	if (todayOffset >= 0 && todayOffset <= layout.totalDays) {
		const marker = el("div", "bt-today", canvas);
		marker.style.left = `${todayOffset * dw}px`;
		marker.style.top = `${HEADER_H}px`;
		// Day-of-month badge in the axis, aligned with the week-day numbers.
		const badge = el("div", "bt-today-badge", axis);
		badge.style.left = `${todayOffset * dw}px`;
		badge.textContent = String(t0.getUTCDate());
	}

	const rows = el("div", "bt-rows", canvas);
	for (const row of layout.rows) {
		const track = el("div", row.isLane ? "bt-trackrow bt-lane-track" : "bt-trackrow", rows);
		track.style.height = `${rh}px`;
		if (!row.isLane && row.bar) {
			renderBar(track, row, dw, rh, overtimeColor);
			const start = addDays(schedule.min, row.bar.offsetDays);
			const end = addDays(schedule.min, row.bar.offsetDays + row.bar.spanDays);
			track.title = `${row.label}\n${fmtDate(start)} → ${fmtDate(addDays(end, -1))}  (${row.bar.spanDays}d)`;
		}
	}
}
