export interface AuthShop {
  id: string;
  code: string;
  name: string;
  /** retail: resells goods as bought; assembly: sells finished products made from materials. */
  type: 'retail' | 'assembly';
  /** Pancake / chat integrations are set up for this shop. */
  integrations: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  /** Every query of the request is scoped to this shop. */
  shopId: string;
  shop: AuthShop;
  /** Can create shops and their owner accounts. */
  isPlatformAdmin: boolean;
  roles: string[];
  permissions: string[];
  sessionId: string;
}

export const SESSION_COOKIE = 'sugami_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MS = 15 * 60 * 1000;
