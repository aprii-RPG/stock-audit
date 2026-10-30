import Dexie, { type Table } from 'dexie';
import type { OfflineCountQueueItem } from '../types';

export class StockAuditDatabase extends Dexie {
  offlineCounts!: Table<OfflineCountQueueItem, string>;

  constructor() {
    super('StockAuditOfflineDB');
    this.version(1).stores({
      offlineCounts: 'id, auditId, productId, synced, timestamp',
    });
  }
}

export const db = new StockAuditDatabase();

// Helper to save offline count
export async function queueOfflineCount(item: Omit<OfflineCountQueueItem, 'id' | 'synced'>): Promise<OfflineCountQueueItem> {
  const id = `${item.auditId}_${item.productId}_${Date.now()}`;
  const record: OfflineCountQueueItem = {
    ...item,
    id,
    synced: false,
  };
  await db.offlineCounts.put(record);
  return record;
}

// Get all unsynced counts
export async function getUnsyncedOfflineCounts(): Promise<OfflineCountQueueItem[]> {
  return await db.offlineCounts.where('synced').equals(0).toArray();
}

// Mark an item as synced
export async function markAsSynced(id: string): Promise<void> {
  await db.offlineCounts.update(id, { synced: true });
}

// Count unsynced items
export async function getUnsyncedCount(): Promise<number> {
  return await db.offlineCounts.where('synced').equals(0).count();
}

// Clear synced historical entries to preserve storage
export async function clearSyncedItems(): Promise<void> {
  const synced = await db.offlineCounts.where('synced').equals(1).toArray();
  const ids = synced.map((s) => s.id);
  await db.offlineCounts.bulkDelete(ids);
}
