'use client';

import { ChevronRight, Receipt, Truck } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { StockPushCard } from '@/components/stock-push-card';
import { ThemePicker } from '@/components/theme-picker';
import { Card, PageHeader } from '@/components/ui';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-slate-500">{title}</h2>
      {children}
    </section>
  );
}

const PAGES = [
  {
    href: '/settings/receipts',
    icon: Receipt,
    title: 'Mẫu biên lai',
    text: 'Thiết kế bill in bằng máy in nhiệt: dòng chữ, chi tiết đơn hàng, tổng tiền, giảm giá.',
  },
  {
    href: '/settings/shipping',
    icon: Truck,
    title: 'Vận chuyển',
    text: 'Điểm lấy hàng, cỡ hộp, hãng giao thường và mốc lấy hàng, dịch vụ AhaMove.',
  },
] as const;

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Cài đặt" description="Cấu hình bán hàng, in ấn và giao diện" />
      <div className="max-w-4xl space-y-8">
        <Section title="Giao diện">
          <ThemePicker />
        </Section>

        <Section title="Bán hàng và in ấn">
          <Card className="divide-y divide-slate-100 dark:divide-white/10">
            {PAGES.map(({ href, icon: Icon, title, text }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-4 px-4 py-4 hover:bg-white/60 dark:hover:bg-white/5"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-500/10">
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{title}</span>
                  <span className="block text-sm text-slate-500">{text}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-slate-400" />
              </Link>
            ))}
          </Card>
        </Section>

        <Section title="Đồng bộ tồn kho">
          <StockPushCard />
        </Section>
      </div>
    </>
  );
}
