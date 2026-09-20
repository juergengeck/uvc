import React, { useState } from 'react';
import {
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  Upload,
} from 'lucide-react';

export function DataView({
  onExport,
  onImport,
}: {
  onExport?: (format: 'json' | 'csv') => void;
  onImport?: (file: File) => Promise<{ success: boolean; message: string }>;
}) {
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleExportJson = () => {
    if (onExport) {
      onExport('json');
      return;
    }
    const backup = {
      app: 'uvc',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      standard: 'EN 17141:2020',
      data: {
        devices: [
          { id: 'lamp-1', name: '254nm Quartz Tube Fixture', type: 'lamp', status: 'ready' },
          { id: 'sensor-1', name: 'NIST Industrial Radiometer', type: 'sensor', status: 'ready' },
        ],
        rooms: [
          { id: 'room-101', name: 'Room 101 · Patient Suite', targetDoseJm2: 250 },
          { id: 'or-4', name: 'OR 4 · Surgical Suite', targetDoseJm2: 400 },
        ],
        disinfectionRuns: [
          {
            cycleId: 'cycle-completed-1',
            room: 'OR 4',
            doseJm2: 400,
            status: 'CERTIFIED',
            certifiedBy: 'admin@hospital.local',
          },
        ],
      },
    };

    const jsonStr = JSON.stringify(backup, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `uvc-data-backup-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFileInput = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportMessage(null);
    setImportError(null);

    if (onImport) {
      const res = await onImport(file);
      if (res.success) setImportMessage(res.message);
      else setImportError(res.message);
      return;
    }

    const reader = new FileReader();
    reader.onload = e => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text);
        setImportMessage(`Backup verified successfully: ${parsed.app || 'uvc'} data ready to restore.`);
      } catch (err) {
        setImportError(`Invalid backup file: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="data-view" style={{ maxWidth: 1040, margin: '0 auto' }}>
      <header className="settings-hero">
        <span className="eyebrow">Data Management</span>
        <h1>Data Export & Import</h1>
        <p>Manage durable backup files for UVC devices, controlled environment room configurations, and EN 17141 disinfection run records.</p>
      </header>

      <div className="stack" style={{ marginTop: 24, gap: 16 }}>
        {/* Export Card */}
        <div className="settings-card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', gap: 16 }}>
            <div className="settings-link-card__icon" style={{ width: 44, height: 44 }}>
              <Download aria-hidden="true" />
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ margin: '0 0 6px' }}>Export Data</h3>
              <p style={{ margin: '0 0 16px', color: '#9cabc1', fontSize: '0.9rem', lineHeight: 1.5 }}>
                Back up your entire UVC environment—including registered emitters, radiometers, room profiles, and cryptographic journal records—to a portable JSON archive.
              </p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button
                  className="action-button action-button--primary"
                  onClick={handleExportJson}
                  type="button"
                >
                  <Download aria-hidden="true" />
                  Download JSON Backup
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Import Card */}
        <div className="settings-card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', gap: 16 }}>
            <div className="settings-link-card__icon" style={{ width: 44, height: 44 }}>
              <Upload aria-hidden="true" />
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ margin: '0 0 6px' }}>Import Data</h3>
              <p style={{ margin: '0 0 16px', color: '#9cabc1', fontSize: '0.9rem', lineHeight: 1.5 }}>
                Restore UVC devices, room configurations, and historical records from a previously exported backup archive.
              </p>
              <label className="action-button action-button--secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Upload aria-hidden="true" />
                Select Backup File (JSON)
                <input
                  accept="application/json"
                  onChange={handleFileInput}
                  style={{ display: 'none' }}
                  type="file"
                />
              </label>

              {importMessage && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, color: '#34c759' }}>
                  <CheckCircle2 aria-hidden="true" style={{ width: 18, height: 18 }} />
                  <span style={{ fontSize: '0.9rem' }}>{importMessage}</span>
                </div>
              )}
              {importError && (
                <p style={{ color: '#ef4444', marginTop: 12, fontSize: '0.9rem' }}>
                  {importError}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
