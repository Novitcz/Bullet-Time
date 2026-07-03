// Entry point for a bullet-time code block: parse + schedule once, then render
// as monospace text art.

import { parseBulletTime } from "./parser";
import { scheduleBlock } from "./schedule";
import { renderTui } from "./render_tui";
import { BlockConfig, BulletTimeSettings } from "./types";

function renderErrors(container: HTMLElement, messages: string[]): void {
	// The container's own document, so rendering works in popout windows too.
	const doc = container.ownerDocument;
	const box = doc.createElement("div");
	box.className = "bt-errors";
	const title = doc.createElement("div");
	title.className = "bt-errors-title";
	title.textContent = "Bullet-time";
	box.appendChild(title);
	for (const m of messages) {
		const line = doc.createElement("div");
		line.className = "bt-error";
		line.textContent = m;
		box.appendChild(line);
	}
	container.appendChild(box);
}

export function renderBulletTime(
	source: string,
	container: HTMLElement,
	settings: BulletTimeSettings
): void {
	while (container.firstChild) container.removeChild(container.firstChild);
	container.classList.add("bt-host");

	const defaults: BlockConfig = {
		mode: settings.dayModel,
		weekStart: settings.weekStart,
		hoursPerDay: settings.hoursPerDay,
	};

	try {
		const parsed = parseBulletTime(source, defaults);
		container.classList.toggle("bt-wide", !!parsed.config.wide);
		container.classList.toggle("bt-center", !!parsed.config.center);
		const schedule = scheduleBlock(parsed, settings.palette, settings.overtimeColor);
		renderTui(schedule, container, settings);
		if (schedule.errors.length) renderErrors(container, schedule.errors);
	} catch (e) {
		renderErrors(container, [`Unexpected error: ${(e as Error).message}`]);
	}
}
