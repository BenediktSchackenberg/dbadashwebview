export type AuthRole = 'Admin' | 'Operator' | 'Viewer';
export type AuthSource = 'local' | 'ad';

export interface AuthSession {
  token: string;
  username: string;
  displayName?: string | null;
  role: AuthRole;
  source: AuthSource;
}

const STORAGE_KEY = 'auth-session';

export function getAuthSession(): AuthSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function setAuthSession(session: AuthSession) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearAuthSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export function isAuthenticated(): boolean {
  return !!getAuthSession()?.token;
}

export function hasRole(roles: AuthRole[]): boolean {
  const role = getAuthSession()?.role;
  return !!role && roles.includes(role);
}
