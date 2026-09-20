/**
 * Pure builders for the organisation structure pickers.
 *
 * The create-room / create-department screens reload their lists every time
 * they gain focus (a department created on the pushed screen must appear when
 * the user navigates back); these builders turn the model rows into display
 * options. Runtime-import-free so jest loads this exact module.
 */

export interface DepartmentRow {
  hash: string;
  department: { name: string; organisation: string };
}

export interface OrganisationRow {
  hash: string;
  organisation: { name: string };
}

export interface DepartmentOption {
  hash: string;
  department: { name: string; organisation: string };
  displayName: string;
  orgName: string;
}

/** Join departments to their organisations for `Name (Org)` display. */
export function buildDepartmentOptions(
  departments: DepartmentRow[],
  organisations: OrganisationRow[],
): DepartmentOption[] {
  const orgNames = new Map<string, string>();
  for (const org of organisations) {
    orgNames.set(org.hash, org.organisation.name);
  }
  return departments.map(item => {
    const orgName = orgNames.get(item.department.organisation) ?? 'Unknown';
    return {
      hash: item.hash,
      department: item.department,
      displayName: `${item.department.name} (${orgName})`,
      orgName,
    };
  });
}
