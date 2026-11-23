import qrcode from 'qrcode-generator';

export interface DeliverySlip {
  /** Ahamove trip code. */
  tripCode: string;
  orderCode: string;
  createdAt: string;
  sender: { name: string; phone: string; address: string };
  receiver: { name: string; phone: string; address: string };
  /** Shipping fee and who bears it, for the line next to COD. */
  fee: number;
  feeNote: string;
  cod: number;
  /** What the QR code opens: the tracking link, else the trip code. */
  qr: string;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const money = (n: number) => `${n.toLocaleString('vi-VN')} đ`;

/** QR code as an inline SVG (no network, nothing to load before printing). */
function qrSvg(text: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 3, margin: 0, scalable: true });
}

/** The printable delivery slip for an Ahamove trip, same layout as the Ahamove portal's "Phiếu giao hàng". */
export function deliverySlipHtml(d: DeliverySlip): string {
  const at = new Date(d.createdAt).toLocaleString('vi-VN', {
    hour12: false,
    dateStyle: 'short',
    timeStyle: 'short',
  });
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Phiếu giao hàng ${esc(d.tripCode)}</title>
<style>
  @page { size: A5 landscape; margin: 8mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #111; font-size: 13px; }
  .slip { border: 1.5px solid #111; padding: 14px 18px; }
  h1 { margin: 0 0 6px; font-size: 26px; border-bottom: 1.5px solid #111; padding-bottom: 6px; }
  .meta { margin: 8px 0 12px; display: flex; gap: 22px; flex-wrap: wrap; }
  .meta b { font-size: 15px; }
  .top { display: grid; grid-template-columns: 1fr 1fr 110px; gap: 16px; align-items: start; }
  h2 { margin: 0 0 4px; font-size: 13px; text-transform: uppercase; }
  .qr svg { width: 104px; height: 104px; display: block; }
  .box { display: grid; grid-template-columns: 1.1fr 1fr; border: 1.5px solid #111; margin-top: 14px; }
  .box > div { padding: 10px 12px; }
  .box .left { border-right: 1.5px solid #111; min-height: 130px; }
  .row { display: flex; justify-content: space-between; align-items: baseline; padding: 8px 12px; border-bottom: 1.5px solid #111; }
  .row b { font-size: 20px; }
  .sign { padding: 8px 12px; min-height: 64px; }
  p { margin: 2px 0; }
</style></head><body>
<div class="slip">
  <h1>Phiếu giao hàng</h1>
  <div class="meta"><span>Mã đơn: <b>${esc(d.tripCode)}</b></span><span>Ngày tạo: <b>${esc(at)}</b></span></div>
  <div class="top">
    <div><h2>Người gửi</h2><p>${esc(d.sender.name)}</p><p>${esc(d.sender.address)}</p><p><b>${esc(d.sender.phone)}</b></p></div>
    <div><h2>Ghi chú dành cho tài xế</h2><p>${esc(d.orderCode)}</p></div>
    <div class="qr">${qrSvg(d.qr)}</div>
  </div>
  <div class="box">
    <div class="left"><h2>Người nhận</h2><p><b>${esc(d.receiver.name)}</b></p><p>${esc(d.receiver.address)}</p><p><b>${esc(d.receiver.phone)}</b></p><p style="margin-top:12px">Mã theo dõi: ${esc(d.orderCode)}</p></div>
    <div style="padding:0">
      <div class="row"><span>Phí giao hàng (${esc(d.feeNote)})</span><b>${money(d.fee)}</b></div>
      <div class="row"><span>Thu hộ</span><b>${money(d.cod)}</b></div>
      <div class="sign">Chữ ký người nhận:</div>
    </div>
  </div>
</div>
<script>window.onload=function(){window.focus();window.print();};</script>
</body></html>`;
}

/** Opens the slip in a new window and prints it. */
export function printDeliverySlip(d: DeliverySlip): boolean {
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) return false;
  w.document.open();
  w.document.write(deliverySlipHtml(d));
  w.document.close();
  return true;
}
