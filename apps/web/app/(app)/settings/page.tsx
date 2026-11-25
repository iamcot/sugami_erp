'use client';

import { Receipt, Store, Users } from 'lucide-react';
import Link from 'next/link';
import { StockPushCard } from '@/components/stock-push-card';
import { ThemePicker } from '@/components/theme-picker';
import { Card, PageHeader } from '@/components/ui';
import { SHOP_TYPE_LABEL, useMe } from '@/lib/me';

export default function SettingsPage() {
  const me = useMe();
  const canUsers = me?.permissions.some((p) => p === '*' || p === 'users.*' || p === 'users.manage');
  return (
    <>
      <PageHeader
        title="Cài đặt"
        description={
          me
            ? `Shop ${me.shop.name} · ${SHOP_TYPE_LABEL[me.shop.type]}`
            : 'Cấu hình bán hàng, in ấn và giao diện'
        }
      />
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
        {canUsers && (
          <Link href="/settings/users">
            <Card className="p-4 hover:bg-white/80 dark:hover:bg-white/5">
              <div className="flex items-center gap-2 font-medium">
                <Users className="size-4" /> Tài khoản
              </div>
              <p className="mt-1 text-sm text-slate-500">Thêm nhân viên cho shop và chọn vai trò.</p>
            </Card>
          </Link>
        )}
        {me?.isPlatformAdmin && (
          <Link href="/settings/shops">
            <Card className="p-4 hover:bg-white/80 dark:hover:bg-white/5">
              <div className="flex items-center gap-2 font-medium">
                <Store className="size-4" /> Các shop
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Mở shop mới (bán lẻ hoặc thành phẩm từ nguyên liệu) kèm tài khoản chủ shop.
              </p>
            </Card>
          </Link>
        )}
      </div>
      {me?.shop.integrations && <StockPushCard />}
    </>
  );
}
