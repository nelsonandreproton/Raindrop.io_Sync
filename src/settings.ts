import { App, PluginSettingTab, Setting } from "obsidian";
import type RaindropSyncPlugin from "./main";

export interface RaindropSettings {
  apiToken: string;
  collectionId: string;
  syncFolder: string;
  syncIntervalMinutes: number;
}

export const DEFAULT_SETTINGS: RaindropSettings = {
  apiToken: "",
  collectionId: "",
  syncFolder: "Raindrop",
  syncIntervalMinutes: 30,
};

export class RaindropSettingTab extends PluginSettingTab {
  plugin: RaindropSyncPlugin;

  constructor(app: App, plugin: RaindropSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Raindrop.io Sync" });

    new Setting(containerEl)
      .setName("API Token")
      .setDesc(
        "Your Raindrop.io Test Token. Get it from app.raindrop.io → Settings → Integrations → Create test token."
      )
      .addText((text) => {
        // Mask the token so it is not displayed in plain text on screen.
        text.inputEl.type = "password";
        text
          .setPlaceholder("paste token here")
          .setValue(this.plugin.settings.apiToken)
          .onChange(async (value) => {
            this.plugin.settings.apiToken = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Collection ID")
      .setDesc(
        "The numeric ID of the Raindrop collection to sync. Find it in the URL when you open the collection: raindrop.io/app/collection/XXXXXXX"
      )
      .addText((text) =>
        text
          .setPlaceholder("e.g. 12345678")
          .setValue(this.plugin.settings.collectionId)
          .onChange(async (value) => {
            this.plugin.settings.collectionId = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Sync folder")
      .setDesc(
        "Vault folder where synced notes will be saved. Notes are organised as YYYY/MM/DD subfolders inside this folder."
      )
      .addText((text) =>
        text
          .setPlaceholder("Raindrop")
          .setValue(this.plugin.settings.syncFolder)
          .onChange(async (value) => {
            this.plugin.settings.syncFolder = value.trim() || "Raindrop";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Sync interval (minutes)")
      .setDesc(
        "How often the plugin automatically syncs in the background. Set to 0 to disable automatic sync."
      )
      .addSlider((slider) =>
        slider
          .setLimits(0, 120, 5)
          .setValue(this.plugin.settings.syncIntervalMinutes)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.syncIntervalMinutes = value;
            await this.plugin.saveSettings();
            this.plugin.restartScheduler();
          })
      );

    new Setting(containerEl)
      .setName("Sync now")
      .setDesc("Manually trigger a sync immediately.")
      .addButton((btn) =>
        btn
          .setButtonText("Sync now")
          .setCta()
          .onClick(() => {
            this.plugin.triggerSync();
          })
      );
  }
}
