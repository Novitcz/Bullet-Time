import { MarkdownView, Plugin, debounce } from "obsidian";
import { renderBulletTime } from "./render";
import { processListTimelines } from "./listtimeline";
import { BulletTimeSettingTab } from "./settings";
import { DEFAULT_SETTINGS, BulletTimeSettings } from "./types";

export default class BulletTimePlugin extends Plugin {
	settings: BulletTimeSettings = { ...DEFAULT_SETTINGS };
	// Source last handed to Reading view per note, so a mode switch only busts
	// the render cache when the text actually changed.
	private lastRendered = new WeakMap<MarkdownView, string>();

	async onload(): Promise<void> {
		await this.loadSettings();

		// Fenced code block: renders in Reading view AND Live Preview.
		this.registerMarkdownCodeBlockProcessor("bullet-time", (source, el) => {
			renderBulletTime(source, el, this.settings);
		});

		// Plain bullet list marked with `%% bullet-time %%`: renders in Reading view.
		this.registerMarkdownPostProcessor((el, ctx) => {
			processListTimelines(el, ctx, this.settings);
		});

		// Obsidian caches rendered sections, so toggling into Reading view after an
		// edit can show a stale timeline until the note is fully reloaded. When the
		// layout changes (e.g. edit ↔ reading), force a fresh render if the active
		// note's text changed since we last rendered it — the guard avoids flicker
		// on unrelated layout changes (sidebars, splits).
		const refreshIfStale = debounce(
			() => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!view) return;
				const src = view.getViewData();
				if (this.lastRendered.get(view) === src) return;
				this.lastRendered.set(view, src);
				view.previewMode?.rerender(true);
			},
			50,
			true
		);
		this.registerEvent(this.app.workspace.on("layout-change", refreshIfStale));

		// Manual escape hatch: bind a hotkey to force-refresh the current note.
		this.addCommand({
			id: "refresh-timelines",
			name: "Refresh timelines in current note",
			callback: () => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (view) {
					this.lastRendered.set(view, view.getViewData());
					view.previewMode?.rerender(true);
				}
			},
		});

		this.addSettingTab(new BulletTimeSettingTab(this.app, this));
	}

	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) as Partial<BulletTimeSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
		// Never let a corrupt/empty palette slip through.
		if (!Array.isArray(this.settings.palette) || this.settings.palette.length === 0) {
			this.settings.palette = [...DEFAULT_SETTINGS.palette];
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/** Persist settings and force any open notes to re-render their bullet-times. */
	async saveAndRefresh(): Promise<void> {
		await this.saveSettings();
		this.app.workspace.getLeavesOfType("markdown").forEach((leaf) => {
			const view = leaf.view;
			if (view instanceof MarkdownView) {
				view.previewMode?.rerender(true);
			}
		});
	}
}
