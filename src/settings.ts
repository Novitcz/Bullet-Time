import { App, PluginSettingTab, Setting } from "obsidian";
import type BulletTimePlugin from "./main";
import { DEFAULT_PALETTE } from "./types";

type NumericKey = "cellsPerDay" | "fontSize";

export class BulletTimeSettingTab extends PluginSettingTab {
	plugin: BulletTimePlugin;

	constructor(app: App, plugin: BulletTimePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private slider(name: string, desc: string, key: NumericKey, min: number, max: number): void {
		const s = this.plugin.settings;
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(desc)
			.addSlider((sl) =>
				sl
					.setLimits(min, max, 1)
					.setValue(s[key])
					.setDynamicTooltip()
					.onChange(async (v) => {
						s[key] = v;
						await this.plugin.saveAndRefresh();
					})
			);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const s = this.plugin.settings;

		new Setting(containerEl).setName("Defaults").setHeading();

		new Setting(containerEl)
			.setName("Day model")
			.setDesc("How durations are counted unless a block sets its own `mode:`.")
			.addDropdown((d) =>
				d
					.addOption("calendar", "Calendar days")
					.addOption("workdays", "Work days (Mon–Fri)")
					.setValue(s.dayModel)
					.onChange(async (v) => {
						s.dayModel = v as typeof s.dayModel;
						await this.plugin.saveAndRefresh();
					})
			);

		new Setting(containerEl)
			.setName("Week starts on")
			.setDesc("Controls week separators and weekend shading.")
			.addDropdown((d) =>
				d
					.addOption("mon", "Monday")
					.addOption("sun", "Sunday")
					.setValue(s.weekStart)
					.onChange(async (v) => {
						s.weekStart = v as typeof s.weekStart;
						await this.plugin.saveAndRefresh();
					})
			);

		new Setting(containerEl)
			.setName("Hours per day")
			.setDesc("Used to convert `h` durations (e.g. 4h) into a fraction of a day.")
			.addText((t) =>
				t.setValue(String(s.hoursPerDay)).onChange(async (v) => {
					const n = parseFloat(v);
					if (n > 0) {
						s.hoursPerDay = n;
						await this.plugin.saveAndRefresh();
					}
				})
			);

		new Setting(containerEl).setName("Appearance").setHeading();

		this.slider("Cells per day", "Character columns per day (horizontal zoom).", "cellsPerDay", 1, 4);
		this.slider("Font size", "Monospace grid font size (px).", "fontSize", 9, 20);
		new Setting(containerEl)
			.setName("Show date ruler")
			.setDesc("Draw the month names and week-start day numbers above the bars.")
			.addToggle((t) =>
				t.setValue(s.showRuler).onChange(async (v) => {
					s.showRuler = v;
					await this.plugin.saveAndRefresh();
				})
			);

		new Setting(containerEl)
			.setName("Overtime color")
			.setDesc("Fill for work that runs past a project's planned total.")
			.addText((t) =>
				t.setValue(s.overtimeColor).onChange(async (v) => {
					if (v.trim()) {
						s.overtimeColor = v.trim();
						await this.plugin.saveAndRefresh();
					}
				})
			);

		new Setting(containerEl)
			.setName("Reset palette")
			.setDesc("Restore the default lane colors.")
			.addButton((b) =>
				b.setButtonText("Reset").onClick(async () => {
					s.palette = [...DEFAULT_PALETTE];
					await this.plugin.saveAndRefresh();
				})
			);
	}
}
