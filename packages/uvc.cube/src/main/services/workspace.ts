import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { WorkspaceHighlight, WorkspacePackageInfo, WorkspaceSnapshot } from '@shared/contracts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function packageRoot(): string {
  return path.resolve(__dirname, '../..');
}

function workspaceRoot(): string {
  return path.resolve(packageRoot(), '../..');
}

const HIGHLIGHT_DEFINITIONS: Array<Omit<WorkspaceHighlight, 'status'>> = [
  {
    title: 'Connections',
    expectedPackage: '@refinio/connection.core',
    description: 'Pairing, transport handover, and connection orchestration primitives.',
  },
  {
    title: 'QUICVC',
    expectedPackage: '@refinio/quicvc-protocol',
    description: 'Wire-format and protocol support for QUICVC transport flows.',
  },
  {
    title: 'Trust',
    expectedPackage: '@refinio/trust.core',
    description: 'Attestation and trust workflows for device and user relationships.',
  },
  {
    title: 'BLE',
    expectedPackage: '@refinio/connection.btle',
    description: 'Bluetooth support for provisioning and nearby device interactions.',
  },
  {
    title: 'Audit',
    expectedPackage: '@refinio/one.audit',
    description: 'Workspace-level audit logging infrastructure.',
  },
  {
    title: 'API Bridge',
    expectedPackage: '@refinio/api',
    description: 'Desktop-to-service integration layer for ONE operations.',
  },
];

export async function readWorkspacePackages(): Promise<WorkspacePackageInfo[]> {
  const packagesDir = path.join(workspaceRoot(), 'packages');
  const entries = await fs.readdir(packagesDir, { withFileTypes: true });

  const packages = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const packageJsonPath = path.join(packagesDir, entry.name, 'package.json');
        try {
          const content = await fs.readFile(packageJsonPath, 'utf8');
          const pkg = JSON.parse(content) as {
            name?: string;
            version?: string;
            description?: string;
          };

          return {
            name: pkg.name ?? entry.name,
            version: pkg.version ?? '0.0.0',
            path: path.relative(workspaceRoot(), path.join(packagesDir, entry.name)),
            description: pkg.description,
          } as WorkspacePackageInfo;
        } catch {
          return undefined;
        }
      }),
  );

  return packages
    .filter((pkg): pkg is WorkspacePackageInfo => pkg !== undefined)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function getWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  const rootPath = workspaceRoot();
  const packagesPath = path.join(rootPath, 'packages');
  const packages = await readWorkspacePackages();
  const packageNames = packages.map((pkg) => pkg.name);

  return {
    rootPath,
    packagesPath,
    packageCount: packages.length,
    packageNames,
    packages,
    highlights: HIGHLIGHT_DEFINITIONS.map((highlight) => ({
      ...highlight,
      status: packageNames.includes(highlight.expectedPackage) ? 'available' : 'missing',
    })),
  };
}
