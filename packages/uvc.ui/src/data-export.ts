import { utils, write } from 'xlsx';
import type { UvcDevice, UvcJournalRecord } from './types.js';

export interface ExportMemory {
  id: string;
  title: string;
  summary?: string;
  prose: string;
  author: string;
  facts?: Array<{ statement: string; confidence: number; sourceRef?: string }>;
  entities?: Array<{ name: string; type: string; description?: string }>;
  sourceSubjects?: string[];
}

export interface UvcDataExport {
  exportedAt: string;
  records: UvcJournalRecord[];
  devices: UvcDevice[];
  memories: ExportMemory[];
}

type Cell = string | number | boolean;

function sheet(headers: string[], rows: Cell[][]) {
  const result = utils.aoa_to_sheet([headers, ...rows]);
  result['!autofilter'] = { ref: result['!ref']! };
  result['!cols'] = headers.map((header, i) => ({
    wch: Math.min(60, rows.reduce((width, row) => Math.max(width, String(row[i] ?? '').length + 2), Math.max(14, header.length + 2))),
  }));
  return result;
}

/** Explicit columns keep configuration credentials and internal transport details out of exports. */
export function createDataWorkbook(data: UvcDataExport) {
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, sheet(['Field', 'Value'], [
    ['Application', 'UVC'], ['Exported at (UTC)', data.exportedAt],
    ['Journal records', data.records.length], ['Devices', data.devices.length], ['Memories', data.memories.length],
    ['Scope', 'Journal records, discovered devices, and saved memories available to this instance.'],
  ]), 'Overview');
  utils.book_append_sheet(workbook, sheet([
    'Record ID', 'Type', 'Date (UTC)', 'Location', 'Resources', 'Status',
    'Duration (minutes)', 'Evidence count', 'Requested enabled', 'Observed enabled', 'Error',
  ], data.records.map(record => [
    record.id, record.kind ?? 'cycle', new Date(record.timestamp).toISOString(), record.location,
    record.resources.join(', '), record.status, record.kind === 'device-control' ? '' : record.durationMinutes ?? '',
    record.evidenceCount ?? '', record.kind === 'device-control' ? record.desiredEnabled : '',
    record.kind === 'device-control' ? record.observedEnabled ?? '' : '',
    record.kind === 'device-control' ? record.error ?? '' : '',
  ])), 'Journal');
  utils.book_append_sheet(workbook, sheet([
    'Device ID', 'Instance ID', 'Name', 'Type', 'Role', 'Online', 'Connected', 'Trust', 'Last seen', 'Capabilities',
  ], data.devices.map(device => [
    device.id, device.instanceId ?? '', device.name ?? '', device.type ?? '', device.role ?? '',
    device.online ?? '', device.connected ?? '', device.trustState ?? 'unknown', device.lastSeenAt ?? '',
    device.capabilities?.join(', ') ?? '',
  ])), 'Devices');
  utils.book_append_sheet(workbook, sheet(['Memory ID', 'Title', 'Summary', 'Content', 'Author'],
    data.memories.map(memory => [memory.id, memory.title, memory.summary ?? '', memory.prose, memory.author])), 'Memories');
  utils.book_append_sheet(workbook, sheet(['Memory ID', 'Statement', 'Confidence', 'Source'],
    data.memories.flatMap(memory => (memory.facts ?? []).map(fact => [memory.id, fact.statement, fact.confidence, fact.sourceRef ?? '']))), 'Memory facts');
  utils.book_append_sheet(workbook, sheet(['Memory ID', 'Name', 'Type', 'Description'],
    data.memories.flatMap(memory => (memory.entities ?? []).map(entity => [memory.id, entity.name, entity.type, entity.description ?? '']))), 'Memory entities');
  utils.book_append_sheet(workbook, sheet(['Memory ID', 'Subject ID'],
    data.memories.flatMap(memory => (memory.sourceSubjects ?? []).map(subject => [memory.id, subject]))), 'Memory sources');
  const continuations: Cell[][] = [];
  for (const name of workbook.SheetNames) {
    const worksheet = workbook.Sheets[name];
    for (const [address, cell] of Object.entries(worksheet)) {
      if (address.startsWith('!') || cell.t !== 's' || typeof cell.v !== 'string' || cell.v.length <= 32767) continue;
      const chunks: string[] = [];
      let remaining = cell.v;
      while (remaining.length) {
        let end = Math.min(32767, remaining.length);
        // Do not split a UTF-16 surrogate pair between Excel cells.
        const last = remaining.charCodeAt(end - 1);
        if (end < remaining.length && last >= 0xD800 && last <= 0xDBFF) end--;
        chunks.push(remaining.slice(0, end));
        remaining = remaining.slice(end);
      }
      cell.v = chunks[0];
      const position = utils.decode_cell(address);
      chunks.slice(1).forEach((text, index) => {
        continuations.push([name, position.r + 1, utils.encode_col(position.c), index + 2, text]);
      });
    }
  }
  if (continuations.length) {
    utils.book_append_sheet(workbook, sheet(['Sheet', 'Row', 'Column', 'Part', 'Text'], continuations), 'Text continuations');
    utils.sheet_add_aoa(workbook.Sheets.Overview, [[
      'Long text', 'Text beyond Excel’s cell limit continues in Text continuations. Append each part in order to its source cell.',
    ]], { origin: -1 });
    workbook.Sheets.Overview['!autofilter'] = { ref: workbook.Sheets.Overview['!ref']! };
  }
  return workbook;
}

export function downloadDataWorkbook(data: UvcDataExport): void {
  const bytes = write(createDataWorkbook(data), { bookType: 'xlsx', type: 'array' });
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `uvc-data-${data.exportedAt.slice(0, 10)}.xlsx`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
