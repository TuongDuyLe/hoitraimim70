import type { ManagedUser, Order, OrderMessage, PreparationTask, Product, Seller, Settings, User } from "./types";
import { inferDepartment } from "./domain";
type Row = Record<string, any>;
export const mapUser = (row: Row): User => ({
  id: row.id,
  name: row.name,
  username: row.username,
  email: row.email ?? null,
  role: row.role,
  sellerId: row.seller_id,
});
export const mapSeller = (row: Row): Seller => ({
  id: row.id,
  name: row.name,
  description: row.description,
  color: row.color,
  active: row.active,
});
export const mapManagedUser = (row: Row): ManagedUser => ({ ...mapUser(row), active: row.active });
export const mapProduct = (row: Row): Product => ({
  id: row.id,
  sellerId: row.seller_id,
  name: row.name,
  category: row.category,
  price: Number(row.price),
  stock: row.stock === null ? null : Number(row.stock),
  emoji: row.emoji,
  color: row.color,
  active: row.active,
  department: inferDepartment({ department: row.department, category: row.category, name: row.name }),
});
export const mapSettings = (row: Row): Settings => ({
  eventName: row.event_name,
  bankBin: row.bank_bin,
  bankName: row.bank_name,
  accountNumber: row.account_number,
  accountName: row.account_name,
});
export const mapOrder = (row: Row): Order => ({
  id: row.id,
  code: row.code,
  sellerId: row.seller_id,
  sellerName: row.seller_name,
  customerName: row.customer_name,
  note: row.note,
  items: row.items.map(({ trackedStock: _tracked, ...item }: Row) => item),
  total: Number(row.total),
  paymentMethod: row.payment_method,
  paymentStatus: row.payment_status,
  cashReceived: row.cash_received === null ? null : Number(row.cash_received),
  createdAt: new Date(row.created_at).toISOString(),
  paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
  paymentSource: row.payment_source,
  bankDetails: row.bank_details ?? null,
  fulfillmentStatus: row.fulfillment_status ?? "none",
});
export const mapPreparation = (row: Row): PreparationTask => ({
  id: row.id, orderId: row.order_id, department: row.department,
  status: row.status, items: row.items.map(({ trackedStock: _tracked, ...item }: Row) => item),
  orderCode: row.order_code, customerName: row.customer_name, note: row.note,
  createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(),
  updatedByName: row.updated_by_name ?? null,
});
export const mapMessage = (row: Row): OrderMessage => ({
  id: row.id, orderId: row.order_id, department: row.department ?? null,
  authorId: row.author_id, authorName: row.author_name, role: row.author_role,
  message: row.message, createdAt: new Date(row.created_at).toISOString(),
});
