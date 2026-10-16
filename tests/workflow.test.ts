import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DataType, newDb } from "pg-mem";
import type { Pool } from "pg";
import { currentUser, login } from "../server/auth";
import { bootstrap, createProduct, updateSettings } from "../server/catalog";
import { closePool, setPoolForTests } from "../server/db";
import { createOrder, confirmOrder } from "../server/orders";
import type { User } from "../server/types";
import { createUser, listUsers, updateUser } from "../server/users";
import { orderSchema, productSchema, userSchema } from "../server/validation";
import { addOrderMessage, aggregateFulfillment, updatePreparation } from "../server/workflow";
import handler from "../netlify/functions/api";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin: User = { id: id(1), name: "Admin", username: "admin", role: "admin", sellerId: null };
const cashier: User = { id: id(2), name: "Thu ngân", username: "cashier", role: "cashier", sellerId: null };
const sales: User = { id: id(3), name: "Bán hàng", username: "sales", role: "sales", sellerId: null };
const drinks: User = { id: id(4), name: "Nước", username: "drinks", role: "drinks", sellerId: null };
const seller: User = { id: id(5), name: "Người bán", username: "seller", role: "seller", sellerId: id(101) };
let db: Pool;
let hash: string;
const password = "WorkflowPassword123!";
function mixed(paymentMethod: "cash" | "transfer" = "cash") {
  return orderSchema.parse({
    paymentMethod, ...(paymentMethod === "cash" ? { cashReceived: 100000 } : {}),
    items: [{ productId: id(201), quantity: 1 }, { productId: id(202), quantity: 2 }, { productId: id(203), quantity: 1 }],
    idempotencyKey: randomUUID(), note: "Ít đá", customerName: "Bạn A",
  });
}
beforeAll(async () => { hash = await bcrypt.hash(password, 4); });
beforeEach(async () => {
  process.env.JWT_SECRET = "workflow-tests-only-01234567890123456789";
  delete process.env.VIETQR_ENABLED;
  const memory = newDb();
  memory.public.registerFunction({ name: "hashtextextended", args: [DataType.text, DataType.integer], returns: DataType.integer, implementation: () => 1 });
  memory.public.registerFunction({ name: "pg_advisory_xact_lock", args: [DataType.integer], returns: DataType.integer, implementation: () => 1 });
  memory.public.none(await readFile(new URL("../database/schema.sql", import.meta.url), "utf8"));
  const adapter = memory.adapters.createPg();
  db = new adapter.Pool() as unknown as Pool;
  setPoolForTests(db);
  await db.query("INSERT INTO sellers(id,name) VALUES ($1,'Món'),($2,'Nước')", [id(101), id(102)]);
  for (const user of [admin, cashier, sales, drinks, seller]) await db.query("INSERT INTO users(id,username,name,password_hash,role,seller_id) VALUES ($1,$2,$3,$4,$5,$6)", [user.id, user.username, user.name, hash, user.role, user.sellerId]);
  await db.query("INSERT INTO products(id,seller_id,name,category,department,price,stock) VALUES ($1,$2,'Cookie','Bánh','food',20000,10),($3,$2,'Vòng tay','Handmade','handmade',30000,10),($4,$5,'Trà đào','Đồ uống','drinks',15000,20)", [id(201), id(101), id(202), id(203), id(102)]);
  await db.query("UPDATE settings SET bank_bin='970422',account_number='123456789',account_name='TEST' WHERE id=1");
});
afterEach(async () => { delete process.env.VIETQR_ENABLED; await closePool(); });

