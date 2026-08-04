import type { UvcJournalRecord } from './types.js';

export type UvcJournalEntry = UvcJournalRecord & {date: Date};

export function journalDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function projectJournalRecords(records: UvcJournalRecord[]): UvcJournalEntry[] {
  return records
    .map(record => ({
      ...record,
      date: new Date(record.timestamp),
    }) as UvcJournalEntry)
    .filter(entry => !Number.isNaN(entry.date.getTime()))
    .sort((left, right) => right.date.getTime() - left.date.getTime());
}
