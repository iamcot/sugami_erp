import { TriangleAlert, Upload } from 'lucide-react';
import { Badge, Button, Card, PageHeader } from '@/components/ui';
import { media } from '@/lib/mock';

const filters = ['Tất cả', 'Ảnh chính', 'Chưa gán SKU', 'Kém chuẩn sàn'];

export default function MediaPage() {
  return (
    <>
      <PageHeader
        title="Media"
        description={`${media.length} ảnh · lưu trên S3`}
        actions={
          <Button>
            <Upload className="size-4" /> Tải ảnh lên
          </Button>
        }
      />
      <Card className="mb-4 border-dashed p-6 text-center">
        <Upload className="mx-auto size-6 text-slate-400" />
        <p className="mt-2 text-sm font-medium">Kéo thả ảnh vào đây</p>
        <p className="mt-1 text-xs text-slate-500">
          Đặt tên file theo SKU (vd <span className="font-mono">XE4WD-DO_01.jpg</span>) để tự gán vào sản
          phẩm. Tự tạo bản vuông 1000×1000 cho Shopee/TikTok.
        </p>
      </Card>
      <div className="mb-3 flex gap-1 overflow-x-auto">
        {filters.map((f, i) => (
          <button
            key={f}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-sm ${i === 0 ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
        {media.map((m) => {
          const small = m.width < 800 || m.width !== m.height;
          return (
            <Card key={m.id} className="overflow-hidden">
              <div className="relative">
                <img src={m.image} alt={m.name} className="aspect-square w-full" />
                {small && (
                  <span
                    className="absolute right-1.5 top-1.5 rounded-md bg-amber-500 p-1 text-white"
                    title="Ảnh nhỏ hoặc không vuông"
                  >
                    <TriangleAlert className="size-3.5" />
                  </span>
                )}
              </div>
              <div className="p-2">
                <p className="truncate font-mono text-xs">{m.name}</p>
                <div className="mt-1 flex items-center justify-between gap-1">
                  {m.sku ? <Badge tone="brand">{m.sku}</Badge> : <Badge tone="warn">Chưa gán</Badge>}
                  <span className="text-[10px] text-slate-500">
                    {m.width}×{m.height}
                  </span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
