import React, { useId } from 'react';
import {
  CalendarDays,
  Notebook,
  Radio,
  Building2,
  ShieldCheck,
  Settings,
  ChevronLeft,
} from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { UvcExportButton } from './UvcExportButton.js';

const defaultLogoUrl = new URL('../assets/uvc-logo.png', import.meta.url).href;

export function UvcLogo({ src }: { src?: string }) {
  const filterId = `uvc-logo-${useId().replace(/:/g, '')}`;
  return (
    <>
      <svg width="0" height="0" aria-hidden="true" style={{position: 'absolute'}}>
        <defs><filter id={filterId} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values={[228, 232, 236].flatMap((value, index) => {
            const factor = (value - [43, 180, 66][index]) / 137;
            return [factor, -factor, 0, 0, value / 255];
          }).concat([0, 0, 0, 1, 0]).join(' ')} />
        </filter></defs>
      </svg>
      <img alt="UVC" className="brand-logo" style={{ '--uvc-logo-filter': `url(#${filterId})` } as React.CSSProperties} src={src ?? defaultLogoUrl} />
    </>
  );
}

export type SidebarState = 'expanded' | 'icons' | 'collapsed';

export interface NavItem {
  id: string;
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  badge?: number;
}

export const UVC_NAV_ITEMS: NavItem[] = [
  { id: 'journal', to: '/', label: 'Journal', icon: Notebook },
  { id: 'calendar', to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'devices', to: '/settings/devices', label: 'Devices', icon: Radio },
  { id: 'rooms', to: '/rooms', label: 'Rooms', icon: Building2 },
  { id: 'roles', to: '/roles', label: 'Governance', icon: ShieldCheck },
];

export interface UvcNavigationProps {
  activeView: string;
  sidebarState: SidebarState;
  onSidebarStateChange: (state: SidebarState) => void;
  onOpenExport: () => void;
  brandLogoUrl?: string;
  badges?: Record<string, number>;
}

export function UvcNavigation({
  activeView,
  sidebarState,
  onSidebarStateChange,
  onOpenExport,
  brandLogoUrl,
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
          <UvcLogo src={brandLogoUrl} />
        </div>
        {expanded && (
          <p className="brand-desc">
            Cycle records
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
          activeOptions={{ exact: true }}
          activeProps={{ className: 'nav-item nav-item--active' }}
          className={`nav-item${activeView.startsWith('/settings/data') ? ' nav-item--active' : ''}`}
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

      </nav>
    </aside>
  );
}

/** Mobile navigation is independent of the desktop sidebar's collapse state. */
export function UvcMobileNavigation() {
  return (
    <nav className="uvc-mobile-nav" aria-label="Primary">
      {UVC_NAV_ITEMS.filter(item => item.id !== 'roles').map(item => {
        const Icon = item.icon;
        return (
          <Link key={item.id} to={item.to} className="uvc-mobile-nav__item"
            activeOptions={{ exact: item.to === '/' }}
            activeProps={{ className: 'uvc-mobile-nav__item--active', 'aria-current': 'page' }}>
            <Icon aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
