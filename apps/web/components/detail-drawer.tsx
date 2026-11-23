'use client';

import { ArrowLeft, ExternalLink, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CustomerDetail } from '@/components/customer-detail';
import { ListingDetail } from '@/components/listing-detail';
import { OrderDetail } from '@/components/order-detail';
import { ProductDetail } from '@/components/product-detail';

export type DetailType = 'order' | 'customer' | 'product' | 'listing';

/** A customer as the drawer hands it back to the screen that opened it (e.g. the sales screen). */
export interface CustomerSaved {
  id: string;
  code: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  addressLine: string | null;
  region: string | null;
  ward: string | null;
  kvDebt: number;
}

/** Extras for a drawer that is not just a view; kept in memory, never in the URL. */
export interface DetailOpts {
  /** Customer drawer with code `new`: values to start the form with. */
  initial?: Partial<CustomerSaved>;
  /** Called after a customer was created, edited, or an existing one was picked on a duplicate phone. */
  onSaved?: (c: CustomerSaved) => void;
}

interface DetailApi {
  open: (type: DetailType, code: string, opts?: DetailOpts) => void;
  close: () => void;
  optsFor: (type: DetailType, code: string) => DetailOpts | undefined;
  /** Last opened code per type; stays after the drawer closes so lists can keep the row highlighted. */
  selected: Partial<Record<DetailType, string>>;
}

const Ctx = createContext<DetailApi>({
  open: () => undefined,
  close: () => undefined,
  optsFor: () => undefined,
  selected: {},
});

/** Open an order or customer in the drawer from anywhere in the app. */
export const useDetail = () => useContext(Ctx);

const PARAM = 'd';
const TITLE: Record<DetailType, string> = {
  order: 'Đơn hàng',
  customer: 'Khách hàng',
  product: 'Sản phẩm',
  listing: 'Tin đăng sàn',
};
const PATH: Record<DetailType, string> = {
  order: 'orders',
  customer: 'customers',
  product: 'products',
  listing: 'listings',
};

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
    .filter((d) => ['order', 'customer', 'product', 'listing'].includes(d.type) && d.code);
  const top = stack[stack.length - 1];

  const [selected, setSelected] = useState<DetailApi['selected']>({});
  // Keep showing the last detail while the drawer slides out.
  const [shown, setShown] = useState<typeof top>(undefined);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (top) {
      setSelected((s) => (s[top.type] === top.code ? s : { ...s, [top.type]: top.code }));
      setShown(top);
      // Two frames so the closed position is painted first and the slide-in animates.
      let f2 = 0;
      const f1 = requestAnimationFrame(() => {
        f2 = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(f1);
        cancelAnimationFrame(f2);
      };
    }
    setVisible(false);
    const t = setTimeout(() => setShown(undefined), 300);
    return () => clearTimeout(t);
  }, [top?.type, top?.code]);

  const hrefWith = useCallback(
    (next: URLSearchParams) => {
      const qs = next.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [pathname],
  );

  const optsRef = useRef(new Map<string, DetailOpts>());
  const optsFor = useCallback((type: DetailType, code: string) => optsRef.current.get(`${type}:${code}`), []);
  const open = useCallback(
    (type: DetailType, code: string, opts?: DetailOpts) => {
      if (opts) optsRef.current.set(`${type}:${code}`, opts);
      else optsRef.current.delete(`${type}:${code}`);
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

  const api = useMemo(() => ({ open, close, optsFor, selected }), [open, close, optsFor, selected]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {shown && (
        <div className={`fixed inset-0 z-50 flex justify-end ${visible ? '' : 'pointer-events-none'}`}>
          <button
            aria-label="Đóng"
            className={`absolute inset-0 bg-slate-900/40 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
            onClick={close}
            tabIndex={-1}
          />
          <aside
            className={`relative flex h-full w-full flex-col bg-slate-50 shadow-xl transition-transform duration-300 ease-out sm:w-3/4 dark:bg-slate-950 ${visible ? 'translate-x-0' : 'translate-x-full'}`}
          >
            <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
              {stack.length > 1 ? (
                <button
                  onClick={() => router.back()}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <ArrowLeft className="size-4" /> Quay lại
                </button>
              ) : (
                <span className="px-2 text-sm text-slate-500">{TITLE[shown.type]}</span>
              )}
              <div className="ml-auto flex items-center gap-1">
                {!(shown.type === 'customer' && shown.code === 'new') && (
                  <Link
                    href={`/${PATH[shown.type]}/${encodeURIComponent(shown.code)}`}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <ExternalLink className="size-4" /> Mở trang riêng
                  </Link>
                )}
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
              {shown.type === 'order' ? (
                <OrderDetail key={shown.code} code={shown.code} embedded />
              ) : shown.type === 'customer' ? (
                <CustomerDetail key={shown.code} code={shown.code} embedded />
              ) : shown.type === 'product' ? (
                <ProductDetail key={shown.code} code={shown.code} embedded />
              ) : (
                <ListingDetail key={shown.code} id={shown.code} embedded />
              )}
            </div>
          </aside>
        </div>
      )}
    </Ctx.Provider>
  );
}
