// Turns the raw text of a ```bullet-time code block into a config + a tree of RawTask.
// No Obsidian dependency (unit-testable).

import { BlockConfig, DayModel, ParseResult, RawTask, WeekStart } from "./types";

const BULLET = /^(\s*)[-*+]\s+(.*)$/;
const HEADER = /^([a-zA-Z][a-zA-Z0-9_-]*)\s*:\s*(.*)$/;

/** Expand tabs to 4 columns so mixed tabs/spaces still nest consistently. */
function indentWidth(ws: string): number {
	let n = 0;
	for (const ch of ws) n += ch === "\t" ? 4 : 1;
	return n;
}

/** Reject values that could break out of a CSS declaration. */
function safeColor(raw: string): string | undefined {
	const c = raw.trim();
	if (!c || /[;{}<>()"'`\\]/.test(c)) return undefined;
	return c;
}

/** A lone {token} is a start date only if it looks like one; otherwise it's a duration. */
function looksLikeStart(s: string): boolean {
	const t = s.trim().toLowerCase();
	return t === "today" || /^\d{4}-\d{2}-\d{2}$/.test(t) || /^[+-]\d+$/.test(t);
}

function normalizeMode(v: string): DayModel | undefined {
	const s = v.trim().toLowerCase();
	if (s === "workdays" || s === "workday" || s === "work") return "workdays";
	if (s === "calendar" || s === "calendars" || s === "cal") return "calendar";
	return undefined;
}

function normalizeWeekStart(v: string): WeekStart | undefined {
	const s = v.trim().toLowerCase();
	if (s === "mon" || s === "monday") return "mon";
	if (s === "sun" || s === "sunday") return "sun";
	return undefined;
}

/** Split a bullet's content into { label, startRaw, durationRaw, color }. */
function parseContent(
	content: string,
	errors: string[],
	line: number
): Pick<RawTask, "label" | "startRaw" | "durationRaw" | "color"> {
	let rest = content;
	let color: string | undefined;
	let startRaw: string | undefined;
	let durationRaw: string | undefined;

	// Trailing "| color" (take the last pipe so labels may contain earlier text).
	const pipe = rest.lastIndexOf("|");
	if (pipe !== -1) {
		const candidate = safeColor(rest.slice(pipe + 1));
		if (candidate) {
			color = candidate;
			rest = rest.slice(0, pipe);
		}
	}

	// First {start, duration} group.
	const brace = /\{([^}]*)\}/.exec(rest);
	if (brace) {
		const inner = brace[1];
		const comma = inner.indexOf(",");
		if (comma === -1) {
			// A single value: {2026-07-01} pins a start, {5} / {2w} is a duration.
			const only = inner.trim();
			if (only) {
				if (looksLikeStart(only)) startRaw = only;
				else durationRaw = only;
			}
		} else {
			const s = inner.slice(0, comma).trim();
			const d = inner.slice(comma + 1).trim();
			if (s) startRaw = s;
			if (d) durationRaw = d;
		}
		rest = rest.slice(0, brace.index) + rest.slice(brace.index + brace[0].length);
	}

	const label = rest.trim();
	if (!label) errors.push(`Line ${line}: task has no label.`);
	return { label, startRaw, durationRaw, color };
}

export function parseBulletTime(source: string, defaults: BlockConfig): ParseResult {
	const errors: string[] = [];
	const config: BlockConfig = { ...defaults };
	const lanes: RawTask[] = [];
	// Stack of open ancestors, each with its indent width.
	const stack: { indent: number; node: RawTask }[] = [];
	let seenBullet = false;

	const lines = source.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i];
		const lineNo = i + 1;
		if (raw.trim() === "") continue;
		// Whole-line comment.
		if (/^\s*#/.test(raw)) continue;

		const bullet = BULLET.exec(raw);
		if (!bullet) {
			// Header lines are only allowed before the first bullet.
			if (!seenBullet) {
				const trimmed = raw.trim();
				// Bare boolean flags, e.g. `wide` / `center` (no `key: value` needed).
				const flag = /^(wide|center)$/i.exec(trimmed);
				if (flag) {
					config[flag[1].toLowerCase() as "wide" | "center"] = true;
					continue;
				}
				const h = HEADER.exec(trimmed);
				if (h) {
					applyHeader(h[1].toLowerCase(), h[2], config, errors, lineNo);
					continue;
				}
			}
			errors.push(`Line ${lineNo}: not a bullet or header — "${raw.trim()}".`);
			continue;
		}

		seenBullet = true;
		const indent = indentWidth(bullet[1]);
		const parsed = parseContent(bullet[2], errors, lineNo);
		const node: RawTask = { ...parsed, depth: 0, children: [], line: lineNo };

		// Pop siblings/deeper nodes so the top of the stack is our parent.
		while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();

		if (stack.length === 0) {
			node.depth = 0;
			lanes.push(node);
		} else {
			const parent = stack[stack.length - 1].node;
			node.depth = parent.depth + 1;
			parent.children.push(node);
		}
		stack.push({ indent, node });
	}

	if (lanes.length === 0) errors.push("No tasks found. Add at least one bullet.");
	return { config, lanes, errors };
}

function applyHeader(
	key: string,
	value: string,
	config: BlockConfig,
	errors: string[],
	line: number
): void {
	// Strip a trailing "# comment" from header values only.
	const v = value.replace(/\s+#.*$/, "").trim();
	switch (key) {
		case "mode":
		case "days": {
			const m = normalizeMode(v);
			if (m) config.mode = m;
			else errors.push(`Line ${line}: unknown mode "${v}" (use calendar|workdays).`);
			break;
		}
		case "weekstart":
		case "week-start": {
			const w = normalizeWeekStart(v);
			if (w) config.weekStart = w;
			else errors.push(`Line ${line}: unknown weekstart "${v}" (use mon|sun).`);
			break;
		}
		case "hoursperday":
		case "hours-per-day": {
			const n = parseFloat(v);
			if (n > 0) config.hoursPerDay = n;
			else errors.push(`Line ${line}: hoursperday must be a positive number.`);
			break;
		}
		case "title":
			config.title = v || undefined;
			break;
		case "wide":
		case "center": {
			const s = v.trim().toLowerCase();
			config[key] = s === "" || s === "true" || s === "yes" || s === "1";
			break;
		}
		default:
			errors.push(`Line ${line}: unknown setting "${key}".`);
	}
}
