import { Notice, Plugin } from "obsidian";
import { RaindropSettings, DEFAULT_SETTINGS, RaindropSettingTab } from "./settings";
import { SyncState, DEFAULT_DATA, PluginData } from "./syncState";
import { fetchCollection } from "./raindrop";
import { fetchArticleText } from "./fetcher";
import { writeNote } from "./noteWriter";

export default class RaindropSyncPlugin extends Plugin {
  settings: RaindropSettings;
  private syncState: SyncState;
  private schedulerHandle: number | null = null;
  private statusBarItem: HTMLElement;
  private isSyncing = false;

  async onload() {
    await this.loadSettings();
    await this.loadSyncState();

    // Ribbon icon
    this.addRibbonIcon("refresh-cw", "Sync Raindrop.io", () => {
      this.triggerSync();
    });

    // Status bar
    this.statusBarItem = this.addStatusBarItem();
    this.updateStatusBar();

    // Command palette
    this.addCommand({
      id: "raindrop-sync-now",
      name: "Sync now",
      callback: () => this.triggerSync(),
    });

    // Settings tab
    this.addSettingTab(new RaindropSettingTab(this.app, this));

    // Start background scheduler
    this.startScheduler();
  }

  onunload() {
    this.stopScheduler();
  }

  // ---------------------------------------------------------------------------
  // Settings & state persistence
  // ---------------------------------------------------------------------------

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    // Merge settings with existing persisted data so syncState isn't overwritten.
    const existing: Partial<PluginData & RaindropSettings> =
      (await this.loadData()) ?? {};
    await this.saveData({ ...existing, ...this.settings });
  }

  private async loadSyncState() {
    const data: Partial<PluginData & RaindropSettings> =
      (await this.loadData()) ?? {};
    this.syncState = new SyncState({
      syncedIds: data.syncedIds ?? DEFAULT_DATA.syncedIds,
      lastSync: data.lastSync ?? DEFAULT_DATA.lastSync,
    });
  }

  private async persistSyncState() {
    const existing: Partial<PluginData & RaindropSettings> =
      (await this.loadData()) ?? {};
    await this.saveData({ ...existing, ...this.syncState.toData() });
  }

  // ---------------------------------------------------------------------------
  // Scheduler
  // ---------------------------------------------------------------------------

  startScheduler() {
    this.stopScheduler();
    const minutes = this.settings.syncIntervalMinutes;
    if (minutes > 0) {
      this.schedulerHandle = window.setInterval(
        () => this.runSync(),
        minutes * 60_000
      );
    }
  }

  stopScheduler() {
    if (this.schedulerHandle !== null) {
      window.clearInterval(this.schedulerHandle);
      this.schedulerHandle = null;
    }
  }

  /** Called from settings tab when the interval changes. */
  restartScheduler() {
    this.startScheduler();
  }

  // ---------------------------------------------------------------------------
  // Sync entry points
  // ---------------------------------------------------------------------------

  /** Safe public entry: shows notices, guards against concurrent runs. */
  triggerSync() {
    if (this.isSyncing) {
      new Notice("Raindrop Sync: already running…");
      return;
    }
    this.runSync().catch((err) => {
      console.error("Raindrop Sync error:", err);
      new Notice(`Raindrop Sync failed: ${err.message}`);
    });
  }

  private async runSync() {
    if (this.isSyncing) return;
    this.isSyncing = true;
    this.updateStatusBar("Syncing…");

    try {
      const { apiToken, collectionId, syncFolder } = this.settings;

      if (!apiToken) {
        new Notice("Raindrop Sync: please set your API token in settings.");
        return;
      }
      if (!collectionId) {
        new Notice("Raindrop Sync: please set the Collection ID in settings.");
        return;
      }

      const items = await fetchCollection(apiToken, collectionId);
      const unsyncedItems = items.filter(
        (item) => !this.syncState.has(item._id)
      );

      if (unsyncedItems.length === 0) {
        new Notice("Raindrop Sync: nothing new to sync.");
        this.syncState.setLastSync(new Date().toISOString());
        await this.persistSyncState();
        return;
      }

      let synced = 0;
      let failed = 0;

      for (const item of unsyncedItems) {
        try {
          const articleText = await fetchArticleText(item);
          await writeNote(this.app, item, articleText, syncFolder);
          this.syncState.add(item._id);
          synced++;
        } catch (err) {
          console.error(`Raindrop Sync: failed to sync item ${item._id}`, err);
          failed++;
        }
      }

      this.syncState.setLastSync(new Date().toISOString());
      await this.persistSyncState();

      const msg =
        failed > 0
          ? `Raindrop Sync: ${synced} synced, ${failed} failed.`
          : `Raindrop Sync: ${synced} new item${synced !== 1 ? "s" : ""} synced.`;

      new Notice(msg);
    } finally {
      this.isSyncing = false;
      this.updateStatusBar();
    }
  }

  // ---------------------------------------------------------------------------
  // Status bar
  // ---------------------------------------------------------------------------

  private updateStatusBar(text?: string) {
    if (!this.statusBarItem) return;
    if (text) {
      this.statusBarItem.setText(`☁ ${text}`);
      return;
    }
    const lastSync = this.syncState?.getLastSync();
    if (lastSync) {
      const d = new Date(lastSync);
      const formatted = d.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      this.statusBarItem.setText(`☁ Raindrop synced ${formatted}`);
    } else {
      this.statusBarItem.setText("☁ Raindrop: not synced yet");
    }
  }
}
