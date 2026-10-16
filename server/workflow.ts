import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { z } from "zod";
import { requireOrderScope } from "./auth";
import { transaction } from "./db";
import { inferDepartment } from "./domain";
import { HttpError } from "./errors";
import { mapMessage, mapPreparation } from "./mappers";
import type { Department, Order, OrderItem, PreparationStatus, User } from "./types";
import { messageSchema, preparationSchema } from "./validation";

export function preparationDepartments(user: User): Department[] {
  return user.role === "sales" ? ["food", "handmade"] : user.role === "drinks" ? ["drinks"] : [];
}
export function isPreparationUser(user: User) {
  return user.role === "sales" || user.role === "drinks";
}
export function projectPreparationOrder(user: User, order: Order): Order {
  if (!isPreparationUser(user)) return order;
  const departments = preparationDepartments(user);
  return {
    ...order, items: order.items.filter((item) => departments.includes(inferDepartment(item))).map((item) => ({ ...item, price: 0 })),
    total: 0, bankDetails: null, cashReceived: null, paymentSource: null,
  };
}

// Called inside the payment transaction; order locks and the unique constraint
// keep repeated cashier confirmations from dispatching the same task twice.
export async function ensurePreparationTasks(db: PoolClient, orderRow: any): Promise<void> {
  if (orderRow.payment_status !== "paid") return;
  const items: OrderItem[] = orderRow.items;
  for (const department of ["food", "handmade", "drinks"] as const) {
    const selected = items.filter((item) => inferDepartment(item) === department).map((item) => ({ ...item, department }));
    if (!selected.length) continue;
    await db.query(
      "INSERT INTO preparation_tasks(id,order_id,department,items,order_code,customer_name,note) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(order_id,department) DO NOTHING",
      [randomUUID(), orderRow.id, department, JSON.stringify(selected), orderRow.code, orderRow.customer_name, orderRow.note],
    );
  }
  await refreshFulfillment(db, orderRow.id);
}
async function refreshFulfillment(db: PoolClient, orderId: string) {
  const { rows } = await db.query("SELECT status FROM preparation_tasks WHERE order_id=$1", [orderId]);
  const status = aggregateFulfillment(rows.map((row) => row.status));
  await db.query("UPDATE orders SET fulfillment_status=$1 WHERE id=$2", [status, orderId]);
}
export function aggregateFulfillment(statuses: PreparationStatus[]): "none" | PreparationStatus {
  if (!statuses.length) return "none";
  if (statuses.every((status) => status === "delivered")) return "delivered";
  if (statuses.every((status) => status === "ready" || status === "delivered")) return "ready";
  if (statuses.some((status) => status !== "queued")) return "preparing";
  return "queued";
}
export function requirePreparationTransition(user: User, department: Department, current: PreparationStatus, next: PreparationStatus, sellerId: string | null) {
  if (isPreparationUser(user)) {
    if (!preparationDepartments(user).includes(department)) throw new HttpError(403, "Đơn không thuộc tiểu ban của bạn.", "FORBIDDEN");
    if (next !== "preparing" && next !== "ready") throw new HttpError(403, "Thu ngân phụ trách xác nhận giao đơn cho khách.", "FORBIDDEN");
  } else {
    requireOrderScope(user, sellerId);
    if (user.role === "cashier" && next !== "delivered") throw new HttpError(403, "Tiểu ban phụ trách xác nhận chuẩn bị món.", "FORBIDDEN");
  }
  if (current === next) return;
  const following: Record<PreparationStatus, PreparationStatus | null> = { queued: "preparing", preparing: "ready", ready: "delivered", delivered: null };
  if (following[current] !== next) throw new HttpError(409, "Trạng thái đơn đã thay đổi hoặc bước xử lý không hợp lệ. Hãy tải lại danh sách.", "INVALID_TRANSITION");
}
export async function updatePreparation(user: User, id: string, input: z.infer<typeof preparationSchema>) {
  return transaction(async (db) => {
    const candidate = (await db.query("SELECT order_id FROM preparation_tasks WHERE id=$1", [id])).rows[0];
    if (!candidate) throw new HttpError(404, "Không tìm thấy phiếu chuẩn bị.", "NOT_FOUND");
    // Same locking order as payment dispatch: order first, then task.
    const order = (await db.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [candidate.order_id])).rows[0];
    const row = (await db.query("SELECT * FROM preparation_tasks WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (!order || order.payment_status !== "paid") throw new HttpError(409, "Chỉ xử lý đơn đã thanh toán.", "ORDER_NOT_PAID");
    requirePreparationTransition(user, row.department, row.status, input.status, order.seller_id);
    if (row.status === input.status) return redactTask(user, mapPreparation(row));
    const updated = (await db.query("UPDATE preparation_tasks SET status=$1,updated_at=now(),updated_by=$2,updated_by_name=$3 WHERE id=$4 RETURNING *", [input.status, user.id, user.name, id])).rows[0];
    await refreshFulfillment(db, order.id);
    await db.query("INSERT INTO order_audit(id,order_id,actor_id,action,details) VALUES ($1,$2,$3,'preparation_updated',$4)", [randomUUID(), order.id, user.id, JSON.stringify({ department: row.department, before: row.status, after: input.status })]);
    return redactTask(user, mapPreparation(updated));
  });
}
export function redactTask(user: User, task: ReturnType<typeof mapPreparation>) {
  return isPreparationUser(user) ? { ...task, items: task.items.map((item) => ({ ...item, price: 0 })) } : task;
}
export async function addOrderMessage(user: User, orderId: string, input: z.infer<typeof messageSchema>) {
  return transaction(async (db) => {
    const order = (await db.query("SELECT * FROM orders WHERE id=$1 FOR SHARE", [orderId])).rows[0];
    if (!order) throw new HttpError(404, "Không tìm thấy đơn.", "NOT_FOUND");
    const departments = [...new Set((order.items as OrderItem[]).map(inferDepartment))];
    const department = input.department ?? null;
    if (isPreparationUser(user)) {
      const allowed = preparationDepartments(user);
      if (order.payment_status !== "paid" || !departments.some((entry) => allowed.includes(entry)) || (department !== null && !allowed.includes(department))) {
        throw new HttpError(403, "Bạn không có quyền trao đổi về đơn này.", "FORBIDDEN");
      }
    } else requireOrderScope(user, order.seller_id);
    if (department !== null && !departments.includes(department)) throw new HttpError(400, "Đơn không có món thuộc tiểu ban này.", "INVALID_DEPARTMENT");
    const row = (await db.query("INSERT INTO order_messages(id,order_id,department,author_id,author_name,author_role,message) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *", [randomUUID(), orderId, department, user.id, user.name, user.role, input.message])).rows[0];
    return mapMessage(row);
  });
}
