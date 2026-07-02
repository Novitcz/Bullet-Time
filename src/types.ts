// Shared data models and defaults. This module has NO Obsidian dependency so it
// can be imported by the headless test harness.

export type DayModel = "calendar" | "workdays";
export type WeekStart = "mon" | "sun";
export type RenderMode = "tui" | "bars";

/** Effective configuration for a single ```bullet-time block. */
export interface BlockConfig {
	mode: DayModel;
	weekStart: WeekStart;
	hoursPerDay: number;
	title?: string;
	wide?: boolean; // break out of readable line length to full pane width
	center?: boolean; // center the timeline within its block
}

/** A raw task node straight out of the parser (dates/durations still strings). */
export interface RawTask {
	label: string;
	depth: number; // 0 = lane, 1 = project, 2+ = subtask
	startRaw?: string; // text before the comma in {..}
	durationRaw?: string; // text after the comma in {..}
	color?: string;
	children: RawTask[];
	line: number;
}

export interface ParseResult {
	config: BlockConfig;
	lanes: RawTask[];
	errors: string[];
}

/** A task after scheduling: concrete start/end dates resolved. */
export interface ScheduledTask {
	label: string;
	depth: number;
	start: Date; // inclusive (UTC midnight)
	end: Date; // exclusive (UTC midnight)
	color: string; // resolved fill color
	isLane: boolean;
	isLeaf: boolean;
	/** For a project with a planned total shorter than actual work: where overtime begins. */
	overtimeStart?: Date;
	pinned: boolean; // had an explicit start date
	children: ScheduledTask[];
}

export interface Schedule {
	config: BlockConfig;
	lanes: ScheduledTask[];
	min: Date; // window start, padded to a week boundary
	max: Date; // window end (exclusive), padded to a week boundary
	errors: string[];
}

/** Plugin-wide defaults; a block's header lines override these per-block. */
export interface BulletTimeSettings {
	dayModel: DayModel;
	weekStart: WeekStart;
	hoursPerDay: number;
	renderMode: RenderMode; // "tui" = monospace text art, "bars" = graphical CSS bars
	// TUI (text-art) appearance
	cellsPerDay: number; // character columns per calendar day (horizontal zoom)
	fontSize: number; // px, for the monospace grid
	showRuler: boolean; // draw the month/week date ruler
	// Graphical (bars) appearance
	dayWidth: number; // px per calendar day
	rowHeight: number; // px per task row
	gutterWidth: number; // px for the label gutter
	// Shared
	palette: string[]; // lane colors assigned in order when none is specified
	overtimeColor: string;
}

// A calm, btop / one-dark inspired palette.
export const DEFAULT_PALETTE = [
	"#61afef", // blue
	"#98c379", // green
	"#e5c07b", // yellow
	"#c678dd", // purple
	"#56b6c2", // cyan
	"#e06c75", // red
	"#d19a66", // orange
];

export const DEFAULT_SETTINGS: BulletTimeSettings = {
	dayModel: "calendar",
	weekStart: "mon",
	hoursPerDay: 8,
	renderMode: "tui",
	cellsPerDay: 2,
	fontSize: 13,
	showRuler: true,
	dayWidth: 26,
	rowHeight: 26,
	gutterWidth: 150,
	palette: DEFAULT_PALETTE,
	overtimeColor: "#e06c75",
};
