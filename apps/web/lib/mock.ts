// Sample data for the P0-10 prototype. Replaced by real API data from P1 onwards.

export type Channel = 'shopee' | 'tiktok' | 'store';
export type SyncState = 'synced' | 'pending' | 'error';

export interface Variant {
  sku: string;
  options: string[];
  price: number;
  cost: number;
  stock: number;
  minStock: number;
}

export interface Product {
  code: string;
  name: string;
  category: string;
  brand: string;
  ageMin: number;
  material: string;
  battery?: string;
  image: string;
  status: 'active' | 'draft';
  channels: Partial<Record<Channel, SyncState>>;
  variants: Variant[];
  source?: { platform: '1688' | 'Taobao'; shop: string; priceCny: number };
}

const img = (seed: string, hue: number) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="12" fill="hsl(${hue} 70% 92%)"/><text x="40" y="50" font-size="30" text-anchor="middle">${seed}</text></svg>`,
  )}`;

export const products: Product[] = [
  {
    code: 'XE4WD',
    name: 'Xe điều khiển địa hình 4WD tỉ lệ 1:16',
    category: 'Xe điều khiển',
    brand: 'Sugami',
    ageMin: 8,
    material: 'Nhựa ABS',
    battery: 'Pin sạc 7.4V',
    image: img('🚙', 20),
    status: 'active',
    channels: { shopee: 'synced', tiktok: 'synced' },
    source: { platform: '1688', shop: 'Shantou Toys Factory', priceCny: 6850 },
    variants: [
      { sku: 'XE4WD-DO', options: ['Đỏ'], price: 459000, cost: 287000, stock: 14, minStock: 5 },
      { sku: 'XE4WD-XANH', options: ['Xanh'], price: 459000, cost: 287000, stock: 3, minStock: 5 },
    ],
  },
  {
    code: 'LEGO-CITY',
    name: 'Bộ lắp ráp thành phố 520 chi tiết',
    category: 'Lắp ráp',
    brand: 'Sembo',
    ageMin: 6,
    material: 'Nhựa ABS',
    image: img('🧱', 45),
    status: 'active',
    channels: { shopee: 'synced', tiktok: 'pending' },
    source: { platform: 'Taobao', shop: 'Sembo旗舰店', priceCny: 12900 },
    variants: [{ sku: 'LEGO-CITY', options: [], price: 389000, cost: 241000, stock: 22, minStock: 6 }],
  },
  {
    code: 'GAU-BONG',
    name: 'Gấu bông Capybara mềm mịn',
    category: 'Thú bông',
    brand: 'No brand',
    ageMin: 0,
    material: 'Bông PP, vải nhung',
    image: img('🧸', 30),
    status: 'active',
    channels: { shopee: 'synced', tiktok: 'error' },
    source: { platform: '1688', shop: 'Yangzhou Plush', priceCny: 1850 },
    variants: [
      { sku: 'GAU-BONG-25', options: ['25cm'], price: 129000, cost: 61000, stock: 40, minStock: 10 },
      { sku: 'GAU-BONG-40', options: ['40cm'], price: 199000, cost: 98000, stock: 0, minStock: 8 },
    ],
  },
  {
    code: 'SLIME-KIT',
    name: 'Bộ làm slime 24 màu kèm phụ kiện',
    category: 'Sáng tạo',
    brand: 'No brand',
    ageMin: 6,
    material: 'Keo PVA, phụ gia an toàn',
    image: img('🎨', 300),
    status: 'active',
    channels: { shopee: 'synced' },
    source: { platform: '1688', shop: 'Yiwu Craft', priceCny: 2400 },
    variants: [{ sku: 'SLIME-KIT', options: [], price: 149000, cost: 78000, stock: 7, minStock: 10 }],
  },
  {
    code: 'ROBOT-BIEN-HINH',
    name: 'Robot biến hình thành ô tô có đèn nhạc',
    category: 'Robot',
    brand: 'No brand',
    ageMin: 3,
    material: 'Nhựa ABS',
    battery: '3 pin AA (không kèm)',
    image: img('🤖', 210),
    status: 'draft',
    channels: {},
    source: { platform: 'Taobao', shop: '变形玩具店', priceCny: 3990 },
    variants: [
      { sku: 'ROBOT-BH-DO', options: ['Đỏ'], price: 219000, cost: 0, stock: 0, minStock: 5 },
      { sku: 'ROBOT-BH-VANG', options: ['Vàng'], price: 219000, cost: 0, stock: 0, minStock: 5 },
    ],
  },
];

export const salesByDay = [
  { day: 'T2', shopee: 1250000, tiktok: 640000 },
  { day: 'T3', shopee: 890000, tiktok: 1120000 },
  { day: 'T4', shopee: 1540000, tiktok: 380000 },
  { day: 'T5', shopee: 720000, tiktok: 910000 },
  { day: 'T6', shopee: 1980000, tiktok: 1460000 },
  { day: 'T7', shopee: 2310000, tiktok: 1720000 },
  { day: 'CN', shopee: 1670000, tiktok: 1290000 },
];

export const todo = [
  { label: 'Đơn chờ đóng gói', count: 4, href: '#', tone: 'brand' },
  { label: 'SKU sắp hết hàng', count: 3, href: '/products?filter=low', tone: 'warn' },
  { label: 'Kiện hàng đã về VN, chờ nhận', count: 2, href: '/inventory/receive', tone: 'brand' },
  { label: 'Lỗi đồng bộ TikTok', count: 1, href: '#', tone: 'danger' },
  { label: 'Sản phẩm thiếu ảnh chuẩn sàn', count: 5, href: '/media', tone: 'warn' },
] as const;

export interface ParcelLine {
  sku: string;
  name: string;
  expected: number;
  image: string;
}

export const parcel = {
  code: 'KIEN-2611-03',
  forwarder: 'Vận chuyển Hải Phòng',
  cnTracking: 'YT7458123690',
  weightKg: 12.4,
  po: 'PO-2026-018',
  lines: [
    { sku: 'XE4WD-DO', name: 'Xe 4WD - Đỏ', expected: 10, image: products[0]!.image },
    { sku: 'XE4WD-XANH', name: 'Xe 4WD - Xanh', expected: 10, image: products[0]!.image },
    { sku: 'SLIME-KIT', name: 'Bộ làm slime 24 màu', expected: 20, image: products[3]!.image },
  ] satisfies ParcelLine[],
};

export interface MediaAsset {
  id: string;
  name: string;
  sku?: string;
  tags: string[];
  width: number;
  height: number;
  image: string;
}

export const media: MediaAsset[] = products.flatMap((p, i) =>
  [0, 1, 2].map((k) => ({
    id: `${p.code}-${k}`,
    name: `${p.variants[0]!.sku}_0${k + 1}.jpg`,
    sku: k === 2 && i === 4 ? undefined : p.variants[0]!.sku,
    tags: k === 0 ? ['ảnh chính'] : ['gallery'],
    width: k === 1 && i === 2 ? 640 : 1000,
    height: k === 1 && i === 2 ? 480 : 1000,
    image: p.image,
  })),
);
