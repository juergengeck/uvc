import { describe, expect, it } from 'vitest';
import { read, utils, write } from 'xlsx';
import { createDataWorkbook } from './data-export.js';

describe('Excel data export', () => {
  it('preserves long memory text in ordered continuation cells', () => {
    const prose = 'A'.repeat(32766) + '🟢' + 'B'.repeat(32766) + 'Last paragraph.';
    const book = read(write(createDataWorkbook({ exportedAt: '2026-09-22', devices: [], records: [],
      memories: [{ id: 'long', title: 'Long memory', author: 'owner', prose }],
    }), { type: 'array', bookType: 'xlsx' }), { type: 'array' });
    const parts = utils.sheet_to_json<{ Sheet: string; Row: number; Column: string; Part: number; Text: string }>(book.Sheets['Text continuations']);
    expect(parts.map(part => [part.Sheet, part.Row, part.Column, part.Part])).toEqual([
      ['Memories', 2, 'D', 2], ['Memories', 2, 'D', 3],
    ]);
    expect(book.Sheets.Memories.D2.v + parts.map(part => part.Text).join('')).toBe(prose);
  });
  it('round trips actual records, false observations, and formula-like text as data', () => {
    const book = createDataWorkbook({
      exportedAt: '2026-09-22T12:00:00.000Z',
      records: [{ kind: 'device-control', id: 'record-1', timestamp: 0, evidenceCount: 0, location: '=1+1', resources: ['lamp'], status: 'failed', operation: 'set', desiredEnabled: true, observedEnabled: false, error: 'No response' }],
      devices: [], memories: [],
    });
    const restored = read(write(book, { type: 'array', bookType: 'xlsx' }), { type: 'array' });
    expect(restored.SheetNames).toEqual(['Overview', 'Journal', 'Devices', 'Memories', 'Memory facts', 'Memory entities', 'Memory sources']);
    const rows = utils.sheet_to_json<Record<string, unknown>>(restored.Sheets.Journal);
    expect(rows[0]).toMatchObject({ 'Record ID': 'record-1', Location: '=1+1', 'Observed enabled': false, 'Evidence count': 0 });
    expect(restored.Sheets.Journal.D2.f).toBeUndefined();
    expect(utils.sheet_to_json(restored.Sheets.Devices)).toEqual([]);
  });
});
