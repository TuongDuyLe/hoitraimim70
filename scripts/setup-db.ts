import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { closePool, transaction } from "../server/db";
import { passwordSchema, usernameSchema } from "../server/validation";

async function main() {
  const username = usernameSchema.parse(process.env.ADMIN_USERNAME);
  const password = passwordSchema.parse(process.env.ADMIN_PASSWORD);
  if (/^(password|admin|changeme|example)/i.test(password))
    throw new Error(
      "ADMIN_PASSWORD phải là mật khẩu riêng, không dùng ví dụ hoặc mặc định.",
    );
  const name = process.env.ADMIN_NAME?.trim() || "Quản trị viên";
  if (name.length > 120) throw new Error("ADMIN_NAME quá dài.");
  const sql = await readFile(
    new URL("../database/schema.sql", import.meta.url),
    "utf8",
  );
  const hash = await bcrypt.hash(password, 12);
  const workflowUpgrade = await readFile(
    new URL("../database/upgrade-v2.sql", import.meta.url),
    "utf8",
  );
  const paymentUpgrade = await readFile(
    new URL("../database/payments-v2.sql", import.meta.url),
    "utf8",
  );
  await transaction(async (db) => {
    await db.query(sql);
    await db.query(workflowUpgrade);
    await db.query(paymentUpgrade);
    const existing = (
      await db.query("SELECT id,role FROM users WHERE username=$1", [username])
    ).rows[0];
    if (existing && existing.role !== "admin")
      throw new Error("Tên ADMIN_USERNAME đang được một người bán sử dụng.");
    if (!existing)
      await db.query(
        "INSERT INTO users(id,username,name,password_hash,role) VALUES ($1,$2,$3,$4,'admin')",
        [randomUUID(), username, name, hash],
      );
    if (process.env.SEED_SAMPLE_DATA === "true") {
      for (const sample of [
        {
          id: "00000000-0000-4000-8000-000000000101",
          name: "Bếp lửa trại",
          description: "Món ngon bên bếp lửa",
          color: "#f97316",
          products: [
            [
              "00000000-0000-4000-8000-000000000201",
              "Bánh mì nướng",
              "Đồ ăn",
              20000,
              "🥖",
            ],
            [
              "00000000-0000-4000-8000-000000000202",
              "Xúc xích nướng",
              "Đồ ăn",
              15000,
              "🌭",
            ],
          ],
        },
        {
          id: "00000000-0000-4000-8000-000000000102",
          name: "Trạm giải khát",
          description: "Một chút mát lành",
          color: "#0d9488",
          products: [
            [
              "00000000-0000-4000-8000-000000000203",
              "Trà đào",
              "Đồ uống",
              25000,
              "🍑",
            ],
            [
              "00000000-0000-4000-8000-000000000204",
              "Nước suối",
              "Đồ uống",
              10000,
              "💧",
            ],
          ],
        },
      ]) {
        await db.query(
          "INSERT INTO sellers(id,name,description,color) VALUES ($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING",
          [sample.id, sample.name, sample.description, sample.color],
        );
        for (const [id, productName, category, price, emoji] of sample.products)
          await db.query(
            "INSERT INTO products(id,seller_id,name,category,price,stock,emoji,color) VALUES ($1,$2,$3,$4,$5,100,$6,$7) ON CONFLICT(id) DO NOTHING",
            [id, sample.id, productName, category, price, emoji, sample.color],
          );
      }
    }
    console.log(
      existing
        ? "Schema đã sẵn sàng. Tài khoản admin hiện có được giữ nguyên."
        : "Schema và tài khoản admin đã được tạo.",
    );
  });
}
main()
  .catch((error) => {
    console.error(
      "Khởi tạo thất bại:",
      error instanceof Error ? error.message : "Lỗi không xác định",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool().catch(() => undefined);
  });