describe("mixed checkout and paid dispatch", () => {
  it("creates one total, snapshots all stalls/departments and dispatches three tasks once", async () => {
    const request = mixed();
    const order = await createOrder(cashier, request);
    expect(order.total).toBe(95000);
    expect(order.sellerId).toBeNull();
    expect(order.fulfillmentStatus).toBe("queued");
    expect(order.items.map((item) => item.department)).toEqual(["food", "handmade", "drinks"]);
    expect(order.items.every((item) => item.sellerId && item.sellerName)).toBe(true);
    expect((await createOrder(cashier, request)).id).toBe(order.id);
    expect((await db.query("SELECT * FROM preparation_tasks WHERE order_id=$1", [order.id])).rows).toHaveLength(3);
    expect((await db.query("SELECT stock FROM products WHERE id=$1", [id(202)])).rows[0].stock).toBe(8);
  });
  it("waits for verified payment before exposing any preparation task", async () => {
    const order = await createOrder(cashier, mixed("transfer"));
    expect((await bootstrap(sales)).orders).toHaveLength(0);
    expect((await db.query("SELECT * FROM preparation_tasks")).rows).toHaveLength(0);
    await confirmOrder(cashier, order.id);
    await confirmOrder(cashier, order.id);
    expect((await db.query("SELECT * FROM preparation_tasks")).rows).toHaveLength(3);
  });
  it("blocks preparation roles at checkout and preserves the seller stall boundary", async () => {
    await expect(createOrder(sales, mixed())).rejects.toMatchObject({ status: 403 });
    await expect(createOrder(drinks, mixed())).rejects.toMatchObject({ status: 403 });
    await expect(createOrder(seller, mixed())).rejects.toMatchObject({ status: 403 });
    await expect(createOrder(seller, { ...mixed(), sellerId: id(101) })).rejects.toMatchObject({ status: 409 });
  });
  it("rejects inactive stalls even when cashier uses the mixed basket", async () => {
    await db.query("UPDATE sellers SET active=false WHERE id=$1", [id(102)]);
    await expect(createOrder(cashier, mixed())).rejects.toMatchObject({ code: "SELLER_INACTIVE" });
    expect((await db.query("SELECT stock FROM products WHERE id=$1", [id(201)])).rows[0].stock).toBe(10);
  });
  it("allows cashier manual confirmation even when an old VietQR environment flag remains", async () => {
    const order = await createOrder(cashier, mixed("transfer"));
    process.env.VIETQR_ENABLED = "true";
    expect(await confirmOrder(cashier, order.id)).toMatchObject({ paymentStatus: "paid", paymentSource: "manual" });
    const recorded = (await db.query("SELECT confirmed_by,payment_source FROM orders WHERE id=$1", [order.id])).rows[0];
    expect(recorded).toMatchObject({ confirmed_by: cashier.id, payment_source: "manual" });
    await confirmOrder(cashier, order.id);
    expect((await db.query("SELECT * FROM preparation_tasks WHERE order_id=$1", [order.id])).rows).toHaveLength(3);
    expect((await db.query("SELECT * FROM order_audit WHERE order_id=$1 AND action='confirmed'", [order.id])).rows).toHaveLength(1);
  });
  it("keeps removed callback and API-generated QR routes from confirming pending orders", async () => {
    const order = await createOrder(cashier, mixed("transfer"));
    process.env.VIETQR_ENABLED = "true";
    const session = await login(cashier.username, password);
    const paths = ["/api/token_generate", "/.netlify/functions/api/bank/api/transaction-sync", `/api/orders/${order.id}/qr`];
    for (const path of paths) {
      const response = await handler(new Request(`https://camp.test${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: `camp_pos_session=${session.token}` },
        body: JSON.stringify({ amount: order.total, content: order.code, transactionid: "old-callback" }),
      }));
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: "NOT_FOUND" });
    }
    const callback = await handler(new Request("https://camp.test/.netlify/functions/api/bank/api/transaction-sync", {
      method: "POST", headers: { "content-type": "application/json", authorization: "Bearer old-vietqr-token" }, body: "{}",
    }));
    expect(callback.status).toBe(401);
    expect((await db.query("SELECT payment_status,payment_source FROM orders WHERE id=$1", [order.id])).rows[0]).toMatchObject({ payment_status: "pending", payment_source: null });
    expect((await db.query("SELECT * FROM preparation_tasks WHERE order_id=$1", [order.id])).rows).toHaveLength(0);
    const boot = await handler(new Request("https://camp.test/api/bootstrap", { headers: { cookie: `camp_pos_session=${session.token}` } }));
    expect(boot.status).toBe(200);
    expect(await boot.json()).not.toHaveProperty("paymentIntegration");
  });
});
describe("department isolation and acknowledgement", () => {
  it("projects only paid department items and removes money, bank details and accounts", async () => {
    await createOrder(cashier, mixed("transfer"));
    const paid = await createOrder(cashier, mixed());
    const foodView = await bootstrap(sales);
    const drinkView = await bootstrap(drinks);
    expect(foodView.tasks).toHaveLength(2);
    expect(drinkView.tasks).toHaveLength(1);
    expect(drinkView.tasks[0].items.map((item) => item.department)).toEqual(["drinks"]);
    expect(foodView.orders.map((order) => order.id)).toEqual([paid.id]);
    expect(foodView.orders[0].items.map((item) => item.department)).toEqual(["food", "handmade"]);
    expect(foodView.orders[0]).toMatchObject({ total: 0, cashReceived: null, bankDetails: null, paymentSource: null });
    expect(drinkView.tasks[0].items[0].price).toBe(0);
    expect(foodView.settings.accountNumber).toBe("");
    expect(foodView).not.toHaveProperty("users");
  });
  it("enforces ordered preparation transitions and records staff acknowledgements", async () => {
    const order = await createOrder(cashier, mixed());
    const task = (await bootstrap(drinks)).tasks[0];
    await expect(updatePreparation(sales, task.id, { status: "preparing" })).rejects.toMatchObject({ status: 403 });
    await expect(updatePreparation(drinks, task.id, { status: "ready" })).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(updatePreparation(cashier, task.id, { status: "preparing" })).rejects.toMatchObject({ status: 403 });
    expect((await updatePreparation(drinks, task.id, { status: "preparing" })).updatedByName).toBe(drinks.name);
    await updatePreparation(drinks, task.id, { status: "preparing" });
    await updatePreparation(drinks, task.id, { status: "ready" });
    await expect(updatePreparation(drinks, task.id, { status: "delivered" })).rejects.toMatchObject({ status: 403 });
    await updatePreparation(cashier, task.id, { status: "delivered" });
    expect((await bootstrap(cashier)).orders.find((entry) => entry.id === order.id)?.fulfillmentStatus).toBe("preparing");
    expect((await db.query("SELECT * FROM order_audit WHERE action='preparation_updated'")).rows).toHaveLength(3);
  });
  it("marks the whole order ready/delivered only after all departments acknowledge", async () => {
    const order = await createOrder(cashier, mixed());
    const tasks = (await bootstrap(admin)).tasks;
    for (const task of tasks) {
      const actor = task.department === "drinks" ? drinks : sales;
      await updatePreparation(actor, task.id, { status: "preparing" });
      await updatePreparation(actor, task.id, { status: "ready" });
    }
    expect((await db.query("SELECT fulfillment_status FROM orders WHERE id=$1", [order.id])).rows[0].fulfillment_status).toBe("ready");
    for (const task of tasks) await updatePreparation(cashier, task.id, { status: "delivered" });
    expect((await db.query("SELECT fulfillment_status FROM orders WHERE id=$1", [order.id])).rows[0].fulfillment_status).toBe("delivered");
    expect(aggregateFulfillment([])).toBe("none");
  });
  it("routes messages between cashier and each department without exposing another department thread", async () => {
    const order = await createOrder(cashier, mixed());
    await addOrderMessage(cashier, order.id, { department: "drinks", message: "Ít đá nhé" });
    await addOrderMessage(drinks, order.id, { department: "drinks", message: "Đã nhận" });
    await addOrderMessage(cashier, order.id, { department: "food", message: "Gói bánh riêng" });
    await addOrderMessage(cashier, order.id, { message: "Khách đang đợi ở bàn 2" });
    expect((await bootstrap(drinks)).messages.map((message) => message.message)).toEqual(["Ít đá nhé", "Đã nhận", "Khách đang đợi ở bàn 2"]);
    expect((await bootstrap(sales)).messages.map((message) => message.message)).toEqual(["Gói bánh riêng", "Khách đang đợi ở bàn 2"]);
    await expect(addOrderMessage(sales, order.id, { department: "drinks", message: "Wrong" })).rejects.toMatchObject({ status: 403 });
    const pending = await createOrder(cashier, mixed("transfer"));
    await expect(addOrderMessage(drinks, pending.id, { message: "Wrong" })).rejects.toMatchObject({ status: 403 });
  });
});
describe("account permissions and sessions", () => {
  it("allows staff sessions without a seller and revokes sessions after scope changes", async () => {
    const result = await login(cashier.username, password);
    const request = new Request("https://camp.test/api/session", { headers: { cookie: `camp_pos_session=${result.token}` } });
    expect((await currentUser(request)).role).toBe("cashier");
    await updateUser(admin, cashier.id, { role: "drinks" });
    await expect(currentUser(request)).rejects.toMatchObject({ status: 401 });
  });
  it("keeps user management/catalog/settings restricted to their authorized roles", async () => {
    await expect(listUsers(cashier)).rejects.toMatchObject({ status: 403 });
    await expect(updateUser(cashier, cashier.id, { role: "admin" })).rejects.toMatchObject({ status: 403 });
    await expect(createProduct(cashier, productSchema.parse({ sellerId: id(101), name: "Món", category: "Bánh", price: 10000, stock: 1 }))).rejects.toMatchObject({ status: 403 });
    await expect(updateSettings(drinks, { eventName: "Test", bankBin: "", bankName: "", accountNumber: "", accountName: "" })).rejects.toMatchObject({ status: 403 });
    expect((await listUsers(admin)).every((user) => !("password_hash" in user))).toBe(true);
  });
  it("creates a department account and enforces seller association", async () => {
    const created = await createUser(admin, userSchema.parse({ username: "new_drinks", name: "Nước 2", role: "drinks", password }));
    expect(created).toMatchObject({ role: "drinks", sellerId: null, active: true });
    await expect(updateUser(admin, created.id, { role: "seller" })).rejects.toMatchObject({ code: "INVALID_SELLER_SCOPE" });
    expect((await updateUser(admin, created.id, { role: "seller", sellerId: id(101) })).sellerId).toBe(id(101));
    expect((await updateUser(admin, created.id, { role: "sales" })).sellerId).toBeNull();
  });
  it("prevents self/last-admin lockout and revokes a disabled account", async () => {
    await expect(updateUser(admin, admin.id, { active: false })).rejects.toMatchObject({ code: "SELF_ADMIN_LOCKOUT" });
    await expect(updateUser(admin, admin.id, { role: "cashier" })).rejects.toMatchObject({ code: "SELF_ADMIN_LOCKOUT" });
    await expect(updateUser({ ...admin, id: id(999) }, admin.id, { active: false })).rejects.toMatchObject({ code: "LAST_ADMIN" });
    await db.query("INSERT INTO sessions(id,user_id,expires_at) VALUES ($1,$2,$3)", [randomUUID(), sales.id, new Date(Date.now() + 100000)]);
    await updateUser(admin, sales.id, { active: false });
    expect((await db.query("SELECT * FROM sessions WHERE user_id=$1", [sales.id])).rows).toHaveLength(0);
  });
});
