import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { PoolClient } from "pg";
import type { z } from "zod";
import { requireAdmin } from "./auth";
import { getPool, transaction } from "./db";
import { HttpError } from "./errors";
import { mapManagedUser } from "./mappers";
import type { Role, User } from "./types";
import { userPatchSchema, userSchema } from "./validation";

async function requireValidSeller(db: PoolClient, role: Role, sellerId: string | null) {
  if (role !== "seller") {
    if (sellerId) throw new HttpError(400, "Tài khoản tiểu ban không gắn gian hàng.", "INVALID_SELLER_SCOPE");
    return;
  }
  if (!sellerId || !(await db.query("SELECT id FROM sellers WHERE id=$1 AND active=true FOR SHARE", [sellerId])).rows[0]) throw new HttpError(400, "Người bán cần gian hàng đang hoạt động.", "INVALID_SELLER_SCOPE");
}
export async function listUsers(user: User) {
  requireAdmin(user);
  return (await getPool().query("SELECT * FROM users ORDER BY created_at,id")).rows.map(mapManagedUser);
}
export async function createUser(user: User, input: z.infer<typeof userSchema>) {
  requireAdmin(user);
  const passwordHash = await bcrypt.hash(input.password, 12);
  return transaction(async (db) => {
    await requireValidSeller(db, input.role, input.sellerId ?? null);
    const row = (await db.query("INSERT INTO users(id,username,name,email,password_hash,role,seller_id,active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *", [randomUUID(), input.username, input.name, input.email ?? null, passwordHash, input.role, input.sellerId ?? null, input.active])).rows[0];
    return mapManagedUser(row);
  });
}
export async function updateUser(user: User, id: string, input: z.infer<typeof userPatchSchema>) {
  requireAdmin(user);
  const passwordHash = input.password ? await bcrypt.hash(input.password, 12) : undefined;
  return transaction(async (db) => {
    // Serialize role/active edits so concurrent admin edits cannot remove every admin.
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["users:admin-policy"]);
    const row = (await db.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (!row) throw new HttpError(404, "Không tìm thấy tài khoản.", "NOT_FOUND");
    const merged = { ...mapManagedUser(row), ...input };
    const sellerId = merged.role === "seller" ? merged.sellerId : null;
    if (input.sellerId && merged.role !== "seller") throw new HttpError(400, "Tài khoản tiểu ban không gắn gian hàng.", "INVALID_SELLER_SCOPE");
    await requireValidSeller(db, merged.role, sellerId);
    if (id === user.id && (!merged.active || merged.role !== "admin")) throw new HttpError(409, "Không thể tự khóa hoặc hạ quyền quản trị của tài khoản đang đăng nhập.", "SELF_ADMIN_LOCKOUT");
    if (row.role === "admin" && row.active && (!merged.active || merged.role !== "admin")) {
      const others = await db.query("SELECT id FROM users WHERE role='admin' AND active=true AND id<>$1", [id]);
      if (!others.rows.length) throw new HttpError(409, "Phải giữ ít nhất một quản trị viên đang hoạt động.", "LAST_ADMIN");
    }
    const updated = (await db.query("UPDATE users SET username=$1,name=$2,email=$3,password_hash=$4,role=$5,seller_id=$6,active=$7 WHERE id=$8 RETURNING *", [merged.username, merged.name, merged.email ?? null, passwordHash ?? row.password_hash, merged.role, sellerId, merged.active, id])).rows[0];
    if (passwordHash || row.role !== merged.role || row.seller_id !== sellerId || row.active !== merged.active || row.username !== merged.username) await db.query("DELETE FROM sessions WHERE user_id=$1", [id]);
    return mapManagedUser(updated);
  });
}
