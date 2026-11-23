'use client';

import { cn } from '@sugami/ui';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { type MouseEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Server sort key; the header becomes clickable when set. */
  sortKey?: string;
  align?: 'left' | 'right' | 'center';
  className?: string;
  /** Pin the column to the right edge while the table scrolls sideways. */
  sticky?: boolean;
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
  onRowClick,
  isSelected,
  sort,
  onSort,
  page,
  pageSize,
  total,
  onPage,
  loading,
  empty = 'Không có dữ liệu',
  rowEmphasis,
  bare,
  selection,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  /** Click anywhere on a row (e.g. open a detail drawer). */
  onRowClick?: (row: T) => void;
  /** Row highlighted as the one last opened. */
  isSelected?: (row: T) => boolean;
  sort?: SortState;
  onSort?: (s: SortState) => void;
  page?: number;
  pageSize?: number;
  total?: number;
  onPage?: (page: number) => void;
  loading?: boolean;
  empty?: ReactNode;
  /** Rows that need action: bold text and an accent bar on the left (like unread mail). */
  rowEmphasis?: (row: T) => boolean;
  /** Drawn inside another panel: no glass frame of its own. */
  bare?: boolean;
  /** Checkboxes at the start of each row and a select-all in the header (current page). */
  selection?: { selected: Set<string>; onChange: (next: Set<string>) => void };
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef({ down: false, moved: false, x: 0, left: 0 });
  // The pinned column hides the cells scrolling under it: show an edge only while that happens.
  const [covering, setCovering] = useState(false);
  const measure = useCallback(() => {
    const el = scroller.current;
    if (el) setCovering(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);
  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure, rows, columns.length]);

  const onMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    drag.current = { down: true, moved: false, x: e.clientX, left: scroller.current?.scrollLeft ?? 0 };
  };
  const onMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.down || !scroller.current) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) > 5) d.moved = true;
    if (d.moved) {
      scroller.current.scrollLeft = d.left - dx;
      window.getSelection()?.removeAllRanges();
    }
  };
  const endDrag = () => {
    drag.current.down = false;
  };

  const pages = total !== undefined && pageSize ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const alignClass = (a?: Column<T>['align']) =>
    a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';

  return (
    <div className={bare ? 'overflow-hidden' : 'glass overflow-hidden rounded-xl'}>
      <div
        ref={scroller}
        onScroll={measure}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        // A drag that scrolled the table must not count as a click on the row underneath.
        onClickCapture={(e) => {
          if (drag.current.moved) {
            e.stopPropagation();
            e.preventDefault();
            drag.current.moved = false;
          }
        }}
        className="overflow-x-auto"
      >
        <table className={cn('w-full text-sm', loading && 'opacity-60')}>
          <thead className="hud-label border-b border-slate-300/60 bg-white/40 text-slate-500 dark:border-white/10 dark:bg-black/20 dark:text-slate-400">
            <tr>
              {selection && (
                <th className="w-10 pl-4 pr-0">
                  <Checkbox
                    checked={rows.length > 0 && rows.every((r) => selection.selected.has(rowKey(r)))}
                    indeterminate={rows.some((r) => selection.selected.has(rowKey(r)))}
                    onChange={(on) => {
                      const next = new Set(selection.selected);
                      for (const r of rows) {
                        if (on) next.add(rowKey(r));
                        else next.delete(rowKey(r));
                      }
                      selection.onChange(next);
                    }}
                    label="Chọn tất cả dòng trang này"
                  />
                </th>
              )}
              {columns.map((c) => {
                const active = sort && c.sortKey === sort.sort;
                return (
                  <th
                    key={c.key}
                    className={cn(
                      'whitespace-nowrap px-4 py-2.5 font-medium',
                      alignClass(c.align),
                      c.className,
                      c.sticky &&
                        cn(
                          'bg-[#f4f7fb] sm:sticky sm:right-0 dark:bg-[#0b1322]',
                          covering &&
                            'border-l border-slate-300 shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.25)] dark:border-slate-600',
                        ),
                    )}
                  >
                    {c.sortKey && onSort ? (
                      <button
                        className={cn(
                          'inline-flex items-center gap-1 uppercase hover:text-slate-900 dark:hover:text-slate-100',
                          active && 'text-brand-700 dark:text-brand-500',
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
          <tbody className="divide-y divide-slate-200/70 dark:divide-white/[0.06]">
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + (selection ? 1 : 0)}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  {loading ? 'Đang tải…' : empty}
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const href = rowHref?.(r);
              return (
                <tr
                  key={rowKey(r)}
                  className={cn(
                    'group',
                    'transition-shadow',
                    rowEmphasis?.(r) &&
                      'font-semibold [&>td:first-child]:shadow-[inset_3px_0_0_var(--accent-600)]',
                    isSelected?.(r) || selection?.selected.has(rowKey(r))
                      ? 'bg-gradient-to-r from-brand-500/20 to-brand-500/5'
                      : 'hover:relative hover:z-[1] hover:bg-white/90 hover:shadow-[0_0_0_1px_rgb(var(--accent-rgb)/0.35),0_6px_18px_rgba(60,80,140,0.16)] dark:hover:bg-white/[0.07]',
                    onRowClick && 'cursor-pointer',
                  )}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                >
                  {selection && (
                    <td className="w-10 pl-4 pr-0" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selection.selected.has(rowKey(r))}
                        onChange={(on) => {
                          const next = new Set(selection.selected);
                          if (on) next.add(rowKey(r));
                          else next.delete(rowKey(r));
                          selection.onChange(next);
                        }}
                        label="Chọn dòng"
                      />
                    </td>
                  )}
                  {columns.map((c, i) => (
                    <td
                      key={c.key}
                      className={cn(
                        'px-4 py-2.5',
                        alignClass(c.align),
                        c.align === 'right' && 'font-mono text-[12.5px] tracking-tight tabular-nums',
                        c.className,
                        c.sticky &&
                          (isSelected?.(r)
                            ? 'bg-brand-50 dark:bg-[#0f2230]'
                            : 'bg-[#f7f9fc] group-hover:bg-white dark:bg-[#0b1322] dark:group-hover:bg-[#121c2e]') +
                            ' sm:sticky sm:right-0' +
                            (covering
                              ? ' border-l border-slate-300 shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.25)] dark:border-slate-600'
                              : ''),
                      )}
                    >
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
        <div className="flex items-center justify-between gap-2 border-t border-slate-300/60 bg-white/30 px-4 py-2 font-mono text-xs text-slate-500 dark:border-white/10 dark:bg-black/20">
          <span>
            {total === 0 ? 0 : ((page ?? 1) - 1) * (pageSize ?? 0) + 1}–
            {Math.min((page ?? 1) * (pageSize ?? 0), total)} / {total.toLocaleString('vi-VN')}
          </span>
          <div className="flex items-center gap-1">
            <button
              className="rounded-md border border-slate-300/70 bg-white/70 p-1 hover:bg-white disabled:opacity-40 dark:border-white/15 dark:bg-white/5"
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
              className="rounded-md border border-slate-300/70 bg-white/70 p-1 hover:bg-white disabled:opacity-40 dark:border-white/15 dark:bg-white/5"
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

function Checkbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (on: boolean) => void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = !checked && !!indeterminate;
      }}
      onChange={(e) => onChange(e.target.checked)}
      className="size-4 cursor-pointer align-middle accent-brand-600"
    />
  );
}
