/**
 * Persists the set of already-synced Raindrop IDs using Obsidian's plugin
 * data store so they survive restarts.
 */
export interface PluginData {
  syncedIds: string[];
  lastSync: string | null;
}

export const DEFAULT_DATA: PluginData = {
  syncedIds: [],
  lastSync: null,
};

export class SyncState {
  private synced: Set<string>;
  private lastSync: string | null;

  constructor(data: PluginData) {
    this.synced = new Set(data.syncedIds);
    this.lastSync = data.lastSync;
  }

  has(id: string): boolean {
    return this.synced.has(id);
  }

  add(id: string): void {
    this.synced.add(id);
  }

  getLastSync(): string | null {
    return this.lastSync;
  }

  setLastSync(iso: string): void {
    this.lastSync = iso;
  }

  toData(): PluginData {
    return {
      syncedIds: Array.from(this.synced),
      lastSync: this.lastSync,
    };
  }
}
