"use strict";

// src/parser.ts
var BULLET = /^(\s*)[-*+]\s+(.*)$/;
var HEADER = /^([a-zA-Z][a-zA-Z0-9_-]*)\s*:\s*(.*)$/;
function indentWidth(ws) {
  let n = 0;
  for (const ch of ws)
    n += ch === "	" ? 4 : 1;
  return n;
}
function safeColor(raw) {
  const c = raw.trim();
  if (!c || /[;{}<>()"'`\\]/.test(c))
    return void 0;
  return c;
}
function looksLikeStart(s) {
  const t = s.trim().toLowerCase();
  return t === "today" || /^\d{4}-\d{2}-\d{2}$/.test(t) || /^[+-]\d+$/.test(t);
}
function normalizeMode(v) {
  const s = v.trim().toLowerCase();
  if (s === "workdays" || s === "workday" || s === "work")
    return "workdays";
  if (s === "calendar" || s === "calendars" || s === "cal")
    return "calendar";
  return void 0;
}
function normalizeWeekStart(v) {
  const s = v.trim().toLowerCase();
  if (s === "mon" || s === "monday")
    return "mon";
  if (s === "sun" || s === "sunday")
    return "sun";
  return void 0;
}
function parseContent(content, errors, line) {
  let rest = content;
  let color;
  let startRaw;
  let durationRaw;
  const pipe = rest.lastIndexOf("|");
  if (pipe !== -1) {
    const candidate = safeColor(rest.slice(pipe + 1));
    if (candidate) {
      color = candidate;
      rest = rest.slice(0, pipe);
    }
  }
  const brace = /\{([^}]*)\}/.exec(rest);
  if (brace) {
    const inner = brace[1];
    const comma = inner.indexOf(",");
    if (comma === -1) {
      const only = inner.trim();
      if (only) {
        if (looksLikeStart(only))
          startRaw = only;
        else
          durationRaw = only;
      }
    } else {
      const s = inner.slice(0, comma).trim();
      const d = inner.slice(comma + 1).trim();
      if (s)
        startRaw = s;
      if (d)
        durationRaw = d;
    }
    rest = rest.slice(0, brace.index) + rest.slice(brace.index + brace[0].length);
  }
  const label = rest.trim();
  if (!label)
    errors.push(`Line ${line}: task has no label.`);
  return { label, startRaw, durationRaw, color };
}
function parseBulletTime(source, defaults) {
  const errors = [];
  const config = { ...defaults };
  const lanes = [];
  const stack = [];
  let seenBullet = false;
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineNo = i + 1;
    if (raw.trim() === "")
      continue;
    if (/^\s*#/.test(raw))
      continue;
    const bullet = BULLET.exec(raw);
    if (!bullet) {
      if (!seenBullet) {
        const trimmed = raw.trim();
        const flag = /^(wide|center)$/i.exec(trimmed);
        if (flag) {
          config[flag[1].toLowerCase()] = true;
          continue;
        }
        const h = HEADER.exec(trimmed);
        if (h) {
          applyHeader(h[1].toLowerCase(), h[2], config, errors, lineNo);
          continue;
        }
      }
      errors.push(`Line ${lineNo}: not a bullet or header \u2014 "${raw.trim()}".`);
      continue;
    }
    seenBullet = true;
    const indent = indentWidth(bullet[1]);
    const parsed = parseContent(bullet[2], errors, lineNo);
    const node = { ...parsed, depth: 0, children: [], line: lineNo };
    while (stack.length && stack[stack.length - 1].indent >= indent)
      stack.pop();
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
  if (lanes.length === 0)
    errors.push("No tasks found. Add at least one bullet.");
  return { config, lanes, errors };
}
function applyHeader(key, value, config, errors, line) {
  const v = value.replace(/\s+#.*$/, "").trim();
  switch (key) {
    case "mode":
    case "days": {
      const m = normalizeMode(v);
      if (m)
        config.mode = m;
      else
        errors.push(`Line ${line}: unknown mode "${v}" (use calendar|workdays).`);
      break;
    }
    case "weekstart":
    case "week-start": {
      const w = normalizeWeekStart(v);
      if (w)
        config.weekStart = w;
      else
        errors.push(`Line ${line}: unknown weekstart "${v}" (use mon|sun).`);
      break;
    }
    case "hoursperday":
    case "hours-per-day": {
      const n = parseFloat(v);
      if (n > 0)
        config.hoursPerDay = n;
      else
        errors.push(`Line ${line}: hoursperday must be a positive number.`);
      break;
    }
    case "title":
      config.title = v || void 0;
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

// src/schedule.ts
var MS_PER_DAY = 864e5;
function utcDate(y, m, d) {
  return new Date(Date.UTC(y, m, d));
}
function today() {
  const n = /* @__PURE__ */ new Date();
  return utcDate(n.getFullYear(), n.getMonth(), n.getDate());
}
function addDays(d, n) {
  return new Date(d.getTime() + n * MS_PER_DAY);
}
function isWeekend(d) {
  const w = d.getUTCDay();
  return w === 0 || w === 6;
}
function weekStartDow(ws) {
  return ws === "sun" ? 0 : 1;
}
function parseStart(raw) {
  if (raw == null)
    return void 0;
  const s = raw.trim();
  if (s === "")
    return void 0;
  if (s.toLowerCase() === "today")
    return today();
  const rel = /^([+-]\d+)$/.exec(s);
  if (rel)
    return addDays(today(), parseInt(rel[1], 10));
  const iso2 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!iso2)
    return null;
  const y = +iso2[1];
  const mo = +iso2[2] - 1;
  const day = +iso2[3];
  const d = utcDate(y, mo, day);
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== mo || d.getUTCDate() !== day)
    return null;
  return d;
}
function parseDuration(raw, cfg) {
  if (raw == null)
    return void 0;
  const s = raw.trim();
  if (s === "")
    return void 0;
  const m = /^(\d*\.?\d+)\s*([dwh]?)$/i.exec(s);
  if (!m)
    return null;
  const val = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  if (unit === "w")
    return val * (cfg.mode === "workdays" ? 5 : 7);
  if (unit === "h")
    return val / cfg.hoursPerDay;
  return val;
}
function computeEnd(start, duration, model) {
  if (duration <= 0)
    return new Date(start.getTime());
  if (model === "calendar")
    return addDays(start, duration);
  let cur = new Date(start.getTime());
  while (isWeekend(cur))
    cur = addDays(cur, 1);
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
function padToPrevWeekStart(d, ws) {
  const target = weekStartDow(ws);
  let cur = new Date(d.getTime());
  while (cur.getUTCDay() !== target)
    cur = addDays(cur, -1);
  return cur;
}
function padToNextWeekStart(d, ws) {
  const target = weekStartDow(ws);
  let cur = new Date(d.getTime());
  while (cur.getUTCDay() !== target)
    cur = addDays(cur, 1);
  return cur;
}
function scheduleNode(node, cursor, laneColor, ctx) {
  const explicit = parseStart(node.startRaw);
  if (explicit === null)
    ctx.errors.push(`Line ${node.line}: invalid start date "${node.startRaw}".`);
  const pinned = explicit instanceof Date;
  const anchor = pinned ? explicit : cursor;
  const durParsed = parseDuration(node.durationRaw, ctx.cfg);
  if (durParsed === null)
    ctx.errors.push(`Line ${node.line}: invalid duration "${node.durationRaw}".`);
  const duration = typeof durParsed === "number" ? durParsed : void 0;
  const color = node.color || laneColor;
  if (node.children.length > 0) {
    let childCursor = anchor;
    const children = [];
    for (const c of node.children) {
      const sc = scheduleNode(c, childCursor, color, ctx);
      children.push(sc);
      childCursor = sc.end;
    }
    const start2 = children.reduce((m, c) => c.start < m ? c.start : m, children[0].start);
    const end2 = children.reduce((m, c) => c.end > m ? c.end : m, children[0].end);
    let overtimeStart;
    if (duration !== void 0) {
      const plannedEnd = computeEnd(start2, duration, ctx.cfg.mode);
      if (end2.getTime() > plannedEnd.getTime())
        overtimeStart = plannedEnd;
    }
    return {
      label: node.label,
      depth: node.depth,
      start: start2,
      end: end2,
      color,
      isLane: node.depth === 0,
      isLeaf: false,
      overtimeStart,
      pinned,
      children
    };
  }
  const dur = duration !== void 0 ? duration : 1;
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
    children: []
  };
}
function scheduleBlock(parsed, palette, overtimeColor) {
  const errors = [...parsed.errors];
  const ctx = { cfg: parsed.config, errors, palette, overtimeColor, laneIndex: 0 };
  const anchor = today();
  const lanes = [];
  for (let i = 0; i < parsed.lanes.length; i++) {
    const laneRaw = parsed.lanes[i];
    const laneColor = laneRaw.color || palette[i % palette.length];
    ctx.laneIndex = i;
    if (laneRaw.children.length === 0) {
      lanes.push({
        label: laneRaw.label,
        depth: 0,
        start: anchor,
        end: anchor,
        color: laneColor,
        isLane: true,
        isLeaf: false,
        pinned: false,
        children: []
      });
      continue;
    }
    lanes.push(scheduleNode(laneRaw, anchor, laneColor, ctx));
  }
  let min;
  let max;
  for (const lane of lanes) {
    if (lane.children.length === 0)
      continue;
    if (!min || lane.start < min)
      min = lane.start;
    if (!max || lane.end > max)
      max = lane.end;
  }
  if (!min || !max) {
    min = anchor;
    max = addDays(anchor, 7);
  }
  const paddedMin = padToPrevWeekStart(min, parsed.config.weekStart);
  let paddedMax = padToNextWeekStart(max, parsed.config.weekStart);
  if (paddedMax.getTime() <= paddedMin.getTime())
    paddedMax = addDays(paddedMin, 7);
  return { config: parsed.config, lanes, min: paddedMin, max: paddedMax, errors };
}

// src/types.ts
var DEFAULT_PALETTE = [
  "#61afef",
  // blue
  "#98c379",
  // green
  "#e5c07b",
  // yellow
  "#c678dd",
  // purple
  "#56b6c2",
  // cyan
  "#e06c75",
  // red
  "#d19a66"
  // orange
];

// test/harness.ts
var DEFAULTS = { mode: "calendar", weekStart: "mon", hoursPerDay: 8 };
var passed = 0;
var failed = 0;
function check(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${detail ? "  \u2014 " + detail : ""}`);
  }
}
function iso(d) {
  return d.toISOString().slice(0, 10);
}
function schedule(src) {
  const parsed = parseBulletTime(src, { ...DEFAULTS });
  return scheduleBlock(parsed, DEFAULT_PALETTE, "#e06c75");
}
function find(nodes, label) {
  for (const n of nodes) {
    if (n.label === label)
      return n;
    const hit = find(n.children, label);
    if (hit)
      return hit;
  }
  return void 0;
}
{
  const s = schedule(`
- Alice
  - Design {2026-07-01, 5}
    - Wireframes {, 2}
    - Mockups {, 3}
  - Build {, 8}
`);
  const design = find(s.lanes, "Design");
  const wf = find(s.lanes, "Wireframes");
  const mk = find(s.lanes, "Mockups");
  const build = find(s.lanes, "Build");
  check("Wireframes starts 2026-07-01", iso(wf.start) === "2026-07-01", iso(wf.start));
  check("Wireframes ends 2026-07-03", iso(wf.end) === "2026-07-03", iso(wf.end));
  check("Mockups chains to 2026-07-03", iso(mk.start) === "2026-07-03", iso(mk.start));
  check("Design span ends 2026-07-06", iso(design.end) === "2026-07-06", iso(design.end));
  check("Build chains after Design (2026-07-06)", iso(build.start) === "2026-07-06", iso(build.start));
  check("Build ends 2026-07-14", iso(build.end) === "2026-07-14", iso(build.end));
  check("No errors", s.errors.length === 0, s.errors.join("; "));
}
{
  const s = schedule(`
mode: workdays
- Bob
  - Task {2026-07-01, 5}
`);
  const t = find(s.lanes, "Task");
  check("Workday task ends 2026-07-08", iso(t.end) === "2026-07-08", iso(t.end));
}
{
  const s = schedule(`
- C
  - Sprint {2026-07-01, 2w}
`);
  const sp = find(s.lanes, "Sprint");
  check("2w calendar ends 2026-07-15", iso(sp.end) === "2026-07-15", iso(sp.end));
}
{
  const s = schedule(`
- Team
  - Project {2026-07-01, 5}
    - A {, 4}
    - B {, 4}
`);
  const p = find(s.lanes, "Project");
  check("Project actual end 2026-07-09", iso(p.end) === "2026-07-09", iso(p.end));
  check("Overtime detected", !!p.overtimeStart, "no overtimeStart");
  check(
    "Overtime starts at planned end 2026-07-06",
    !!p.overtimeStart && iso(p.overtimeStart) === "2026-07-06",
    p.overtimeStart ? iso(p.overtimeStart) : "undefined"
  );
}
{
  const s = schedule(`
- X
  - A {2026-07-01, 3}
  - B {2026-07-01, 2}
`);
  const b = find(s.lanes, "B");
  check("Pinned B stays at 2026-07-01 (parallel)", iso(b.start) === "2026-07-01", iso(b.start));
  check("B is marked pinned", b.pinned === true);
}
{
  const s = schedule(`
- Y | #123456
  - Half {2026-07-01, 4h} | #abcdef
`);
  const h = find(s.lanes, "Half");
  const spanDays = (h.end.getTime() - h.start.getTime()) / 864e5;
  check("4h = 0.5 day span", Math.abs(spanDays - 0.5) < 1e-9, String(spanDays));
  check("Per-task color override applied", h.color === "#abcdef", h.color);
  check("Lane color applied", find(s.lanes, "Y").color === "#123456");
}
{
  const s = schedule(`
- W
  - First {2026-07-01, 3}
  - Second {5}
  - Pinned {2026-07-20}
`);
  const second = find(s.lanes, "Second");
  const pinned = find(s.lanes, "Pinned");
  check("{5} chains after previous (2026-07-04)", iso(second.start) === "2026-07-04", iso(second.start));
  check("{5} lasts 5 days (ends 2026-07-09)", iso(second.end) === "2026-07-09", iso(second.end));
  check("{5} is not pinned", second.pinned === false);
  check("{date} pins start to 2026-07-20", iso(pinned.start) === "2026-07-20", iso(pinned.start));
  check("{date} pin defaults to 1 day", iso(pinned.end) === "2026-07-21", iso(pinned.end));
  check("Bare-duration block has no errors", s.errors.length === 0, s.errors.join("; "));
}
{
  const s = schedule(`
- Z
  - Bad {2026-13-99, 5}
  - Worse {, 3x}
`);
  check("Invalid date reported", s.errors.some((e) => /invalid start/i.test(e)), s.errors.join("; "));
  check("Invalid duration reported", s.errors.some((e) => /invalid duration/i.test(e)), s.errors.join("; "));
}
console.log(`
${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
