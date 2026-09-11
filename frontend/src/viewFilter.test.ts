import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearAdminViewTags,
  encodeAdminViewTagsHeader,
  getAdminViewTags,
  normalizeAdminViewTags,
  setAdminViewTags,
} from './viewFilter';

describe('admin view tag filter', () => {
  beforeEach(() => sessionStorage.clear());

  it('normalizes, trims, and deduplicates tag names', () => {
    expect(normalizeAdminViewTags([' prod ', 'Prod', '', 42, 'dev'])).toEqual(['prod', 'dev']);
  });

  it('persists the filter for the current browser session only', () => {
    setAdminViewTags(['prod', 'team blue']);
    expect(getAdminViewTags()).toEqual(['prod', 'team blue']);

    clearAdminViewTags();
    expect(getAdminViewTags()).toEqual([]);
  });

  it('encodes tag names safely for the request header', () => {
    expect(encodeAdminViewTagsHeader(['team blue', 'prod,critical']))
      .toBe('team%20blue,prod%2Ccritical');
  });
});
