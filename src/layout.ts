// Pure geometry helpers: flatten the scheduled tree into display rows and compute
// the axis ticks (week starts, month labels). No Obsidian dependency.

import { Schedule, ScheduledTask } from "./types";
import { addDays, daysBetween } from "./schedule";

export interface BarGeom {
	offsetDays: number; // days from window start to bar start
	spanDays: number; // total bar length in days
	overtimeOffsetDays?: number; // where the overtime segment begins (from window start)
}

export interface Row {
	label: string;
	depth: number;
	color: string;
	isLane: boolean;
	bar?: BarGeom; // lanes render as a group header without a bar
}

export interface WeekTick {
	index: number; // day index from window start
	date: Date;
}

export interface MonthTick {
	index: number;
	label: string;
}

export interface Layout {
	rows: Row[];
	totalDays: number;
	weekTicks: WeekTick[];
	monthTicks: MonthTick[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function barFor(node: ScheduledTask, min: Date): BarGeom {
	const offsetDays = daysBetween(min, node.start);
	const spanDays = daysBetween(node.start, node.end);
	const overtimeOffsetDays = node.overtimeStart
		? daysBetween(min, node.overtimeStart)
		: undefined;
	return { offsetDays, spanDays, overtimeOffsetDays };
}

function pushRows(node: ScheduledTask, min: Date, rows: Row[]): void {
	if (node.isLane) {
		rows.push({
			label: node.label,
			depth: 0,
			color: node.color,
			isLane: true,
			// Empty lanes (no children) still get a faint span bar for context.
			bar: node.children.length === 0 ? undefined : undefined,
		});
		for (const child of node.children) pushRows(child, min, rows);
		return;
	}
	rows.push({
		label: node.label,
		depth: node.depth,
		color: node.color,
		isLane: false,
		bar: barFor(node, min),
	});
	for (const child of node.children) pushRows(child, min, rows);
}

export function buildLayout(schedule: Schedule): Layout {
	const { min, max } = schedule;
	const totalDays = Math.max(1, Math.round(daysBetween(min, max)));

	const rows: Row[] = [];
	for (const lane of schedule.lanes) pushRows(lane, min, rows);

	// Week separators land on every week-start boundary (min is already aligned).
	const weekTicks: WeekTick[] = [];
	for (let i = 0; i <= totalDays; i += 7) {
		weekTicks.push({ index: i, date: addDays(min, i) });
	}

	// Month labels at each month change (and at the very start).
	const monthTicks: MonthTick[] = [];
	let prevMonth = -1;
	for (let i = 0; i < totalDays; i++) {
		const d = addDays(min, i);
		const m = d.getUTCMonth();
		if (m !== prevMonth) {
			// Show the year only when January rolls over, to keep labels short.
			const label = m === 0 ? `${MONTHS[m]} ${d.getUTCFullYear()}` : MONTHS[m];
			monthTicks.push({ index: i, label });
			prevMonth = m;
		}
	}

	return { rows, totalDays, weekTicks, monthTicks };
}
