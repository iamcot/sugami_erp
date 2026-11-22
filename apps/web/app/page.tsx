import { formatVnd } from '@sugami/shared';
import { cn } from '@sugami/ui';

const modules = [
  { name: 'Sản phẩm', desc: 'SKU, biến thể, thuộc tính đồ chơi' },
  { name: 'Kho', desc: 'Xuất nhập tồn, kiểm kho, thẻ kho' },
  { name: 'Nguồn hàng', desc: 'Taobao/1688, kiện hàng, giá vốn' },
  { name: 'Đơn hàng', desc: 'Shopee, TikTok Shop và kênh khác' },
  { name: 'Media', desc: 'Thư viện ảnh, video theo chuẩn sàn' },
  { name: 'Content', desc: 'Mô tả, tiêu đề theo từng kênh' },
];

export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <p className="text-sm font-medium text-brand-600">Đang xây dựng</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Sugami ERP</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">
        Quản lý shop toàn diện. Ví dụ định dạng tiền: {formatVnd(1250000)}
      </p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((m) => (
          <li
            key={m.name}
            className={cn(
              'rounded-xl border border-slate-200 bg-white p-5 shadow-sm',
              'dark:border-slate-800 dark:bg-slate-900',
            )}
          >
            <h2 className="font-medium">{m.name}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{m.desc}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
