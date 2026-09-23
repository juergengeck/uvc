import { Download } from 'lucide-react';

export interface UvcExportButtonProps {
  activeView: string;
  onClick: () => void;
  compact?: boolean;
  className?: string;
}

export function UvcExportButton({ onClick, compact = false, className = '' }: UvcExportButtonProps) {
  return (
    <button
      aria-label="Export data (Excel)"
      className={`uvc-export-btn ${compact ? 'uvc-export-btn--compact' : ''} ${className}`.trim()}
      data-testid="contextual-export-button"
      onClick={onClick}
      title="Export data (Excel)"
      type="button"
    >
      <Download aria-hidden="true" />
      {!compact && <span>Export data</span>}
    </button>
  );
}
