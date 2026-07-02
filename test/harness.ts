// Headless sanity checks for parsing + scheduling (no Obsidian, no DOM).
// Run with: npm test

import { parseBulletTime } from "../src/parser";
import { scheduleBlock } from "../src/schedule";
import { ScheduledTask, BlockConfig, DEFAULT_PALETTE } from "../src/types";

const DEFAULTS: BlockConfig = { mode: "calendar", weekStart: "mon", hoursPerDay: 8 };

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = ""): void {
	if (cond) {
		passed++;
		console.log(`  ok   ${name}`);
	} else {
		failed++;
		console.error(`  FAIL ${name}${detail ? "  — " + detail : ""}`);
	}
}

function iso(d: Date): string {
	return d.toISOString().slice(0, 10);
}

function schedule(src: string) {
	const parsed = parseBulletTime(src, { ...DEFAULTS });
	return scheduleBlock(parsed, DEFAULT_PALETTE, "#e06c75");
}

function find(nodes: ScheduledTask[], label: string): ScheduledTask | undefined {
	for (const n of nodes) {
		if (n.label === label) return n;
		const hit = find(n.children, label);
		if (hit) return hit;
	}
	return undefined;
}

// 1. Calendar auto-chaining across siblings and subtasks.
{
	const s = schedule(`
- Alice
  - Design {2026-07-01, 5}
    - Wireframes {, 2}
    - Mockups {, 3}
  - Build {, 8}
`);
	const design = find(s.lanes, "Design")!;
	const wf = find(s.lanes, "Wireframes")!;
	const mk = find(s.lanes, "Mockups")!;
	const build = find(s.lanes, "Build")!;
	check("Wireframes starts 2026-07-01", iso(wf.start) === "2026-07-01", iso(wf.start));
	check("Wireframes ends 2026-07-03", iso(wf.end) === "2026-07-03", iso(wf.end));
	check("Mockups chains to 2026-07-03", iso(mk.start) === "2026-07-03", iso(mk.start));
	check("Design span ends 2026-07-06", iso(design.end) === "2026-07-06", iso(design.end));
	check("Build chains after Design (2026-07-06)", iso(build.start) === "2026-07-06", iso(build.start));
	check("Build ends 2026-07-14", iso(build.end) === "2026-07-14", iso(build.end));
	check("No errors", s.errors.length === 0, s.errors.join("; "));
}

// 2. Work-day mode skips weekends.
{
	const s = schedule(`
mode: workdays
- Bob
  - Task {2026-07-01, 5}
`);
	const t = find(s.lanes, "Task")!;
	// Wed 2026-07-01 + 5 work days -> exclusive end Wed 2026-07-08.
	check("Workday task ends 2026-07-08", iso(t.end) === "2026-07-08", iso(t.end));
}

// 3. Week shorthand (calendar = 7 days each).
{
	const s = schedule(`
- C
  - Sprint {2026-07-01, 2w}
`);
	const sp = find(s.lanes, "Sprint")!;
	check("2w calendar ends 2026-07-15", iso(sp.end) === "2026-07-15", iso(sp.end));
}

// 4. Overtime when subtasks exceed the planned parent total.
{
	const s = schedule(`
- Team
  - Project {2026-07-01, 5}
    - A {, 4}
    - B {, 4}
`);
	const p = find(s.lanes, "Project")!;
	check("Project actual end 2026-07-09", iso(p.end) === "2026-07-09", iso(p.end));
	check("Overtime detected", !!p.overtimeStart, "no overtimeStart");
	check(
		"Overtime starts at planned end 2026-07-06",
		!!p.overtimeStart && iso(p.overtimeStart) === "2026-07-06",
		p.overtimeStart ? iso(p.overtimeStart) : "undefined"
	);
}

// 5. Pinned siblings run in parallel.
{
	const s = schedule(`
- X
  - A {2026-07-01, 3}
  - B {2026-07-01, 2}
`);
	const b = find(s.lanes, "B")!;
	check("Pinned B stays at 2026-07-01 (parallel)", iso(b.start) === "2026-07-01", iso(b.start));
	check("B is marked pinned", b.pinned === true);
}

// 6. Hour shorthand -> fraction of a day, and per-task color override.
{
	const s = schedule(`
- Y | #123456
  - Half {2026-07-01, 4h} | #abcdef
`);
	const h = find(s.lanes, "Half")!;
	const spanDays = (h.end.getTime() - h.start.getTime()) / 86400000;
	check("4h = 0.5 day span", Math.abs(spanDays - 0.5) < 1e-9, String(spanDays));
	check("Per-task color override applied", h.color === "#abcdef", h.color);
	check("Lane color applied", find(s.lanes, "Y")!.color === "#123456");
}

// 6b. Bare {5} = duration-only; {date} = start-only pin.
{
	const s = schedule(`
- W
  - First {2026-07-01, 3}
  - Second {5}
  - Pinned {2026-07-20}
`);
	const second = find(s.lanes, "Second")!;
	const pinned = find(s.lanes, "Pinned")!;
	check("{5} chains after previous (2026-07-04)", iso(second.start) === "2026-07-04", iso(second.start));
	check("{5} lasts 5 days (ends 2026-07-09)", iso(second.end) === "2026-07-09", iso(second.end));
	check("{5} is not pinned", second.pinned === false);
	check("{date} pins start to 2026-07-20", iso(pinned.start) === "2026-07-20", iso(pinned.start));
	check("{date} pin defaults to 1 day", iso(pinned.end) === "2026-07-21", iso(pinned.end));
	check("Bare-duration block has no errors", s.errors.length === 0, s.errors.join("; "));
}

// 7. Invalid inputs surface as errors, not crashes.
{
	const s = schedule(`
- Z
  - Bad {2026-13-99, 5}
  - Worse {, 3x}
`);
	check("Invalid date reported", s.errors.some((e) => /invalid start/i.test(e)), s.errors.join("; "));
	check("Invalid duration reported", s.errors.some((e) => /invalid duration/i.test(e)), s.errors.join("; "));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
