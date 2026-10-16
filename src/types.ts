export type PaymentMethod = "cash" | "transfer";
export type PaymentStatus = "pending" | "paid" | "cancelled";
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
  department?: Department;
  sellerId?: string;
  sellerName?: string;
}

export interface BankDetails {
  bankBin: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
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
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  cashReceived: number | null;
  createdAt: string;
  paidAt: string | null;
  paymentSource?: "cash" | "manual" | "vietqr" | null;
  bankDetails?: BankDetails | null;
  fulfillmentStatus?: "none" | PreparationStatus;
}

export interface Settings extends BankDetails {
  eventName: string;
}

export interface Bootstrap {
  user: User;
  sellers: Seller[];
  products: Product[];
  orders: Order[];
  settings: Settings;
  tasks?: PreparationTask[];
  messages?: OrderMessage[];
  users?: ManagedUser[];
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
