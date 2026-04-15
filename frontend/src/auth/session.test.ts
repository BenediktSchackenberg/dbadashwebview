import { afterEach, describe, expect, it } from 'vitest';
import { clearAuthSession, getAuthSession, hasRole, isAuthenticated, setAuthSession } from './session';

describe('auth session helpers', () => {
  afterEach(() => {
    clearAuthSession();
  });

  it('stores and restores the current session', () => {
    setAuthSession({
      token: 'token-123',
      username: 'alice',
      displayName: 'Alice',
      role: 'Admin',
      source: 'local',
    });

    expect(getAuthSession()).toEqual({
      token: 'token-123',
      username: 'alice',
      displayName: 'Alice',
      role: 'Admin',
      source: 'local',
    });
    expect(isAuthenticated()).toBe(true);
    expect(hasRole(['Admin'])).toBe(true);
    expect(hasRole(['Viewer'])).toBe(false);
  });

  it('clears invalid serialized data gracefully', () => {
    localStorage.setItem('auth-session', '{not-json');

    expect(getAuthSession()).toBeNull();
    expect(isAuthenticated()).toBe(false);
  });
});
