export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
  sessionId: string;
}

export const SESSION_COOKIE = 'sugami_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MS = 15 * 60 * 1000;
