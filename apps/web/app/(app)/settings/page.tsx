'use client';

import { Receipt } from 'lucide-react';
import Link from 'next/link';
import { Card, PageHeader } from '@/components/ui';

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Cài đặt" description="Cấu hình bán hàng và in ấn" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Link href="/settings/receipts">
          <Card className="p-4 hover:bg-slate-50 dark:hover:bg-slate-900">
            <div className="flex items-center gap-2 font-medium">
              <Receipt className="size-4" /> Mẫu biên lai
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Thiết kế bill in bằng máy in nhiệt: dòng chữ, chi tiết đơn hàng, tổng tiền, giảm giá.
            </p>
          </Card>
        </Link>
      </div>
    </>
  );
}
