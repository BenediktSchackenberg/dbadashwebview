import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import StatusBadge from './StatusBadge';

/**
 * First component test in the suite. Besides covering StatusBadge it acts as a
 * guard for the vitest `include` glob: if `.tsx` tests ever stop being picked
 * up again, this file disappears from the run.
 */

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderBadge(props: Parameters<typeof StatusBadge>[0]) {
  act(() => {
    root.render(<StatusBadge {...props} />);
  });
  return container.textContent ?? '';
}

describe('StatusBadge', () => {
  // The DBADashStatusEnum mapping is documented in the README and relied on by
  // every dashboard. Swapping two of these silently mislabels fleet health.
  it.each([
    [1, 'Critical'],
    [2, 'Warning'],
    [3, 'N/A'],
    [4, 'OK'],
    [5, 'Acknowledged'],
  ])('renders status %i as "%s"', (status, expected) => {
    expect(renderBadge({ status })).toBe(expected);
  });

  it('falls back to N/A for an unknown status', () => {
    expect(renderBadge({ status: 99 })).toBe('N/A');
  });

  it('prefers an explicit label over the enum label', () => {
    expect(renderBadge({ status: 1, label: 'Offline' })).toBe('Offline');
  });

  it('applies the critical colour only to status 1', () => {
    renderBadge({ status: 1 });
    expect(container.querySelector('span')?.className).toContain('text-red-400');

    renderBadge({ status: 4 });
    expect(container.querySelector('span')?.className).toContain('text-emerald-400');
  });
});
