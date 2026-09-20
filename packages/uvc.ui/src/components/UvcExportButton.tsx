import React from 'react';
import { Download, Printer } from 'lucide-react';

export interface UvcExportButtonProps {
  activeView: string;
  onClick: () => void;
  compact?: boolean;
  className?: string;
}

export function UvcExportButton({
  activeView,
  onClick,
  compact = false,
  className = '',
}: UvcExportButtonProps) {
  const getLabel = () => {
    switch (activeView) {
      case 'journal':
      case '/':
        return 'Export Disinfection Journal (EN 17141)';
      case 'devices':
      case '/settings/devices':
        return 'Export Resource Manifest';
      case 'roles':
      case '/roles':
        return 'Export Cryptographic Role Credentials';
      case 'data':
      case '/data':
        return 'Export Complete Backup (JSON)';
      default:
        return 'Export Audit Record';
    }
  };

  const title = getLabel();

  if (compact) {
    return (
      <button
        aria-label={title}
        className={`uvc-export-btn uvc-export-btn--compact ${className}`.trim()}
        data-testid="contextual-export-button"
        onClick={onClick}
        title={title}
        type="button"
      >
        <Printer aria-hidden="true" />
      </button>
    );
  }

  return (
    <button
      className={`uvc-export-btn ${className}`.trim()}
      data-testid="contextual-export-button"
      onClick={onClick}
      title={title}
      type="button"
    >
      <Printer aria-hidden="true" />
      <span>Export & Print</span>
    </button>
  );
}
