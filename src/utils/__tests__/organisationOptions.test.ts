import { buildDepartmentOptions } from '../organisationOptions.ts';

describe('organisation picker options', () => {
  it('joins departments to organisation names', () => {
    expect(
      buildDepartmentOptions(
        [
          { hash: 'd1', department: { name: 'Cardiology', organisation: 'o1' } },
          { hash: 'd2', department: { name: 'Oncology', organisation: 'missing' } },
        ],
        [{ hash: 'o1', organisation: { name: 'Clinix' } }],
      ),
    ).toEqual([
      { hash: 'd1', department: { name: 'Cardiology', organisation: 'o1' }, displayName: 'Cardiology (Clinix)', orgName: 'Clinix' },
      { hash: 'd2', department: { name: 'Oncology', organisation: 'missing' }, displayName: 'Oncology (Unknown)', orgName: 'Unknown' },
    ]);
  });

  it('returns an empty list without departments', () => {
    expect(buildDepartmentOptions([], [{ hash: 'o1', organisation: { name: 'Clinix' } }])).toEqual([]);
  });
});
