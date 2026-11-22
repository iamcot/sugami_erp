'use client';

import { cn } from '@sugami/ui';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Server sort key; the header becomes clickable when set. */
  sortKey?: string;
  align?: 'left' | 'right' | 'center';
  className?: string;
  render: (row: T) => ReactNode;
}

export interface SortState {
  sort: string;
  dir: 'asc' | 'desc';
}

/** Server-driven table: the parent owns sort and page state and fetches rows. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  sort,
  onSort,
  page,
  pageSize,
  total,
  onPage,
  loading,
  empty = 'Không có dữ liệu',
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  sort?: SortState;
  onSort?: (s: SortState) => void;
  page?: number;
  pageSize?: number;
  total?: number;
  onPage?: (page: number) => void;
  loading?: boolean;
  empty?: ReactNode;
}) {
  const pages = total !== undefined && pageSize ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const alignClass = (a?: Column<T>['align']) =>
    a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="overflow-x-auto">
        <table className={cn('w-full text-sm', loading && 'opacity-60')}>
          <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
            <tr>
              {columns.map((c) => {
                const active = sort && c.sortKey === sort.sort;
                return (
                  <th
                    key={c.key}
                    className={cn(
                      'whitespace-nowrap px-4 py-2.5 font-medium',
                      alignClass(c.align),
                      c.className,
                    )}
                  >
                    {c.sortKey && onSort ? (
                      <button
                        className={cn(
                          'inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100',
                          active && 'text-slate-900 dark:text-slate-100',
                        )}
                        onClick={() =>
                          onSort({
                            sort: c.sortKey!,
                            dir: active && sort.dir === 'asc' ? 'desc' : active ? 'asc' : 'desc',
                          })
                        }
                      >
                        {c.header}
                        {active &&
                          (sort.dir === 'asc' ? (
                            <ArrowUp className="size-3" />
                          ) : (
                            <ArrowDown className="size-3" />
                          ))}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-slate-500">
                  {loading ? 'Đang tải…' : empty}
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const href = rowHref?.(r);
              return (
                <tr key={rowKey(r)} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  {columns.map((c, i) => (
                    <td key={c.key} className={cn('px-4 py-2.5', alignClass(c.align), c.className)}>
                      {href && i === 0 ? (
                        <Link href={href} className="block hover:text-brand-600">
                          {c.render(r)}
                        </Link>
                      ) : (
                        c.render(r)
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {onPage && total !== undefined && (
        <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-4 py-2 text-sm text-slate-500 dark:border-slate-800">
          <span>
            {total === 0 ? 0 : ((page ?? 1) - 1) * (pageSize ?? 0) + 1}–
            {Math.min((page ?? 1) * (pageSize ?? 0), total)} / {total.toLocaleString('vi-VN')}
          </span>
          <div className="flex items-center gap-1">
            <button
              className="rounded-md p-1.5 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800"
              disabled={(page ?? 1) <= 1}
              onClick={() => onPage((page ?? 1) - 1)}
              aria-label="Trang trước"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="tabular-nums">
              {page ?? 1}/{pages}
            </span>
            <button
              className="rounded-md p-1.5 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800"
              disabled={(page ?? 1) >= pages}
              onClick={() => onPage((page ?? 1) + 1)}
              aria-label="Trang sau"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
