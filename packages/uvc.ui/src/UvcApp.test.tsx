// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

import { UvcApp } from './UvcApp.js';
import type { UvcPlatform } from './types.js';

it('applies appearance, uses the supplied logo, and keeps the header aligned with navigation', async () => {
  const platform = {
    getSettingsSections: async () => [],
    listJournalRecords: async () => [],
    listMemories: async () => [],
    getDiscoveryRuntime: async () => ({ devices: [] }),
    subscribeDiscovery: () => () => {},
  } as unknown as UvcPlatform;
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

  try {
    await act(async () => {
      root.render(<UvcApp DevicesView={() => null} platform={platform} />);
    });
    await vi.waitFor(() => expect(container.querySelector('.brand-logo')).not.toBeNull());
    expect(container.querySelector('img')?.getAttribute('src')).toContain('uvc-logo.png');
    expect(document.documentElement.dataset.uvcTheme).toBe('light');

    expect(container.querySelector('.view-switcher')).toBeNull();
    const calendarLinks = [...container.querySelectorAll('nav[aria-label="Primary"] a')]
      .filter(link => link.textContent === 'Calendar');
    expect(calendarLinks).toHaveLength(2);
    await act(async () => {
      calendarLinks[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
    await vi.waitFor(() => expect(container.querySelector('.app-topbar__title')?.textContent).toBe('Calendar'));
    expect(container.querySelector('.journal-calendar')).not.toBeNull();
    expect(window.location.hash).toContain('/calendar');

    await act(async () => {
      const rooms = [...container.querySelectorAll('a')].find(link => link.textContent === 'Rooms');
      rooms!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
    await vi.waitFor(() => expect(container.querySelector('.app-topbar__title')?.textContent).toBe('Rooms'));

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[title="Switch to dark mode"]')!.click();
    });
    expect(document.documentElement.dataset.uvcTheme).toBe('dark');

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[title="Switch to light mode"]')!.click();
    });
    expect(document.documentElement.dataset.uvcTheme).toBe('light');

    expect([...container.querySelectorAll('nav[aria-label="Primary"] a')].some(link => link.textContent === 'Data')).toBe(false);
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Export data (Excel)"]')!.click();
    });
    await vi.waitFor(() => expect(container.querySelector('.app-topbar__title')?.textContent).toBe('Data & Memory'));
    expect(container.textContent).toContain('Export Excel (.xlsx)');
    expect(container.textContent).toContain('No memories yet');
    expect(window.location.hash).toContain('/settings/data');
  } finally {
    await act(async () => root.unmount());
    container.remove();
    scrollTo.mockRestore();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
  }
});
