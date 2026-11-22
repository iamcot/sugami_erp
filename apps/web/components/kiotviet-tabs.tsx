'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/data/import', label: 'Nhập từ KiotViet' },
  { href: '/data/export', label: 'Xuất sang KiotViet' },
];

/** Switch between the two directions of the KiotViet Excel exchange. */
export function KiotVietTabs() {
  const path = usePathname();
  return (
    <div className="mb-5 flex gap-4 border-b border-slate-200 dark:border-slate-800">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`-mb-px border-b-2 px-1 pb-2 text-sm font-medium ${path.startsWith(t.href) ? 'border-brand-600 text-brand-700 dark:text-brand-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
