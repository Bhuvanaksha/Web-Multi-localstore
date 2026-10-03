import ExcelJS from 'exceljs';

export interface OrderRow {
  id: string;
  createdAt?: Date | string;
  customerName: string;
  customerEmail: string;
  itemsSummary: string;
  totalPrice: number;
  status: string;
  paymentMethod?: string;
  paymentStatus: string;
  note?: string;
  deliverySummary?: string;
}

/** Maps serialized orders (with customer info) to flat spreadsheet rows. */
export function toOrderRows(orders: unknown[]): OrderRow[] {
  return orders.map((raw) => {
    const order = raw as Record<string, unknown>;
    const items = (order.items as Array<Record<string, unknown>>) ?? [];
    const customer = (order.customer ?? {}) as Record<string, unknown>;
    return {
      id: (order.id as string) ?? '',
      createdAt: order.createdAt as Date | undefined,
      customerName: (customer.name as string) ?? 'Unknown',
      customerEmail: (customer.email as string) ?? '',
      itemsSummary: items
        .map((i) => `${i.title} × ${i.quantity}${i.unit ? ` ${i.unit}` : ''}`)
        .join('; '),
      totalPrice: (order.totalPrice as number) ?? 0,
      status: (order.status as string) ?? '',
      paymentMethod: (order.paymentMethod as string | undefined) ?? '',
      paymentStatus: (order.paymentStatus as string) ?? '',
      note: (order.note as string | undefined) ?? '',
      deliverySummary: formatDelivery(order.delivery),
    };
  });
}

function formatDelivery(delivery?: unknown): string {
  if (!delivery) return '';
  const d = delivery as Record<string, unknown>;
  const parts = [
    d.fullName,
    d.addressLine1,
    d.addressLine2,
    d.city,
    d.state,
    d.pincode,
    d.phone ? `Ph: ${d.phone}` : '',
  ].filter((p) => typeof p === 'string' && p.length > 0);
  return parts.join(', ');
}

/** Builds a workbook (buffer) with one row per order. */
export async function buildOrdersWorkbook(rows: OrderRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Orders');
  const data = rows.map((r) => ({
    'Order ID': r.id,
    'Placed At': r.createdAt ? new Date(r.createdAt).toLocaleString() : '',
    Customer: r.customerName,
    Email: r.customerEmail,
    Items: r.itemsSummary,
    'Total (INR)': `₹ ${r.totalPrice}`,
    Status: r.status,
    'Payment Method': r.paymentMethod,
    'Payment Status': r.paymentStatus,
    'Delivery Address': r.deliverySummary,
    Note: r.note,
  }));
  const headers = data.length > 0 ? Object.keys(data[0]) : ['(empty)'];
  ws.columns = headers.map((h) => ({ header: h, key: h, width: Math.max(h.length + 2, 14) }));
  ws.addRows(data);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
