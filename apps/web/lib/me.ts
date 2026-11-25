'use client';

import { useEffect, useState } from 'react';
import { api } from './api';

export interface MeShop {
  id: string;
  code: string;
  name: string;
  /** retail: resells goods as bought; assembly: sells finished products made from materials. */
  type: 'retail' | 'assembly';
  /** Pancake / marketplace / KiotViet tools are set up for this shop. */
  integrations: boolean;
}

export interface Me {
  id: string;
  name: string;
  email: string;
  roles: string[];
  permissions: string[];
  shopId: string;
  shop: MeShop;
  isPlatformAdmin: boolean;
}

let cached: Promise<Me> | null = null;

/** The logged-in user and their shop, fetched once per page load. */
export function loadMe(): Promise<Me> {
  cached ??= api<{ user: Me }>('/auth/me').then(
    (r) => r.user,
    (err: unknown) => {
      cached = null;
      throw err;
    },
  );
  return cached;
}

/** Forget the cached user (after login/logout, so the next page asks again). */
export function resetMe(): void {
  cached = null;
}

/** The logged-in user (null while loading or when the session is gone). */
export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    loadMe().then(setMe, () => {});
  }, []);
  return me;
}

export const SHOP_TYPE_LABEL: Record<MeShop['type'], string> = {
  retail: 'Bán lẻ (nhập sao bán vậy)',
  assembly: 'Thành phẩm từ nguyên liệu',
};

export const KIND_LABEL = { goods: 'Hàng hóa', material: 'Nguyên liệu', finished: 'Thành phẩm' } as const;
export type ProductKind = keyof typeof KIND_LABEL;
