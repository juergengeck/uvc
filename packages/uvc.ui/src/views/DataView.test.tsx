// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { DataView } from './DataView.js';
import type { UvcPlatform } from '../types.js';
import { downloadDataWorkbook } from '../data-export.js';

vi.mock('@tanstack/react-router', () => ({ Link: ({ to, children, ...props }: any) => <a href={to} {...props}>{children}</a> }));
vi.mock('../data-export.js', () => ({ downloadDataWorkbook: vi.fn() }));

it('exports real platform records and does not download an empty substitute when loading fails', async () => {
  const memory = { id: 'memory-1', title: 'Lamp care', prose: 'Inspect before use.', author: 'owner', facts: [], entities: [], sourceSubjects: [] };
  const platform = {
    listMemories: vi.fn(async () => [{ id: memory.id, title: memory.title, timestamp: 1, factsCount: 0, entitiesCount: 0 }]),
    getMemory: vi.fn(async () => memory),
    getDiscoveryRuntime: vi.fn(async () => ({ devices: [{ id: 'actual-device' }] })),
    listJournalRecords: vi.fn(async () => [{ id: 'actual-record' }]),
  } as unknown as UvcPlatform;
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  try {
    await act(async () => root.render(<DataView platform={platform} />));
    expect(container.textContent).toContain('Lamp care');
    const exportButton = [...container.querySelectorAll('button')].find(button => button.textContent?.includes('Export Excel'))!;
    await act(async () => exportButton.click());
    expect(downloadDataWorkbook).toHaveBeenCalledWith(expect.objectContaining({
      records: [{ id: 'actual-record' }], devices: [{ id: 'actual-device' }], memories: [memory],
    }));
    vi.mocked(downloadDataWorkbook).mockClear();
    vi.mocked(platform.listJournalRecords).mockRejectedValueOnce(new Error('Storage unavailable'));
    await act(async () => exportButton.click());
    expect(downloadDataWorkbook).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Storage unavailable');
  } finally {
    await act(async () => root.unmount());
    container.remove();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
  }
});
