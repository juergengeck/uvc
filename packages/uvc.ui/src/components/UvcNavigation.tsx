import React from 'react';
import {
  CalendarDays,
  Radio,
  Building2,
  ShieldCheck,
  Database,
  Settings,
  ChevronLeft,
  Sun,
  Moon,
} from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { UvcExportButton } from './UvcExportButton.js';

export type SidebarState = 'expanded' | 'icons' | 'collapsed';

export interface NavItem {
  id: string;
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  badge?: number;
}

export const UVC_NAV_ITEMS: NavItem[] = [
  { id: 'journal', to: '/', label: 'Journal', icon: CalendarDays },
  { id: 'devices', to: '/settings/devices', label: 'Devices', icon: Radio },
  { id: 'rooms', to: '/rooms', label: 'Cleanrooms', icon: Building2 },
  { id: 'roles', to: '/roles', label: 'Governance', icon: ShieldCheck },
  { id: 'data', to: '/data', label: 'Data', icon: Database },
];

export interface UvcNavigationProps {
  activeView: string;
  sidebarState: SidebarState;
  onSidebarStateChange: (state: SidebarState) => void;
  onOpenExport: () => void;
  brandLogoUrl?: string;
  theme?: string;
  onToggleTheme?: () => void;
  badges?: Record<string, number>;
}

export function UvcNavigation({
  activeView,
  sidebarState,
  onSidebarStateChange,
  onOpenExport,
  brandLogoUrl,
  theme,
  onToggleTheme,
  badges,
}: UvcNavigationProps) {
  if (sidebarState === 'collapsed') {
    return null;
  }

  const expanded = sidebarState === 'expanded';

  return (
    <aside className={`sidebar uvc-sidebar ${expanded ? 'uvc-sidebar--expanded' : 'uvc-sidebar--icons'}`}>
      <div className="brand-block">
        <div className="brand-header">
          {brandLogoUrl ? (
            <img alt="UVC.one" className="brand-logo" src={brandLogoUrl} />
          ) : (
            <div className="brand-badge-row">
              <span className="brand-badge">254nm</span>
              <h1>UVC</h1>
            </div>
          )}
          {expanded && <span className="eyebrow">Cycle Record</span>}
        </div>
        {expanded && (
          <p className="brand-desc">
            Document where, when, and with which resources UVC cycles were executed.
          </p>
        )}
        <div className="brand-actions">
          <UvcExportButton
            activeView={activeView}
            compact={!expanded}
            onClick={onOpenExport}
          />
        </div>
      </div>

      <nav className="nav-list" aria-label="Primary">
        {UVC_NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const badgeCount = badges?.[item.id] ?? 0;
          return (
            <Link
              key={item.id}
              activeOptions={{ exact: item.to === '/' }}
              activeProps={{ className: 'nav-item nav-item--active' }}
              className="nav-item"
              title={expanded ? undefined : item.label}
              to={item.to}
            >
              <Icon aria-hidden="true" />
              {expanded && <span className="nav-label">{item.label}</span>}
              {badgeCount > 0 && (
                <span className="nav-badge">{badgeCount}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <nav className="nav-list nav-list--settings" aria-label="Application">
        <Link
          activeProps={{ className: 'nav-item nav-item--active' }}
          className="nav-item"
          title={expanded ? undefined : 'Settings'}
          to="/settings"
        >
          <Settings aria-hidden="true" />
          {expanded && <span className="nav-label">Settings</span>}
        </Link>

        {expanded ? (
          <button
            className="nav-item nav-collapse-btn"
            onClick={() => onSidebarStateChange('icons')}
            title="Collapse sidebar to icons"
            type="button"
          >
            <ChevronLeft aria-hidden="true" />
            <span className="nav-label">Collapse</span>
          </button>
        ) : (
          <button
            className="nav-item nav-collapse-btn"
            onClick={() => onSidebarStateChange('collapsed')}
            title="Hide sidebar"
            type="button"
          >
            <ChevronLeft aria-hidden="true" />
          </button>
        )}

        {onToggleTheme && (
          <button
            className="nav-item nav-theme-btn"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            type="button"
          >
            {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            {expanded && <span className="nav-label">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}
          </button>
        )}
      </nav>
    </aside>
  );
}
