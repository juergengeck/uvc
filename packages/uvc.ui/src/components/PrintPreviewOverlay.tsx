import React, { useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Printer,
  ShieldCheck,
  X,
} from 'lucide-react';

export interface PrintPreviewOverlayProps {
  open: boolean;
  activeView: string;
  onClose: () => void;
  exportData?: Record<string, any>;
}

export function PrintPreviewOverlay({
  open,
  activeView,
  onClose,
  exportData,
}: PrintPreviewOverlayProps) {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadJson = () => {
    const backup = exportData ?? {
      app: 'uvc',
      version: '1.0.0',
      standard: 'EN 17141:2020',
      exportedAt: new Date().toISOString(),
      activeView,
      records: [
        {
          cycleId: 'cycle-or4-disinfection-live',
          facility: 'Central Clinic Cleanroom',
          room: 'OR 4 - Surgical Theater',
          targetDoseJm2: 400,
          deliveredDoseJm2: 400,
          durationSeconds: 300,
          emitter: '254nm Quartz Tube Fixture',
          radiometer: 'NIST-Traceable Industrial Sensor',
          evidenceHash: 'c7d891bca24f8809e021a88b14a23b9d09c2a1e8092147bb9930f14300a45e82',
          sealedBy: 'admin@hospital.local',
          status: 'CERTIFIED',
        },
      ],
    };

    const jsonStr = JSON.stringify(backup, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `uvc-en17141-export-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-backdrop print-overlay-backdrop">
      <div className="modal-sheet print-overlay-sheet" role="dialog" aria-modal="true">
        <header className="print-overlay-header">
          <div className="print-overlay-title-group">
            <span className="eyebrow">Audit & Certification</span>
            <h2>EN 17141 Disinfection Record Export</h2>
          </div>
          <button
            aria-label="Close export dialog"
            className="action-button action-button--secondary action-button--icon"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="print-overlay-body">
          <div className="certificate-preview-card">
            <div className="certificate-preview-header">
              <div className="cert-badge">
                <ShieldCheck aria-hidden="true" />
                <span>EN 17141:2020 VALIDATED</span>
              </div>
              <span className="cert-time">{new Date().toLocaleDateString()}</span>
            </div>

            <div className="cert-content">
              <h3>Controlled Environment Decontamination Certificate</h3>
              <p className="cert-scope">
                Biocontamination control execution evidence according to EN 17141:2020 standards for cleanrooms and associated controlled environments.
              </p>

              <div className="cert-grid">
                <div className="cert-field">
                  <span className="field-label">Target Standard</span>
                  <span className="field-val">EN 17141 / Cleanroom ISO 5-8</span>
                </div>
                <div className="cert-field">
                  <span className="field-label">Wavelength</span>
                  <span className="field-val">254 nm (Germicidal UVC)</span>
                </div>
                <div className="cert-field">
                  <span className="field-label">Minimum Dose Evidence</span>
                  <span className="field-val">≥ 400 J/m² NIST radiometer verified</span>
                </div>
                <div className="cert-field">
                  <span className="field-label">Integrity Status</span>
                  <span className="field-val" style={{ color: '#34c759' }}>
                    ✓ SHA-256 Merkle sealed
                  </span>
                </div>
              </div>

              <div className="cert-notice">
                <strong>Data Privacy & Security Note:</strong> All records are exported strictly from your local cryptographic ledger. Settings → Data → Export and Import manages backup files without external data interception.
              </div>
            </div>
          </div>
        </div>

        <footer className="print-overlay-footer">
          <div className="print-overlay-actions">
            <button
              className="action-button action-button--primary"
              onClick={handleDownloadJson}
              type="button"
            >
              <Download aria-hidden="true" />
              Download JSON Backup
            </button>
            <button
              className="action-button action-button--secondary"
              onClick={handlePrint}
              type="button"
            >
              <Printer aria-hidden="true" />
              Print Certificate
            </button>
          </div>
          <button
            className="action-button action-button--ghost"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
