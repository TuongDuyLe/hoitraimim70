export type Role = "admin" | "cashier" | "sales" | "drinks" | "seller";
export type Department = "food" | "handmade" | "drinks";
export type PreparationStatus = "queued" | "preparing" | "ready" | "delivered";
export interface User {
  id: string;
  name: string;
  username: string;
  email?: string | null;
  role: Role;
  sellerId: string | null;
}
export interface Seller {
  id: string;
  name: string;
  description: string;
  color: string;
  active: boolean;
}
export interface Product {
  id: string;
  sellerId: string;
  name: string;
  category: string;
  price: number;
  stock: number | null;
  emoji: string;
  color: string;
  active: boolean;
  department?: Department;
}
export interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  trackedStock?: boolean;
  department?: Department;
  sellerId?: string;
  sellerName?: string;
}
export interface Order {
  id: string;
  code: string;
  sellerId: string | null;
  sellerName: string;
  customerName: string;
  note: string;
  items: OrderItem[];
  total: number;
  paymentMethod: "cash" | "transfer";
  paymentStatus: "pending" | "paid" | "cancelled";
  cashReceived: number | null;
  createdAt: string;
  paidAt: string | null;
  paymentSource: "cash" | "manual" | "vietqr" | null;
  bankDetails: Omit<Settings, "eventName"> | null;
  fulfillmentStatus?: "none" | PreparationStatus;
}
export interface ManagedUser extends User { active: boolean; }
export interface PreparationTask {
  id: string;
  orderId: string;
  department: Department;
  status: PreparationStatus;
  items: OrderItem[];
  orderCode: string;
  customerName: string;
  note: string;
  createdAt: string;
  updatedAt: string;
  updatedByName?: string | null;
}
export interface OrderMessage {
  id: string;
  orderId: string;
  department: Department | null;
  authorId: string;
  authorName: string;
  role: Role;
  message: string;
  createdAt: string;
}
export interface Settings {
  eventName: string;
  bankBin: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
}
