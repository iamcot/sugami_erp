/** Receipt layout (blocks) and its HTML rendering for the bill printer. */
export type Block =
  | { type: 'text'; text: string; align: 'left' | 'center' | 'right'; bold: boolean; size: 'sm' | 'md' | 'lg' }
  | { type: 'order_info' }
  | { type: 'lines' }
  | { type: 'totals' }
  | { type: 'divider' };

export interface ReceiptTemplate {
  id: string;
  name: string;
  paperWidth: 58 | 80;
  blocks: Block[];
  isDefault: boolean;
}

export interface ReceiptOrder {
  code: string;
  orderedAt: string;
  customerName?: string | null;
  customerPhone?: string | null;
  lines: { name: string; sku: string; qty: number; price: number; lineTotal: number }[];
  subtotal: number;
  discount: number;
  otherIncome: number;
  total: number;
  paidAmount: number;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const money = (n: number) => n.toLocaleString('vi-VN');
const dateText = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', { hour12: false, dateStyle: 'short', timeStyle: 'short' });

export const SAMPLE_ORDER: ReceiptOrder = {
  code: 'BH000123',
  orderedAt: new Date().toISOString(),
  customerName: 'Nguyễn Văn A',
  customerPhone: '0900000000',
  lines: [
    { name: 'Bình nước Mini Lohas 350ml', sku: 'SP000125', qty: 1, price: 240000, lineTotal: 240000 },
    { name: 'Đồ chơi giáo dục Katamino', sku: '0038', qty: 2, price: 219000, lineTotal: 438000 },
  ],
  subtotal: 678000,
  discount: 28000,
  otherIncome: 0,
  total: 650000,
  paidAmount: 650000,
};

function fill(text: string, o: ReceiptOrder) {
  return text
    .replaceAll('{{code}}', o.code)
    .replaceAll('{{date}}', dateText(o.orderedAt))
    .replaceAll('{{customer}}', o.customerName ?? '')
    .replaceAll('{{total}}', money(o.total));
}

function renderBlock(b: Block, o: ReceiptOrder): string {
  switch (b.type) {
    case 'text': {
      const size = { sm: '11px', md: '13px', lg: '18px' }[b.size];
      return `<div style="text-align:${b.align};font-size:${size};font-weight:${b.bold ? 700 : 400};white-space:pre-wrap">${esc(fill(b.text, o))}</div>`;
    }
    case 'divider':
      return '<hr />';
    case 'order_info':
      return `<div class="kv"><span>Số HĐ</span><b>${esc(o.code)}</b></div>
<div class="kv"><span>Ngày</span><span>${esc(dateText(o.orderedAt))}</span></div>${
        o.customerName ? `<div class="kv"><span>Khách</span><span>${esc(o.customerName)}</span></div>` : ''
      }${o.customerPhone ? `<div class="kv"><span>SĐT</span><span>${esc(o.customerPhone)}</span></div>` : ''}`;
    case 'lines':
      return `<table><thead><tr><th style="text-align:left">Sản phẩm</th><th>SL</th><th>Đ.giá</th><th>T.tiền</th></tr></thead><tbody>${o.lines
        .map(
          (l) =>
            `<tr><td style="text-align:left">${esc(l.name)}<br /><small>${esc(l.sku)}</small></td><td>${l.qty}</td><td>${money(l.price)}</td><td>${money(l.lineTotal)}</td></tr>`,
        )
        .join('')}</tbody></table>`;
    case 'totals': {
      const row = (label: string, v: number, bold = false) =>
        `<div class="kv"${bold ? ' style="font-weight:700;font-size:15px"' : ''}><span>${label}</span><span>${money(v)}</span></div>`;
      return [
        row('Tổng tiền hàng', o.subtotal),
        row('Tổng giảm giá', o.discount),
        o.otherIncome ? row('Thu khác', o.otherIncome) : '',
        row('Khách cần trả', o.total, true),
        row('Khách đã trả', o.paidAmount),
        o.total > o.paidAmount ? row('Còn lại', o.total - o.paidAmount) : '',
      ].join('');
    }
  }
}

/** A complete HTML document sized for the paper width, ready to show in an iframe or to print. */
export function receiptHtml(t: Pick<ReceiptTemplate, 'paperWidth' | 'blocks'>, o: ReceiptOrder): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page{size:${t.paperWidth}mm auto;margin:0}
*{box-sizing:border-box}
body{margin:0;padding:2mm 3mm;width:${t.paperWidth}mm;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#000}
hr{border:0;border-top:1px dashed #000;margin:6px 0}
.kv{display:flex;justify-content:space-between;gap:8px;padding:1px 0}
table{width:100%;border-collapse:collapse;font-size:11px}
th,td{padding:2px 0;text-align:right;vertical-align:top}
small{color:#444}
</style></head><body>${t.blocks.map((b) => renderBlock(b, o)).join('')}</body></html>`;
}

/** Print through a hidden iframe so the bill printer gets only the receipt. */
export function printReceipt(t: Pick<ReceiptTemplate, 'paperWidth' | 'blocks'>, o: ReceiptOrder) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(receiptHtml(t, o));
  doc.close();
  frame.contentWindow?.focus();
  setTimeout(() => {
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 2000);
  }, 250);
}
