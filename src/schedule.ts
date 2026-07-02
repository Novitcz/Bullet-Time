// Resolves raw tasks into concrete start/end dates: auto-chaining, work-day math,
// duration shorthands, and overtime detection. No Obsidian dependency (unit-testable).

import {
	BlockConfig,
	DayModel,
	ParseResult,
	RawTask,
	Schedule,
	ScheduledTask,
	WeekStart,
} from "./types";

export const MS_PER_DAY = 86400000;

export function utcDate(y: number, m: number, d: number): Date {
	return new Date(Date.UTC(y, m, d));
}

export function today(): Date {
	const n = new Date();
	return utcDate(n.getFullYear(), n.getMonth(), n.getDate());
}

export function addDays(d: Date, n: number): Date {
	return new Date(d.getTime() + n * MS_PER_DAY);
}

export function daysBetween(a: Date, b: Date): number {
	return (b.getTime() - a.getTime()) / MS_PER_DAY;
}

export function isWeekend(d: Date): boolean {
	const w = d.getUTCDay();
	return w === 0 || w === 6;
}

/** getUTCDay() value that starts the week. */
function weekStartDow(ws: WeekStart): number {
	return ws === "sun" ? 0 : 1;
}

/** Parse a start token: Date if valid, null if given-but-invalid, undefined if absent. */
export function parseStart(raw: string | undefined): Date | null | undefined {
	if (raw == null) return undefined;
	const s = raw.trim();
	if (s === "") return undefined;
	if (s.toLowerCase() === "today") return today();
	const rel = /^([+-]\d+)$/.exec(s);
	if (rel) return addDays(today(), parseInt(rel[1], 10));
	const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
	if (!iso) return null;
	const y = +iso[1];
	const mo = +iso[2] - 1;
	const day = +iso[3];
	const d = utcDate(y, mo, day);
	// Reject overflow (JS Date silently normalizes e.g. 2026-13-99).
	if (d.getUTCFullYear() !== y || d.getUTCMonth() !== mo || d.getUTCDate() !== day) return null;
	return d;
}

/**
 * Parse a duration token into a count of days (fractional allowed).
 * Bare number / Nd = days, Nw = weeks (5 work / 7 cal days), Nh = hours.
 * Returns null if given-but-invalid, undefined if absent.
 */
export function parseDuration(
	raw: string | undefined,
	cfg: BlockConfig
): number | null | undefined {
	if (raw == null) return undefined;
	const s = raw.trim();
	if (s === "") return undefined;
	const m = /^(\d*\.?\d+)\s*([dwh]?)$/i.exec(s);
	if (!m) return null;
	const val = parseFloat(m[1]);
	const unit = m[2].toLowerCase();
	if (unit === "w") return val * (cfg.mode === "workdays" ? 5 : 7);
	if (unit === "h") return val / cfg.hoursPerDay;
	return val;
}

/**
 * Exclusive end date after consuming `duration` days from `start`.
 * In workdays mode the start is snapped forward off a weekend and weekends are
 * skipped while consuming; the resulting calendar span may cross weekends.
 */
export function computeEnd(start: Date, duration: number, model: DayModel): Date {
	if (duration <= 0) return new Date(start.getTime());
	if (model === "calendar") return addDays(start, duration);

	let cur = new Date(start.getTime());
	while (isWeekend(cur)) cur = addDays(cur, 1);
	let remaining = duration;
	while (remaining > 1e-9) {
		if (isWeekend(cur)) {
			cur = addDays(cur, 1);
			continue;
		}
		if (remaining >= 1) {
			remaining -= 1;
			cur = addDays(cur, 1);
		} else {
			cur = new Date(cur.getTime() + remaining * MS_PER_DAY);
			remaining = 0;
		}
	}
	return cur;
}

function padToPrevWeekStart(d: Date, ws: WeekStart): Date {
	const target = weekStartDow(ws);
	let cur = new Date(d.getTime());
	while (cur.getUTCDay() !== target) cur = addDays(cur, -1);
	return cur;
}

function padToNextWeekStart(d: Date, ws: WeekStart): Date {
	const target = weekStartDow(ws);
	let cur = new Date(d.getTime());
	while (cur.getUTCDay() !== target) cur = addDays(cur, 1);
	return cur;
}

