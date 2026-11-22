'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { DocumentEditor } from '@/components/document-editor';
import { PageHeader } from '@/components/ui';
import { TYPE_LABEL } from '@/lib/stock-documents';

function NewDocument() {
  const type = useSearchParams().get('type') === 'count' ? 'count' : 'receipt';
  return (
    <>
      <PageHeader title={`Tạo ${TYPE_LABEL[type].toLowerCase()}`} description="Kho chính" />
      <DocumentEditor type={type} />
    </>
  );
}

export default function NewDocumentPage() {
  return (
    <Suspense>
      <NewDocument />
    </Suspense>
  );
}
