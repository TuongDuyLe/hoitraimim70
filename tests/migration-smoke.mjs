// Real PostgreSQL syntax/state smoke through PGlite. Install it in a scratch
// directory, then pass --deps=<scratch-directory>; production has no PGlite dependency.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const deps = process.argv.find((argument) => argument.startsWith("--deps="))?.slice(7);
const require = createRequire(deps ? resolve(deps, "package.json") : import.meta.url);
const { PGlite } = require("@electric-sql/pglite");
const bcrypt = createRequire(new URL("../package.json", import.meta.url))("bcryptjs");
const file = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [legacy, schema, upgrade, payments] = await Promise.all([
  file("./fixtures/legacy-schema.sql"), file("../database/schema.sql"),
  file("../database/upgrade-v2.sql"), file("../database/payments-v2.sql"),
]);
const id = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const preservedPassword = "MigrationPassword123!";
const preservedHash = bcrypt.hashSync(preservedPassword, 4);
const snapshotItems = [
  { productId: id(201), name: "Cookie giá cũ", quantity: 2, price: 10000, trackedStock: true },
  { productId: id(202), name: "Trà đào giá cũ", quantity: 2, price: 15000, trackedStock: true },
];
async function seed(db) {
  await db.query("INSERT INTO sellers(id,name) VALUES ($1,'Bánh + đồ thủ công'),($2,'Nước uống')", [id(101), id(102)]);
  await db.query("INSERT INTO users(id,username,name,password_hash,role,seller_id) VALUES ($1,'admin_legacy','Admin',$3,'admin',NULL),($2,'seller_legacy','Seller',$3,'seller',$4)", [id(1), id(2), preservedHash, id(101)]);
  await db.query("INSERT INTO sessions(id,user_id,expires_at) VALUES ($1,$2,'2099-01-01')", [id(99), id(2)]);
  // Catalog prices differ from old order prices: migration must keep snapshots.
  await db.query("INSERT INTO products(id,seller_id,name,category,price,stock) VALUES ($1,$2,'Cookie mới','Bánh',18000,8),($3,$4,'Trà đào mới','Đồ uống',25000,18),($5,$2,'Vòng tay','Handmade',45000,9)", [id(201), id(101), id(202), id(102), id(203)]);
  await db.query("UPDATE settings SET event_name='Trại cũ',bank_bin='970422',account_number='123456789',account_name='TEST ONLY' WHERE id=1");
  const examples = [
    { number: 301, code: "LEGACYPAID", method: "cash", status: "paid", total: 50000, cash: 60000, source: "cash", items: snapshotItems },
    { number: 302, code: "LEGACYPENDING", method: "transfer", status: "pending", total: 30000, cash: null, source: null, items: [{ productId: id(203), name: "Vòng tay cũ", quantity: 1, price: 30000, trackedStock: true, department: "handmade", sellerId: null }] },
    // Removed/null product and seller metadata are inferred from snapshots.
    { number: 303, code: "LEGACYREMOVED", method: "transfer", status: "paid", total: 12000, cash: null, source: "manual", items: [{ productId: id(999), name: "Nước cam", quantity: 1, price: 12000, department: null, sellerId: null, sellerName: null }] },
    { number: 304, code: "LEGACYCANCELLED", method: "transfer", status: "cancelled", total: 10000, cash: null, source: null, items: [{ productId: id(201), name: "Cookie", quantity: 1, price: 10000 }] },
  ];
  for (const entry of examples) await db.query(
    "INSERT INTO orders(id,code,seller_id,seller_name,customer_name,note,items,total,payment_method,payment_status,cash_received,payment_source,created_by,confirmed_by,idempotency_key,request_hash,paid_at,cancelled_at) VALUES ($1,$2,$3,'Gian cũ','Khách cũ','Ghi chú cũ',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
    [id(entry.number), entry.code, id(101), JSON.stringify(entry.items), entry.total, entry.method, entry.status, entry.cash, entry.source, id(2), entry.status === "paid" ? id(2) : null, `legacy-key-${entry.number}`, "0".repeat(64), entry.status === "paid" ? "2026-01-01T12:00:00Z" : null, entry.status === "cancelled" ? "2026-01-02T12:00:00Z" : null],
  );
  await db.query("INSERT INTO order_audit(id,order_id,actor_id,action,details) VALUES ($1,$2,$3,'created',$4)", [id(401), id(301), id(2), JSON.stringify({ old: true })]);
}
const rows = async (db, sql, params = []) => (await db.query(sql, params)).rows;
async function migrate(db) {
  await db.exec("BEGIN");
  try { await db.exec(schema); await db.exec(upgrade); await db.exec(payments); await db.exec("COMMIT"); }
  catch (error) { await db.exec("ROLLBACK"); throw error; }
}
async function verify(label, originalSchema) {
  const db = new PGlite();
  try {
    await db.exec(originalSchema);
    await seed(db);
    const before = await rows(db, "SELECT id,code,items,total,payment_method,payment_status,cash_received,payment_source,paid_at,created_at,confirmed_by FROM orders ORDER BY id");
    const stock = await rows(db, "SELECT id,stock,price FROM products ORDER BY id");
    await migrate(db);
    const first = await rows(db, "SELECT * FROM preparation_tasks ORDER BY id");
    assert.equal(first.length, 3, "only paid orders dispatch: two mixed tasks + one removed-product task");
    assert.deepEqual(first.map((entry) => [entry.order_id, entry.department]).sort(), [[id(301), "drinks"], [id(301), "food"], [id(303), "drinks"]].sort());
    await db.query("INSERT INTO orders(id,code,seller_id,seller_name,items,total,payment_method,payment_status,created_by,idempotency_key,request_hash) VALUES ($1,'MIXEDNEW',NULL,'Nhiều gian hàng',$2,50000,'transfer','pending',$3,'mixed-new-key',$4)", [id(305), JSON.stringify(snapshotItems), id(1), "1".repeat(64)]);
    await db.query("INSERT INTO payment_requests(id,order_id,environment,reference,content,amount,bank_code,bank_account,bank_name,account_name) VALUES ($1,$2,'sandbox','0123456789012','HT0123456789012',30000,'MB','123456789','MB','TEST')", [id(701), id(302)]);
    await db.query("INSERT INTO payment_receipts(id,environment,transaction_id,reference_number,order_id,provider_order_id,bank_account,amount,transaction_type,transaction_time,payload,payload_hash,status) VALUES ($1,'sandbox','preserved-transaction','preserved-reference',$2,'provider-order','123456789',12000,'C','2026-01-01T12:00:00Z',$3,$4,'confirmed')", [id(702), id(303), JSON.stringify({ preserved: true }), "2".repeat(64)]);
    const receiptBefore = await rows(db, "SELECT * FROM payment_receipts ORDER BY id");
    const requestBefore = await rows(db, "SELECT * FROM payment_requests ORDER BY id");
    await db.query("UPDATE preparation_tasks SET status='preparing' WHERE order_id=$1 AND department='food'", [id(301)]);
    await migrate(db);
    const second = await rows(db, "SELECT * FROM preparation_tasks ORDER BY id");
    assert.equal(second.length, first.length);
    assert.deepEqual(second.map((entry) => entry.id), first.map((entry) => entry.id));
    assert.equal(second.find((entry) => entry.order_id === id(301) && entry.department === "food").status, "preparing", "rerun preserves task progress");
    assert.deepEqual(await rows(db, "SELECT * FROM payment_receipts ORDER BY id"), receiptBefore);
    assert.deepEqual(await rows(db, "SELECT * FROM payment_requests ORDER BY id"), requestBefore);
    const after = await rows(db, "SELECT id,code,items,total,payment_method,payment_status,cash_received,payment_source,paid_at,created_at,confirmed_by FROM orders ORDER BY id");
    assert.equal(after.length, before.length + 1);
    const currentLegacy = after.filter((entry) => entry.id !== id(305));
    for (let index = 0; index < before.length; index++) {
      const { items: priorItems, ...priorOrder } = before[index];
      const { items: currentItems, ...currentOrder } = currentLegacy[index];
      assert.deepEqual(currentOrder, priorOrder, "migration preserves order money, dates and actors");
      assert.deepEqual(currentItems.map(({ department: _department, sellerId: _seller, sellerName: _name, ...item }) => item), priorItems.map(({ department: _department, sellerId: _seller, sellerName: _name, ...item }) => item));
      assert.ok(currentItems.every((item) => ["food", "handmade", "drinks"].includes(item.department)));
      assert.ok(currentItems.every((item) => item.sellerId && item.sellerName), "backfills stall metadata even when department already exists");
    }
    assert.deepEqual(await rows(db, "SELECT id,stock,price FROM products ORDER BY id"), stock);
    assert.deepEqual((await rows(db, "SELECT department FROM products ORDER BY id")).map((entry) => entry.department), ["food", "drinks", "handmade"]);
    assert.ok((await rows(db, "SELECT password_hash FROM users")).every((entry) => entry.password_hash === preservedHash && bcrypt.compareSync(preservedPassword, entry.password_hash)));
    assert.equal((await rows(db, "SELECT * FROM sessions")).length, 1);
    assert.deepEqual((await rows(db, "SELECT details FROM order_audit"))[0].details, { old: true });
    assert.equal((await rows(db, "SELECT account_number FROM settings"))[0].account_number, "123456789");
    assert.equal((await rows(db, "SELECT fulfillment_status FROM orders WHERE id=$1", [id(301)]))[0].fulfillment_status, "preparing");
    assert.equal((await rows(db, "SELECT fulfillment_status FROM orders WHERE id=$1", [id(302)]))[0].fulfillment_status, "none");
    const removed = after.find((entry) => entry.id === id(303)).items[0];
    assert.equal(removed.department, "drinks"); assert.equal(removed.sellerId, id(101)); assert.equal(removed.sellerName, "Gian cũ");
    const migratedMixed = (await rows(db, "SELECT seller_id,items,fulfillment_status FROM orders WHERE id=$1", [id(305)]))[0];
    assert.equal(migratedMixed.seller_id, null);
    assert.equal(migratedMixed.fulfillment_status, "none");
    assert.deepEqual(migratedMixed.items.map((item) => item.sellerId), [id(101), id(102)]);
    assert.deepEqual(migratedMixed.items.map((item) => item.department), ["food", "drinks"]);
    // Validate current constraints with PostgreSQL, including nullable mixed orders.
    for (const [index, role] of ["cashier", "sales", "drinks"].entries()) await db.query("INSERT INTO users(id,username,name,password_hash,role) VALUES ($1,$2,'Staff',$3,$4)", [id(500 + index), role, preservedHash, role]);
    await assert.rejects(db.query("INSERT INTO users(id,username,name,password_hash,role) VALUES ($1,'bad_seller','Bad',$2,'seller')", [id(510), preservedHash]), /users_check/);
    await assert.rejects(db.query("INSERT INTO users(id,username,name,password_hash,role) VALUES ($1,'bad_role','Bad',$2,'guest')", [id(511), preservedHash]), /users_role_check/);
    await assert.rejects(db.query("UPDATE products SET department='invalid' WHERE id=$1", [id(201)]), /products_department_check/);
    await assert.rejects(db.query("UPDATE orders SET fulfillment_status='invalid' WHERE id=$1", [id(301)]), /orders_fulfillment_status_check/);
    await db.query("UPDATE orders SET payment_source='vietqr' WHERE id=$1", [id(305)]);
    await db.query("INSERT INTO order_messages(id,order_id,author_id,author_name,author_role,message) VALUES ($1,$2,$3,'Thu ngân','cashier','Chung cho các ban')", [id(601), id(305), id(500)]);
    await assert.rejects(db.query("INSERT INTO payment_requests(id,order_id,environment,reference,content,amount,bank_code,bank_account,bank_name,account_name) VALUES ($1,$2,'sandbox','0123456789012','OTHER',50000,'MB','123456789','MB','TEST')", [id(703), id(305)]), /unique constraint/);
    const indexes = await rows(db, "SELECT indexname FROM pg_indexes WHERE schemaname='public'");
    for (const name of ["sessions_user_idx", "products_seller_idx", "orders_seller_date_idx", "order_audit_order_idx", "preparation_department_status_idx", "messages_order_created_idx", "payment_receipts_order_idx", "payment_receipts_review_idx"]) assert.ok(indexes.some((entry) => entry.indexname === name), name);
    console.log(`${label}: passed; preserved 4 legacy orders + nullable mixed order, 2 hashes, session, inventory, audit and payment evidence; 3 preparation tasks; repeat migration retained progress; RBAC/payment constraints and indexes checked.`);
  } finally { await db.close(); }
}
await verify("Legacy schema → repeated upgrade", legacy);
await verify("Fresh schema → repeated upgrade", schema);
