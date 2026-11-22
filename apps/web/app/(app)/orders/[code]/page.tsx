'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { use } from 'react';
import { OrderDetail } from '@/components/order-detail';

export default function OrderDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  return (
    <>
      <Link
        href="/orders"
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="size-4" /> Đơn hàng
      </Link>
      <OrderDetail code={code} />
    </>
  );
}
