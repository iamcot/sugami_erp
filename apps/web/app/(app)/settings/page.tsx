'use client';

import { Receipt } from 'lucide-react';
import Link from 'next/link';
import { StockPushCard } from '@/components/stock-push-card';
import { ThemePicker } from '@/components/theme-picker';
import { Card, PageHeader } from '@/components/ui';

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Cài đặt" description="Cấu hình bán hàng, in ấn và giao diện" />
      <ThemePicker />
      <div className="mt-4" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Link href="/settings/receipts">
          <Card className="p-4 hover:bg-white/80 dark:hover:bg-white/5">
            <div className="flex items-center gap-2 font-medium">
              <Receipt className="size-4" /> Mẫu biên lai
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Thiết kế bill in bằng máy in nhiệt: dòng chữ, chi tiết đơn hàng, tổng tiền, giảm giá.
            </p>
          </Card>
        </Link>
      </div>
      <StockPushCard />
    </>
  );
}
