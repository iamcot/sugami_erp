import { redirect } from 'next/navigation';

/** Stock now lives on the products page (stock columns, cards, receipts and stocktake buttons). */
export default function InventoryPage() {
  redirect('/products');
}