interface Ctx {
	cfg: BlockConfig;
	errors: string[];
	palette: string[];
	overtimeColor: string;
	laneIndex: number;
}

/**
 * Schedule one node.
 * @param cursor  chaining anchor = end of the previous sibling (or lane anchor).
 * @param laneColor color inherited from the lane for tasks without their own.
 */
function scheduleNode(
	node: RawTask,
	cursor: Date,
	laneColor: string,
	ctx: Ctx
): ScheduledTask {
	const explicit = parseStart(node.startRaw);
	if (explicit === null) ctx.errors.push(`Line ${node.line}: invalid start date "${node.startRaw}".`);
	const pinned = explicit instanceof Date;
	const anchor = pinned ? (explicit as Date) : cursor;

	const durParsed = parseDuration(node.durationRaw, ctx.cfg);
	if (durParsed === null)
		ctx.errors.push(`Line ${node.line}: invalid duration "${node.durationRaw}".`);
	const duration = typeof durParsed === "number" ? durParsed : undefined;

	const color = node.color || laneColor;

	if (node.children.length > 0) {
		// Parent: chain children from this node's anchor.
		let childCursor = anchor;
		const children: ScheduledTask[] = [];
		for (const c of node.children) {
			const sc = scheduleNode(c, childCursor, color, ctx);
			children.push(sc);
			childCursor = sc.end;
		}
		const start = children.reduce((m, c) => (c.start < m ? c.start : m), children[0].start);
		const end = children.reduce((m, c) => (c.end > m ? c.end : m), children[0].end);

		// Planned total set on the parent -> anything past it is overtime.
		let overtimeStart: Date | undefined;
		if (duration !== undefined) {
			const plannedEnd = computeEnd(start, duration, ctx.cfg.mode);
			if (end.getTime() > plannedEnd.getTime()) overtimeStart = plannedEnd;
		}

		return {
			label: node.label,
			depth: node.depth,
			start,
			end,
			color,
			isLane: node.depth === 0,
			isLeaf: false,
			overtimeStart,
			pinned,
			children,
		};
	}

	// Leaf task: duration defaults to 1 day.
	const dur = duration !== undefined ? duration : 1;
	const start = anchor;
	const end = computeEnd(start, dur, ctx.cfg.mode);
	return {
		label: node.label,
		depth: node.depth,
		start,
		end,
		color,
		isLane: node.depth === 0,
		isLeaf: true,
		pinned,
		children: [],
	};
}

export function scheduleBlock(
	parsed: ParseResult,
	palette: string[],
	overtimeColor: string
): Schedule {
	const errors = [...parsed.errors];
	const ctx: Ctx = { cfg: parsed.config, errors, palette, overtimeColor, laneIndex: 0 };
	const anchor = today();

	const lanes: ScheduledTask[] = [];
	for (let i = 0; i < parsed.lanes.length; i++) {
		const laneRaw = parsed.lanes[i];
		const laneColor = laneRaw.color || palette[i % palette.length];
		ctx.laneIndex = i;
		if (laneRaw.children.length === 0) {
			// Lane with no tasks: keep it as an empty (label-only) lane.
			lanes.push({
				label: laneRaw.label,
				depth: 0,
				start: anchor,
				end: anchor,
				color: laneColor,
				isLane: true,
				isLeaf: false,
				pinned: false,
				children: [],
			});
			continue;
		}
		lanes.push(scheduleNode(laneRaw, anchor, laneColor, ctx));
	}

	// Global window across every dated task.
	let min: Date | undefined;
	let max: Date | undefined;
	for (const lane of lanes) {
		if (lane.children.length === 0) continue;
		if (!min || lane.start < min) min = lane.start;
		if (!max || lane.end > max) max = lane.end;
	}
	if (!min || !max) {
		min = anchor;
		max = addDays(anchor, 7);
	}

	const paddedMin = padToPrevWeekStart(min, parsed.config.weekStart);
	let paddedMax = padToNextWeekStart(max, parsed.config.weekStart);
	if (paddedMax.getTime() <= paddedMin.getTime()) paddedMax = addDays(paddedMin, 7);

	return { config: parsed.config, lanes, min: paddedMin, max: paddedMax, errors };
}
