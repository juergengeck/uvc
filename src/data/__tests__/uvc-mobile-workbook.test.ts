import {describe, expect, it} from '@jest/globals';
import {read, utils} from 'xlsx';
import {createMobileUvcWorkbook, writeMobileUvcWorkbook} from '../uvc-mobile-workbook';

const data = {
  exportedAt: '2026-09-22T08:00:00.000Z',
  organisations: [{
    hash: 'org-hash', name: 'Clinic', owner: 'owner', created: 1, modified: 2,
  }],
  departments: [{
    hash: 'department-hash', name: 'Ward', owner: 'owner', organisation: 'org-hash',
    created: 3, modified: 4,
  }],
  rooms: [{
    hash: 'room-hash', name: 'Room 1', owner: 'owner', department: 'department-hash',
    roomKind: 'treatment-room', deviceIds: ['lamp-1'], created: 5, modified: 6,
  }],
  facilityRooms: [{
    roomId: 'room-1', name: 'Room 1', roomKind: 'treatment-room', ownerPersonId: 'owner',
    producerInstanceId: 'instance', resourceHashes: ['resource-hash'], createdAt: 7, updatedAt: 8,
  }],
  treatmentRuns: [{
    runId: 'run-1', roomIdHash: 'room-id-hash', roomName: 'Room 1',
    roomKind: 'treatment-room', status: 'completed', resourceHashes: ['resource-hash'],
    startObservationHashes: ['start-evidence'], stopObservationHashes: ['stop-evidence'],
  }],
  devices: [{id: 'lamp-1', name: 'Lamp', online: true}],
};

describe('mobile UVC workbook', () => {
  it('uses a stable seven-sheet schema with explicit operational data', () => {
    const workbook = createMobileUvcWorkbook(data);
    expect(workbook.SheetNames).toEqual([
      'Overview', 'Organisations', 'Departments', 'Rooms',
      'Facility rooms', 'Treatment runs', 'Devices',
    ]);
    expect(utils.sheet_to_json(workbook.Sheets.Rooms)).toEqual([
      expect.objectContaining({Name: 'Room 1', 'Room kind': 'treatment-room', 'Device IDs': 'lamp-1'}),
    ]);
    expect(utils.sheet_to_json(workbook.Sheets['Treatment runs'])).toEqual([
      expect.objectContaining({Status: 'completed', 'Start evidence': 'start-evidence'}),
    ]);
  });

  it('writes a workbook Excel can reopen', () => {
    const bytes = writeMobileUvcWorkbook(data, 'array') as ArrayBuffer;
    const reopened = read(bytes, {type: 'array'});
    expect(reopened.SheetNames).toEqual(createMobileUvcWorkbook(data).SheetNames);
    expect(utils.sheet_to_json(reopened.Sheets.Devices)).toEqual([
      expect.objectContaining({'Device ID': 'lamp-1', Online: true}),
    ]);
  });

  it('preserves text beyond the Excel cell limit in ordered continuation cells', () => {
    const notes = 'A'.repeat(32766) + '🟢' + 'B'.repeat(32766) + 'Last paragraph.';
    const bytes = writeMobileUvcWorkbook({
      ...data,
      treatmentRuns: [{...data.treatmentRuns[0], notes}],
    }, 'array') as ArrayBuffer;
    const reopened = read(bytes, {type: 'array'});
    const parts = utils.sheet_to_json<{
      Sheet: string;
      Row: number;
      Column: string;
      Part: number;
      Text: string;
    }>(reopened.Sheets['Text continuations']);
    expect(parts.map(part => [part.Sheet, part.Row, part.Column, part.Part])).toEqual([
      ['Treatment runs', 2, 'J', 2],
      ['Treatment runs', 2, 'J', 3],
    ]);
    expect(reopened.Sheets['Treatment runs'].J2.v + parts.map(part => part.Text).join('')).toBe(notes);
  });
});
