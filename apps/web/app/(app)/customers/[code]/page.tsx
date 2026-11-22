'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { use } from 'react';
import { CustomerDetail } from '@/components/customer-detail';

export default function CustomerPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  return (
    <>
      <Link
        href="/customers"
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:underline"
      >
        <ArrowLeft className="size-4" /> Khách hàng
      </Link>
      <CustomerDetail code={code} />
    </>
  );
}
