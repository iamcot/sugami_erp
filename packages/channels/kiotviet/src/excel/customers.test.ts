import { describe, expect, it } from 'vitest';
import { cleanPhone, parseCustomerList } from './customers.js';
import { KiotVietFormatError, writeSheet } from './sheet.js';

const H = [
  'Mã khách hàng',
  'Tên khách hàng',
  'Điện thoại',
  'Địa chỉ',
  'Khu vực giao hàng',
  'Giới tính',
  'Nhóm khách hàng',
  'Ghi chú',
  'Ngày tạo',
  'Ngày giao dịch cuối',
  'Nợ cần thu hiện tại',
  'Tổng bán',
  'Trạng thái',
];
const file = (rows: (string | number | null)[][]) => writeSheet('Sheet1', H, rows);

describe('parseCustomerList', () => {
  it('reads customers, splits groups, drops masked phones and ignores notes', async () => {
    const parsed = await parseCustomerList(
      await file([
        [
          'KH001',
          'Nguyễn A',
          '0901 234 567',
          '1 Đường X',
          'Hồ Chí Minh',
          'Nữ',
          'Khách mới|Fan cứng',
          'ghi chú bí mật',
          '2025-03-01 10:00:00.000',
          '2025-04-01 09:30:00',
          59000,
          1500000,
          1,
        ],
        [
          'KHSPE9',
          'T******u',
          '0******12',
          '******Rẫy',
          null,
          null,
          null,
          '******53',
          '2024-01-02 08:00:00',
          null,
          null,
          0,
          0,
        ],
        ['KH001', 'Trùng', null, null, null, null, null, null, null, null, null, null, 1],
        [null, 'Không mã', null, null, null, null, null, null, null, null, null, null, 1],
      ]),
    );
    expect(parsed.rowCount).toBe(4);
    expect(parsed.customers).toHaveLength(2);
    const [a, b] = parsed.customers;
    expect(a).toMatchObject({
      code: 'KH001',
      name: 'Nguyễn A',
      phone: '0901234567',
      groups: ['Khách mới', 'Fan cứng'],
      totalSales: 1500000,
      debt: 59000,
      active: true,
    });
    expect(a!.createdAt?.toISOString()).toBe('2025-03-01T03:00:00.000Z');
    expect(JSON.stringify(a)).not.toContain('bí mật');
    expect(b).toMatchObject({ code: 'KHSPE9', phone: null, active: false, groups: [], debt: 0 });
    expect(parsed.issues.map((i) => i.level).sort()).toEqual(['error', 'warning']);
  });

  it('rejects a file that is not a customer list', async () => {
    await expect(parseCustomerList(await writeSheet('S', ['Mã hàng'], [['A']]))).rejects.toThrow(
      KiotVietFormatError,
    );
  });
});

describe('cleanPhone', () => {
  it('keeps real numbers only', () => {
    expect(cleanPhone('(+84) 901.234.567')).toBe('+84901234567');
    expect(cleanPhone('09****567')).toBeNull();
    expect(cleanPhone('123')).toBeNull();
    expect(cleanPhone(null)).toBeNull();
  });
});
