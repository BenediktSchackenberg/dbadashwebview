import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AlertsPage from './AlertsPage';

const apiMocks = vi.hoisted(() => ({
  instances: vi.fn(() => new Promise<never>(() => {})),
  alertsRecent: vi.fn(() => new Promise<never>(() => {})),
}));

vi.mock('../App', () => ({
  useRefresh: () => ({ lastRefresh: new Date(0), refresh: () => {} }),
}));

vi.mock('../api/api', () => ({ api: apiMocks }));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  apiMocks.instances.mockClear();
  apiMocks.alertsRecent.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('AlertsPage', () => {
  it('opens SQL Monitor deep links in the filtered legacy alerts feed', () => {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/alerts?instance=42&type=collection-errors']}>
          <AlertsPage />
        </MemoryRouter>
      );
    });

    const legacyTab = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent === 'Collection Errors & Failed Jobs');

    expect(legacyTab?.className).toContain('bg-blue-500/20');
    expect(apiMocks.alertsRecent).toHaveBeenCalledWith(42);
  });
});
