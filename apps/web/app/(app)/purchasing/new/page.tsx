'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { PoEditor } from '@/components/po-editor';
import { PageHeader } from '@/components/ui';

export default function NewPurchaseOrderPage() {
  return (
    <>
      <Link
        href="/purchasing"
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="size-4" /> Nguồn hàng
      </Link>
      <PageHeader title="Đơn nhập hàng mới" description="Lưu nháp, đặt hàng, rồi nhận hàng khi về đến kho." />
      <PoEditor />
    </>
  );
}
