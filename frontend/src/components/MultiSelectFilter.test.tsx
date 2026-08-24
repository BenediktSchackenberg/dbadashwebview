import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import MultiSelectFilter from './MultiSelectFilter';

/**
 * The search box used to be cleared by an effect watching `open`, which tripped
 * react-hooks/set-state-in-effect. It is now cleared by the two user-driven
 * close paths instead, so these tests pin the behaviour that refactor had to
 * preserve: whichever way the dropdown is closed, the next open starts with an
 * empty search and the unfiltered list.
 */

// The search field only renders above this many options.
const OPTIONS = ['C:\\', 'D:\\', 'E:\\', 'F:\\', 'G:\\', 'H:\\', 'I:\\', 'J:\\', 'K:\\'];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <MultiSelectFilter
        label="Drives"
        options={OPTIONS}
        selected={[]}
        onChange={() => {}}
        mode="include"
        onModeChange={() => {}}
      />
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const toggleButton = () => container.querySelector('button')!;
const searchBox = () => container.querySelector<HTMLInputElement>('input[type="text"], input:not([type])');
const optionLabels = () => Array.from(container.querySelectorAll('label')).map(l => l.textContent);

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

/** React tracks the input value internally, so set it through the native setter. */
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function clickOutside() {
  act(() => {
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
}

describe('MultiSelectFilter', () => {
  it('shows a search box once there are more than 8 options', () => {
    expect(searchBox()).toBeNull();
    click(toggleButton());
    expect(searchBox()).not.toBeNull();
  });

  it('filters the options as you type', () => {
    click(toggleButton());
    type(searchBox()!, 'd:');
    expect(optionLabels()).toEqual(['D:\\']);
  });

  it('clears the search when closed with the toggle button', () => {
    click(toggleButton());
    type(searchBox()!, 'd:');
    click(toggleButton()); // close
    click(toggleButton()); // reopen

    expect(searchBox()!.value).toBe('');
    expect(optionLabels()).toHaveLength(OPTIONS.length);
  });

  it('clears the search when closed by clicking outside', () => {
    click(toggleButton());
    type(searchBox()!, 'd:');
    clickOutside();
    click(toggleButton()); // reopen

    expect(searchBox()!.value).toBe('');
    expect(optionLabels()).toHaveLength(OPTIONS.length);
  });
});
