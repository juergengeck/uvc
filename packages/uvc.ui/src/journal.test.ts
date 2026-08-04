import { describe, expect, it } from 'vitest';

import { journalDateKey, projectJournalRecords } from './journal.js';

describe('UVC journal projection', () => {
  it('sorts persisted disinfection records newest first', () => {
    const entries = projectJournalRecords([
      {
        id: 'older',
        timestamp: Date.parse('2026-07-18T08:00:00Z'),
        location: 'Treatment room 1',
        resources: ['Lamp 1'],
        status: 'completed',
      },
      {
        id: 'newer',
        timestamp: Date.parse('2026-07-19T08:00:00Z'),
        location: 'Operating room 2',
        resources: ['Lamp 2', 'Sensor 2'],
        status: 'completed',
      },
    ]);

    expect(entries.map(entry => entry.id)).toEqual(['newer', 'older']);
  });

  it('does not create records for an empty journal', () => {
    expect(projectJournalRecords([])).toEqual([]);
  });

  it('drops records whose persisted timestamp cannot be represented', () => {
    expect(projectJournalRecords([{
      id: 'invalid',
      timestamp: Number.NaN,
      location: 'Unknown',
      resources: [],
      status: 'failed',
    }])).toEqual([]);
  });

  it('uses a stable local calendar key', () => {
    expect(journalDateKey(new Date(2026, 6, 9, 23, 30))).toBe('2026-07-09');
  });
});
