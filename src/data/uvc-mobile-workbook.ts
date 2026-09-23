import {utils, write} from 'xlsx';

type Cell = string | number | boolean;

export interface MobileOrganisationRow {
  hash: string;
  name: string;
  description?: string;
  owner: string;
  created: number;
  modified: number;
}

export interface MobileDepartmentRow extends MobileOrganisationRow {
  organisation: string;
}

export interface MobileRoomRow extends MobileOrganisationRow {
  department: string;
  roomKind: string;
  deviceIds: string[];
}

export interface MobileFacilityRoomRow {
  roomId: string;
  name: string;
  roomKind: string;
  ownerPersonId: string;
  producerInstanceId: string;
  resourceHashes: string[];
  createdAt: number;
  updatedAt: number;
}

export interface MobileTreatmentRunRow {
  runId: string;
  roomIdHash: string;
  roomName: string;
  roomKind: string;
  status: string;
  scheduledAt?: number;
  startedAt?: number;
  endedAt?: number;
  uvcDoseMjCm2?: number;
  notes?: string;
  resourceHashes: string[];
  startObservationHashes: string[];
  stopObservationHashes: string[];
}

export interface MobileDeviceRow {
  id: string;
  name?: string;
  type?: string;
  deviceKind?: string;
  address?: string;
  port?: number;
  online?: boolean;
  lastSeen?: number;
}

export interface MobileUvcWorkbookData {
  exportedAt: string;
  organisations: MobileOrganisationRow[];
  departments: MobileDepartmentRow[];
  rooms: MobileRoomRow[];
  facilityRooms: MobileFacilityRoomRow[];
  treatmentRuns: MobileTreatmentRunRow[];
  devices: MobileDeviceRow[];
}

function iso(timestamp?: number): string {
  return timestamp === undefined ? '' : new Date(timestamp).toISOString();
}

function sheet(headers: string[], rows: Cell[][]) {
  const worksheet = utils.aoa_to_sheet([headers, ...rows]);
  worksheet['!autofilter'] = {ref: worksheet['!ref']!};
  worksheet['!cols'] = headers.map((header, index) => ({
    wch: Math.min(60, rows.reduce(
      (width, row) => Math.max(width, String(row[index] ?? '').length + 2),
      Math.max(14, header.length + 2),
    )),
  }));
  return worksheet;
}

function preserveLongCellText(workbook: ReturnType<typeof utils.book_new>): void {
  const continuations: Cell[][] = [];
  for (const name of workbook.SheetNames) {
    const worksheet = workbook.Sheets[name];
    for (const [address, cell] of Object.entries(worksheet)) {
      if (address.startsWith('!') || cell.t !== 's' || typeof cell.v !== 'string' || cell.v.length <= 32767) {
        continue;
      }
      const chunks: string[] = [];
      let remaining = cell.v;
      while (remaining.length > 0) {
        let end = Math.min(32767, remaining.length);
        const lastCodeUnit = remaining.charCodeAt(end - 1);
        if (end < remaining.length && lastCodeUnit >= 0xD800 && lastCodeUnit <= 0xDBFF) end--;
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
  if (continuations.length === 0) return;

  utils.book_append_sheet(
    workbook,
    sheet(['Sheet', 'Row', 'Column', 'Part', 'Text'], continuations),
    'Text continuations',
  );
  utils.sheet_add_aoa(workbook.Sheets.Overview, [[
    'Long text',
    'Text beyond Excel’s cell limit continues in Text continuations. Append each part in order to its source cell.',
  ]], {origin: -1});
  workbook.Sheets.Overview['!autofilter'] = {ref: workbook.Sheets.Overview['!ref']!};
}

/** Explicit columns avoid exporting credentials, transport secrets, or arbitrary settings blobs. */
export function createMobileUvcWorkbook(data: MobileUvcWorkbookData) {
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, sheet(['Field', 'Value'], [
    ['Application', 'UVC'],
    ['Exported at (UTC)', data.exportedAt],
    ['Organisations', data.organisations.length],
    ['Departments', data.departments.length],
    ['Rooms', data.rooms.length],
    ['Facility rooms', data.facilityRooms.length],
    ['Treatment runs', data.treatmentRuns.length],
    ['Discovered devices', data.devices.length],
    ['Scope', 'Stored organisation and facility records plus the current discovered-device snapshot.'],
  ]), 'Overview');
  utils.book_append_sheet(workbook, sheet(
    ['Object hash', 'Name', 'Description', 'Owner Person', 'Created (UTC)', 'Modified (UTC)'],
    data.organisations.map(row => [
      row.hash, row.name, row.description ?? '', row.owner, iso(row.created), iso(row.modified),
    ]),
  ), 'Organisations');
  utils.book_append_sheet(workbook, sheet(
    ['Object hash', 'Name', 'Description', 'Organisation hash', 'Owner Person', 'Created (UTC)', 'Modified (UTC)'],
    data.departments.map(row => [
      row.hash, row.name, row.description ?? '', row.organisation, row.owner,
      iso(row.created), iso(row.modified),
    ]),
  ), 'Departments');
  utils.book_append_sheet(workbook, sheet(
    ['Object hash', 'Name', 'Description', 'Department hash', 'Room kind', 'Device IDs', 'Owner Person', 'Created (UTC)', 'Modified (UTC)'],
    data.rooms.map(row => [
      row.hash, row.name, row.description ?? '', row.department, row.roomKind,
      row.deviceIds.join(', '), row.owner, iso(row.created), iso(row.modified),
    ]),
  ), 'Rooms');
  utils.book_append_sheet(workbook, sheet(
    ['Room ID', 'Name', 'Room kind', 'Owner Person', 'Producer Instance', 'Resource hashes', 'Created (UTC)', 'Updated (UTC)'],
    data.facilityRooms.map(row => [
      row.roomId, row.name, row.roomKind, row.ownerPersonId, row.producerInstanceId,
      row.resourceHashes.join(', '), iso(row.createdAt), iso(row.updatedAt),
    ]),
  ), 'Facility rooms');
  utils.book_append_sheet(workbook, sheet(
    ['Run ID', 'Room ID hash', 'Room', 'Room kind', 'Status', 'Scheduled (UTC)', 'Started (UTC)', 'Ended (UTC)', 'Dose (mJ/cm²)', 'Notes', 'Resource hashes', 'Start evidence', 'Stop evidence'],
    data.treatmentRuns.map(row => [
      row.runId, row.roomIdHash, row.roomName, row.roomKind, row.status,
      iso(row.scheduledAt), iso(row.startedAt), iso(row.endedAt), row.uvcDoseMjCm2 ?? '',
      row.notes ?? '', row.resourceHashes.join(', '), row.startObservationHashes.join(', '),
      row.stopObservationHashes.join(', '),
    ]),
  ), 'Treatment runs');
  utils.book_append_sheet(workbook, sheet(
    ['Device ID', 'Name', 'Type', 'Device kind', 'Address', 'Port', 'Online', 'Last seen (UTC)'],
    data.devices.map(row => [
      row.id, row.name ?? '', row.type ?? '', row.deviceKind ?? '', row.address ?? '',
      row.port ?? '', row.online ?? '', iso(row.lastSeen),
    ]),
  ), 'Devices');
  preserveLongCellText(workbook);
  return workbook;
}

export function writeMobileUvcWorkbook(
  data: MobileUvcWorkbookData,
  type: 'array' | 'base64',
): ArrayBuffer | string {
  return write(createMobileUvcWorkbook(data), {bookType: 'xlsx', type});
}
