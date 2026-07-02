// Renders a *plain bullet list* (not a code block) as a timeline in Reading view.
// A list opts in via a hidden `%% bullet-time … %%` comment marker, placed either:
//
//   As the FIRST list item (recommended — renders immediately when edited):
//     - %% bullet-time mode:workdays title:Sprint 24 %%
//     - Alice
//       - Design {2026-07-01, 5}
//
//   Or on the line directly ABOVE the list (also works, but Obsidian only
//   re-renders it once the note is fully reloaded, since the marker is a
//   separate block from the list):
//     %% bullet-time %%
//     - Alice
//
// Either way the list stays a regular list (auto-bullets, native edit visuals),
// and the marker carries optional per-list config.

import { MarkdownPostProcessorContext } from "obsidian";
import { renderBulletTime } from "./render";
import { BulletTimeSettings } from "./types";

// Accept the current keyword and the former "timeblock" for backward compatibility.
const KW = "(?:bullet-time|timeblock)";
const ABOVE_MARKER = new RegExp(`^\\s*%%\\s*${KW}\\b\\s*(.*?)\\s*%%\\s*$`, "i");
const ITEM_MARKER = new RegExp(`^\\s*[-*+]\\s*%%\\s*${KW}\\b\\s*(.*?)\\s*%%\\s*$`, "i");

/** Config string from a marker on the line immediately above the list, or undefined. */
function markerAbove(text: string, lineStart: number): string | undefined {
	const lines = text.split("\n");
	let i = lineStart - 1;
	while (i >= 0 && lines[i].trim() === "") i--;
	if (i < 0) return undefined;
	const m = ABOVE_MARKER.exec(lines[i]);
	return m ? m[1] || "" : undefined;
}

/** Turn "mode:workdays title:Sprint 24" into header lines the parser understands. */
function markerToHeaders(cfg: string): string {
	if (!cfg) return "";
	const out: string[] = [];
	let rest = cfg;
	// title: may contain spaces, so it consumes the remainder of the string.
	const t = /(?:^|\s)title:(.*)$/i.exec(cfg);
	if (t) {
		out.push("title: " + t[1].trim());
		rest = cfg.slice(0, t.index);
	}
	for (const tok of rest.split(/\s+/)) {
		if (!tok) continue;
		const idx = tok.indexOf(":");
		if (idx > 0) out.push(tok.slice(0, idx) + ": " + tok.slice(idx + 1));
		// Bare boolean flags (e.g. `wide`, `center`) pass through as their own line.
		else if (/^(wide|center)$/i.test(tok)) out.push(tok);
	}
	return out.join("\n");
}

export function processListTimelines(
	el: HTMLElement,
	ctx: MarkdownPostProcessorContext,
	settings: BulletTimeSettings
): void {
	const uls = Array.from(el.querySelectorAll("ul")) as HTMLElement[];
	for (const ul of uls) {
		// Only handle top-level lists; nested <ul>s belong to their parent list.
		if (ul.parentElement && ul.parentElement.closest("ul")) continue;

		const info = ctx.getSectionInfo(ul);
		if (!info) continue;

		const blockLines = info.text.split("\n").slice(info.lineStart, info.lineEnd + 1);

		let cfg: string | undefined;
		let bodyLines = blockLines;

		// Preferred: marker as the first list item — part of the list block, so any
		// edit invalidates the render cache and the timeline appears immediately.
		const firstIdx = blockLines.findIndex((l) => l.trim() !== "");
		const im = firstIdx >= 0 ? ITEM_MARKER.exec(blockLines[firstIdx]) : null;
		if (im) {
			cfg = im[1] || "";
			bodyLines = blockLines.slice(0, firstIdx).concat(blockLines.slice(firstIdx + 1));
		} else {
			// Fallback: marker on the line above the list.
			cfg = markerAbove(info.text, info.lineStart);
			if (cfg === undefined) continue;
		}

		const headers = markerToHeaders(cfg);
		const listText = bodyLines.join("\n");
		const source = headers ? headers + "\n" + listText : listText;

		const container = document.createElement("div");
		renderBulletTime(source, container, settings);
		ul.replaceWith(container);
	}
}
