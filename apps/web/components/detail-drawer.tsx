'use client';

import { ArrowLeft, ExternalLink, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo } from 'react';
import { CustomerDetail } from '@/components/customer-detail';
import { OrderDetail } from '@/components/order-detail';

export type DetailType = 'order' | 'customer';

interface DetailApi {
  open: (type: DetailType, code: string) => void;
}

const Ctx = createContext<DetailApi>({ open: () => undefined });

/** Open an order or customer in the drawer from anywhere in the app. */
export const useDetail = () => useContext(Ctx);

const PARAM = 'd';

/**
 * Detail drawer driven by the URL: each open detail is a repeated `d=type:code` query param, so the
 * list underneath keeps its search, filters and page, and browser back closes the drawer (or steps back
 * to the previous detail, e.g. order → customer → order).
 */
export function DetailProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const stack = params
    .getAll(PARAM)
    .map((v) => {
      const i = v.indexOf(':');
      return { type: v.slice(0, i) as DetailType, code: v.slice(i + 1) };
    })
    .filter((d) => (d.type === 'order' || d.type === 'customer') && d.code);
  const top = stack[stack.length - 1];

  const hrefWith = useCallback(
    (next: URLSearchParams) => {
      const qs = next.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [pathname],
  );

  const open = useCallback(
    (type: DetailType, code: string) => {
      const next = new URLSearchParams(params.toString());
      next.append(PARAM, `${type}:${code}`);
      router.push(hrefWith(next), { scroll: false });
    },
    [params, router, hrefWith],
  );

  const close = useCallback(() => {
    const next = new URLSearchParams(params.toString());
    next.delete(PARAM);
    router.replace(hrefWith(next), { scroll: false });
  }, [params, router, hrefWith]);

  useEffect(() => {
    if (!top) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [top, close]);

  const api = useMemo(() => ({ open }), [open]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {top && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            aria-label="Đóng"
            className="absolute inset-0 bg-slate-900/40"
            onClick={close}
            tabIndex={-1}
          />
          <aside className="relative flex h-full w-full flex-col bg-slate-50 shadow-xl sm:w-[min(94vw,860px)] dark:bg-slate-950">
            <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
              {stack.length > 1 ? (
                <button
                  onClick={() => router.back()}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <ArrowLeft className="size-4" /> Quay lại
                </button>
              ) : (
                <span className="px-2 text-sm text-slate-500">
                  {top.type === 'order' ? 'Đơn hàng' : 'Khách hàng'}
                </span>
              )}
              <div className="ml-auto flex items-center gap-1">
                <Link
                  href={`/${top.type === 'order' ? 'orders' : 'customers'}/${encodeURIComponent(top.code)}`}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <ExternalLink className="size-4" /> Mở trang riêng
                </Link>
                <button
                  onClick={close}
                  aria-label="Đóng"
                  className="rounded-md p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {top.type === 'order' ? (
                <OrderDetail key={top.code} code={top.code} embedded />
              ) : (
                <CustomerDetail key={top.code} code={top.code} embedded />
              )}
            </div>
          </aside>
        </div>
      )}
    </Ctx.Provider>
  );
}
